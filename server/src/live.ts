import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { Db } from "mongodb";
import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { Session, perform, type Action } from "../../mobile/src/game/session";
import { localWinner } from "../../mobile/src/game/localMatch";
import { cueById } from "../../mobile/src/game/cues";
import { venues, levelOf } from "./catalog";
import { crateAwardStage, publicCrate } from "./rewards";
import { ensureHouse, pickHouse, houseTurn, HOUSE, between } from "./house";
import { formSkill, type CpuStyle } from "../../mobile/src/game/cpu";
import { piggyDeposit } from "./store";

/**
 * Online matches: two players, one table, the server as referee.
 *
 * Every action a player sends is played out here on the same engine and rules the phones run,
 * and the resulting table is sent to both. Phones animate the shot themselves (so it starts the
 * instant the cue is released) and then adopt the server's table if their own result drifted,
 * so a modified app can neither move balls nor skip a turn. The server owns the shot clock.
 *
 * ponytail: one process holds every queue and match in memory, and shots are simulated on the
 * main thread (a few milliseconds each). Past a few hundred concurrent tables, move simulation
 * to the referee workers and the queues to a shared store.
 */
export const EMOTES = [
  "Good shot!",
  "Nice try",
  "Well played",
  "Oops!",
  "Thinking…",
  "Good game",
];
export const TROPHIES = { win: 24, loss: 16 };
export const ONLINE_XP = { win: 40, loss: 15 };
/** How long a dropped player has to come back before the match is theirs to lose. */
const RETURN_MS = 45_000;
/** Time for the VS card before the first shot clock starts. */
const INTRO_MS = 3_500;
/** Network allowance on every turn so a shot released at 0:01 is not lost in transit. */
const SLACK_MS = 1_500;
const BREAK_CHOICE_SECONDS = 20;
/** Three clock-outs in a row is a player who has left the table. */
const IDLE_LIMIT = 3;

type Profile = {
  id: string;
  name: string;
  country: string;
  avatar: number;
  level: number;
  trophies: number;
  wins: number;
  matches: number;
};
type Conn = {
  ws: WebSocket;
  profile: Profile;
  cue: string;
  blocked: string[];
  /** The last five results, newest last; sets the strength of a house opponent. */
  form: number[];
  queued?: string;
  /** Fires when nobody has arrived to play this player: a house player is seated instead. */
  queueTimer?: ReturnType<typeof setTimeout>;
  lastHouse?: string;
  room?: string;
  matchId?: string;
  alive: boolean;
  lastEmote: number;
};
/** The house's side of a table: its strength, its style and the timers that pace it. */
type HouseSeat = {
  skill: number;
  style: CpuStyle;
  timers: ReturnType<typeof setTimeout>[];
  lastEmote: number;
  left: boolean;
};
type Seat = {
  conn: Conn | null;
  profile: Profile;
  cue: string;
  house?: HouseSeat;
};
type Match = {
  id: string;
  venueId: string;
  entry: number;
  seats: [Seat, Seat];
  s: Session;
  seq: number;
  timer?: ReturnType<typeof setTimeout>;
  away: (ReturnType<typeof setTimeout> | undefined)[];
  idle: [number, number];
  ended: boolean;
  rematch: Set<number>;
  log: any[];
  private: boolean;
};

const shot = z.object({
  angle: z.number().finite().min(-1000).max(1000),
  power: z.number().min(0.001).max(1),
  side: z.number().min(-1).max(1),
  top: z.number().min(-1).max(1),
});
const action = z.discriminatedUnion("t", [
  shot.extend({ t: z.literal("shot") }).strict(),
  z
    .object({
      t: z.literal("place"),
      x: z.number().finite(),
      z: z.number().finite(),
    })
    .strict(),
  z
    .object({
      t: z.literal("break"),
      choice: z.enum(["spot", "rerack", "opponent-break", "accept", "hand"]),
    })
    .strict(),
]);
const message = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), token: z.string().min(10).max(300) }),
  z.object({ t: z.literal("queue"), venueId: z.string().max(40) }),
  z.object({ t: z.literal("cancel") }),
  z.object({ t: z.literal("room"), venueId: z.string().max(40) }),
  z.object({ t: z.literal("join"), code: z.string().regex(/^[A-Z2-9]{5}$/) }),
  z.object({ t: z.literal("act"), action }),
  z.object({
    t: z.literal("aim"),
    angle: z.number().finite().min(-1000).max(1000),
    power: z.number().min(0).max(1),
    side: z.number().min(-1).max(1),
    top: z.number().min(-1).max(1),
  }),
  z.object({
    t: z.literal("emote"),
    id: z
      .number()
      .int()
      .min(0)
      .max(EMOTES.length - 1),
  }),
  z.object({ t: z.literal("resign") }),
  z.object({ t: z.literal("rematch") }),
  z.object({ t: z.literal("leave") }),
  z.object({ t: z.literal("ping") }),
]);

export function installLive(
  server: Server,
  db: Db,
  deps: {
    authenticate: (token: string) => Promise<any | null>;
    publicUser: (u: any) => any;
    /** Once per player per settled match; `pot` is what this player won, 0 for the loser. */
    onResult?: (
      playerId: string,
      won: boolean,
      match: { pot: number; private: boolean },
    ) => void;
  },
) {
  const users = db.collection<any>("players"),
    records = db.collection<any>("liveMatches");
  const conns = new Map<string, Conn>();
  const queues = new Map<string, Conn[]>();
  const rooms = new Map<
    string,
    { venueId: string; host: Conn; expires: number }
  >();
  const matches = new Map<string, Match>();
  const byPlayer = new Map<string, Match>();
  void ensureHouse(db).catch((e) => console.error("House setup", e?.name));

  // A restart loses the tables in memory. Nobody should lose an entry fee to a deploy.
  void (async () => {
    for await (const r of records.find({ status: "active" })) {
      await users.updateMany(
        { _id: { $in: r.players } },
        { $inc: { coins: r.entry } },
      );
      await records.updateOne(
        { _id: r._id },
        { $set: { status: "void", endedAt: new Date() } },
      );
    }
  })().catch(() => {});

  const send = (conn: Conn | null | undefined, m: any) => {
    if (conn && conn.ws.readyState === WebSocket.OPEN)
      conn.ws.send(JSON.stringify(m));
  };
  const online = () => conns.size;
  const profileOf = (u: any): Profile => ({
    id: u._id,
    name: u.name,
    country: u.country || "",
    avatar: u.avatar || 0,
    level: levelOf(u.xp || 0),
    trophies: u.trophies || 0,
    wins: u.stats?.onlineWins || 0,
    matches: u.stats?.onlineMatches || 0,
  });
  const leaveQueue = (conn: Conn) => {
    clearTimeout(conn.queueTimer);
    conn.queueTimer = undefined;
    if (!conn.queued) return;
    const q = queues.get(conn.queued) || [];
    queues.set(
      conn.queued,
      q.filter((c) => c !== conn),
    );
    conn.queued = undefined;
  };
  const closeRoom = (conn: Conn) => {
    if (conn.room && rooms.get(conn.room)?.host === conn)
      rooms.delete(conn.room);
    conn.room = undefined;
  };
  const blocks = (a: Conn, b: Conn) =>
    a.blocked.includes(b.profile.id) || b.blocked.includes(a.profile.id);

  /** Entry checks shared by the queue, private rooms and rematches. */
  async function eligible(conn: Conn, venueId: string) {
    const venue = venues.find((v) => v.id === venueId);
    if (!venue) return { error: "Venue not found." };
    const u = await users.findOne({ _id: conn.profile.id });
    if (!u || u.suspended) return { error: "Please sign in again." };
    if (levelOf(u.xp || 0) < venue.level)
      return { error: `Unlocks at level ${venue.level}.` };
    if ((u.coins || 0) < venue.entry)
      return { error: `This table costs ${venue.entry} coins.` };
    conn.profile = profileOf(u);
    conn.cue = u.selectedCue || "club";
    conn.form = u.form || [];
    return { venue };
  }
  const party = (c: Conn): Seat => ({
    conn: c,
    profile: c.profile,
    cue: c.cue,
  });
  const houseWait = () =>
    process.env.HOUSE_WAIT_MS
      ? Number(process.env.HOUSE_WAIT_MS)
      : between(HOUSE.waitMs);
  /** Nobody arrived: seat one of the club's regulars, or keep waiting if every one is busy. */
  async function seatHouse(conn: Conn, venueId: string) {
    conn.queueTimer = undefined;
    if (conn.queued !== venueId || conn.ws.readyState !== WebSocket.OPEN)
      return;
    const pick = await pickHouse(
      db,
      {
        id: conn.profile.id,
        trophies: conn.profile.trophies,
        form: conn.form,
        blocked: conn.blocked,
      },
      venueId,
      byPlayer.keys(),
      conn.lastHouse,
    );
    if (conn.queued !== venueId) return;
    if (!pick) {
      conn.queueTimer = setTimeout(() => void seatHouse(conn, venueId), 3000);
      return;
    }
    leaveQueue(conn);
    conn.lastHouse = pick.doc._id;
    await startMatch(
      venueId,
      party(conn),
      houseParty(pick.doc, pick.skill, pick.style),
      false,
    );
  }
  const houseParty = (doc: any, skill: number, style: CpuStyle): Seat => ({
    conn: null,
    profile: profileOf(doc),
    cue: doc.selectedCue || "club",
    house: { skill, style, timers: [], lastEmote: 0, left: false },
  });
  const houseLater = (house: HouseSeat, ms: number, fn: () => void) => {
    const t = setTimeout(
      () => {
        house.timers = house.timers.filter((x) => x !== t);
        fn();
      },
      Math.max(0, ms),
    );
    house.timers.push(t);
  };
  const houseSay = (m: Match, i: number, id: number) => {
    const house = m.seats[i].house!;
    if (Date.now() - house.lastEmote < 6000) return;
    house.lastEmote = Date.now();
    send(m.seats[1 - i].conn, { t: "emote", id });
  };
  /**
   * The house takes its turn: it thinks for a few seconds, swings its cue onto the line in view
   * of the opponent, draws back, and plays. Everything is paced to finish well inside the clock.
   */
  function driveHouse(m: Match, animationMs: number) {
    const i = m.seats.findIndex((x) => x.house);
    if (i < 0 || m.ended) return;
    const house = m.seats[i].house!,
      s = m.s;
    if (s.progress.turn !== i) return;
    const action = houseTurn(s, house.skill, house.style);
    if (!action) return;
    const quick = action.t !== "shot";
    const think = Math.min(
      between(quick ? HOUSE.quickMs : HOUSE.thinkMs),
      turnSeconds(m) * 1000 - 2500,
    );
    const delay = animationMs + think;
    if (action.t === "shot") {
      const start = s.angle + (Math.random() - 0.5) * 0.5;
      for (let k = 1; k <= 4; k++)
        houseLater(house, delay - 1500 + k * 350, () => {
          if (m.ended) return;
          const t = k / 4;
          send(m.seats[1 - i].conn, {
            t: "aim",
            angle: start + (action.angle - start) * t,
            power:
              k === 4 ? action.power * 0.9 : k === 3 ? action.power * 0.4 : 0,
            side: action.side,
            top: action.top,
          });
        });
    }
    houseLater(house, delay, () => {
      if (!m.ended && s.progress.turn === i) apply(m, i, action, false);
    });
  }
  /** After the rack: a word, sometimes a rematch offer, otherwise off to another table. */
  function houseAfterEnd(m: Match, revealMs: number) {
    const i = m.seats.findIndex((x) => x.house);
    if (i < 0) return;
    const house = m.seats[i].house!;
    house.timers.forEach(clearTimeout);
    house.timers = [];
    if (Math.random() < HOUSE.emote.goodGame)
      houseLater(house, revealMs + 1500, () => houseSay(m, i, 5));
    const stillHere = () =>
      !house.left &&
      !m.rematch.has(1 - i) &&
      m.seats[1 - i].conn?.matchId === m.id;
    const leave = () =>
      houseLater(house, between(HOUSE.leaveAfterMs), () => {
        if (!stillHere()) return;
        house.left = true;
        send(m.seats[1 - i].conn, { t: "left" });
      });
    if (Math.random() < HOUSE.rematchOffer)
      houseLater(house, revealMs + between([4000, 8000]), () => {
        if (!stillHere()) return;
        m.rematch.add(i);
        send(m.seats[1 - i].conn, { t: "rematch" });
        leave();
      });
    else leave();
  }

  async function startMatch(
    venueId: string,
    a: Seat,
    b: Seat,
    isPrivate: boolean,
  ) {
    const venue = venues.find((v) => v.id === venueId)!;
    const charged: Seat[] = [];
    for (const c of [a, b]) {
      const u = await users.findOneAndUpdate(
        {
          _id: c.profile.id,
          coins: { $gte: venue.entry },
          suspended: { $ne: true },
        },
        { $inc: { coins: -venue.entry } },
        { returnDocument: "after" },
      );
      if (!u) {
        if (charged.length)
          await users.updateMany(
            { _id: { $in: charged.map((x) => x.profile.id) } },
            { $inc: { coins: venue.entry } },
          );
        for (const x of [a, b])
          send(x.conn, {
            t: "error",
            message:
              x === c
                ? `This table costs ${venue.entry} coins.`
                : "Your opponent could not cover the entry. Nothing was charged.",
          });
        return;
      }
      charged.push(c);
    }
    // The breaker is drawn at random; seat 0 always breaks.
    const [first, second] = randomInt(2) ? [b, a] : [a, b];
    const s = new Session();
    s.matchRules = true;
    s.now = () => 0;
    s.cueIds = [first.cue, second.cue];
    s.reset("break");
    const m: Match = {
      id: randomUUID(),
      venueId,
      entry: venue.entry,
      seats: [{ ...first }, { ...second }],
      s,
      seq: 0,
      away: [undefined, undefined],
      idle: [0, 0],
      ended: false,
      rematch: new Set(),
      log: [],
      private: isPrivate,
    };
    matches.set(m.id, m);
    for (const seat of m.seats) {
      byPlayer.set(seat.profile.id, m);
      if (!seat.conn) continue;
      seat.conn.matchId = m.id;
      leaveQueue(seat.conn);
      closeRoom(seat.conn);
    }
    await records.insertOne({
      _id: m.id,
      venueId,
      entry: venue.entry,
      players: m.seats.map((x) => x.profile.id),
      private: isPrivate,
      house: m.seats.some((x) => !!x.house),
      status: "active",
      startedAt: new Date(),
    });
    schedule(m, INTRO_MS);
    m.seats.forEach((seat, i) => send(seat.conn, matchMessage(m, i)));
    driveHouse(m, INTRO_MS);
  }

  function matchMessage(m: Match, seat: number, resume = false) {
    const venue = venues.find((v) => v.id === m.venueId)!;
    return {
      t: "match",
      id: m.id,
      seat,
      venue,
      entry: m.entry,
      pot: m.entry * 2,
      private: m.private,
      cues: m.seats.map((x) => x.cue),
      opponent: m.seats[1 - seat].profile,
      introMs: resume ? 0 : INTRO_MS,
      turnMs: turnSeconds(m) * 1000,
      ...(resume ? { seq: m.seq, state: m.s.tableState() } : {}),
    };
  }

  const turnSeconds = (m: Match) =>
    m.s.progress.breakChoice
      ? BREAK_CHOICE_SECONDS
      : cueById(m.s.cueIds[m.s.progress.turn]).seconds;

  /** The next player's clock starts once the phones have finished animating the last shot. */
  function schedule(m: Match, animationMs: number) {
    clearTimeout(m.timer);
    const wait = animationMs + turnSeconds(m) * 1000 + SLACK_MS;
    m.timer = setTimeout(() => {
      const s = m.s,
        seat = s.progress.turn;
      apply(
        m,
        seat,
        s.progress.breakChoice
          ? {
              t: "break",
              choice: s.progress.breakChoice === "eight" ? "spot" : "hand",
            }
          : { t: "timeout" },
        true,
      );
    }, wait);
  }

  function apply(m: Match, seat: number, a: Action, auto: boolean) {
    const s = m.s;
    if (m.ended) return "The match is over.";
    if (s.progress.turn !== seat) return "It is not your turn.";
    const before = s.world.time;
    try {
      perform(s, a);
    } catch (e) {
      return (e as Error).message;
    }
    let n = 0;
    while (s.running && n++ < 20000) s.update(0.1);
    // A re-rack replaces the world, so its clock restarts; never schedule a negative wait.
    const animationMs = Math.max(0, (s.world.time - before) * 1000);
    m.seq++;
    m.log.push({ seat, auto, ...a });
    m.idle[seat] = auto && a.t === "timeout" ? m.idle[seat] + 1 : 0;
    const finished = s.progress.finished;
    if (!finished) schedule(m, animationMs);
    const update = {
      t: "act",
      seq: m.seq,
      seat,
      auto,
      action: a,
      state: s.tableState(),
      turnMs: turnSeconds(m) * 1000,
    };
    for (const x of m.seats) send(x.conn, update);
    if (finished) void end(m, localWinner(s.progress), "rack", animationMs);
    else if (m.idle[seat] >= IDLE_LIMIT) void end(m, 1 - seat, "idle", 0);
    else {
      const h = m.seats.findIndex((x) => x.house);
      if (
        h >= 0 &&
        !m.seats[seat].house &&
        s.progress.shotPots.length >= 2 &&
        Math.random() < HOUSE.emote.goodShot
      )
        houseLater(m.seats[h].house!, animationMs + 1200, () =>
          houseSay(m, h, 0),
        );
      if (
        h === seat &&
        (s.progress.scratch || s.progress.foul) &&
        Math.random() < HOUSE.emote.oops
      )
        houseLater(m.seats[h].house!, animationMs + 900, () =>
          houseSay(m, h, 3),
        );
      driveHouse(m, animationMs);
    }
    return null;
  }

  /**
   * Settle a match exactly once. A winner takes both entries and seals a crate in the same
   * atomic write as the result; a match nobody can finish refunds both players.
   */
  async function end(
    m: Match,
    winner: number | null,
    reason: string,
    delayMs: number,
  ) {
    if (m.ended) return;
    m.ended = true;
    clearTimeout(m.timer);
    m.away.forEach((t) => clearTimeout(t));
    const pot = m.entry * 2;
    const results: any[] = [null, null];
    if (winner === null) {
      for (const seat of m.seats)
        results[m.seats.indexOf(seat)] = await users.findOneAndUpdate(
          { _id: seat.profile.id },
          { $inc: { coins: m.entry } },
          { returnDocument: "after" },
        );
    } else {
      const award = crateAwardStage();
      const inc = (field: string, by: number) => ({
        $add: [{ $ifNull: [field, 0] }, by],
      });
      // The last five results, newest last: what a house opponent's strength follows.
      const form = (won: boolean) => ({
        form: {
          $slice: [
            { $concatArrays: [{ $ifNull: ["$form", []] }, [won ? 1 : 0]] },
            -5,
          ],
        },
      });
      const loser = 1 - winner;
      results[winner] = await users.findOneAndUpdate(
        { _id: m.seats[winner].profile.id },
        [
          {
            $set: {
              coins: inc("$coins", pot),
              xp: inc("$xp", ONLINE_XP.win),
              trophies: inc("$trophies", TROPHIES.win),
              "stats.onlineMatches": inc("$stats.onlineMatches", 1),
              "stats.onlineWins": inc("$stats.onlineWins", 1),
              "stats.coinsWon": inc("$stats.coinsWon", pot),
              // The house keeps its record but has no use for crates, form or a piggy bank.
              ...(m.seats[winner].house
                ? {}
                : {
                    piggy: piggyDeposit(true),
                    ...award.fields,
                    ...form(true),
                  }),
            },
          },
        ],
        { returnDocument: "after" },
      );
      results[loser] = await users.findOneAndUpdate(
        { _id: m.seats[loser].profile.id },
        [
          {
            $set: {
              xp: inc("$xp", ONLINE_XP.loss),
              trophies: {
                $max: [0, inc("$trophies", -TROPHIES.loss)],
              },
              "stats.onlineMatches": inc("$stats.onlineMatches", 1),
              "stats.onlineLosses": inc("$stats.onlineLosses", 1),
              ...(m.seats[loser].house
                ? {}
                : { piggy: piggyDeposit(false), ...form(false) }),
            },
          },
        ],
        { returnDocument: "after" },
      );
      const crate = m.seats[winner].house
        ? null
        : (results[winner]?.crates || []).find(
            (c: any) => c.id === award.crate.id,
          );
      results[winner] = { doc: results[winner], crate };
      results[loser] = { doc: results[loser] };
      m.seats.forEach((seat, i) => {
        if (!seat.house)
          deps.onResult?.(seat.profile.id, i === winner, {
            pot: i === winner ? pot : 0,
            private: m.private,
          });
      });
    }
    await records.updateOne(
      { _id: m.id },
      {
        $set: {
          status: "ended",
          winner: winner === null ? null : m.seats[winner].profile.id,
          reason,
          endedAt: new Date(),
          actions: m.log.slice(0, 600),
        },
      },
    );
    m.seats.forEach((seat, i) => {
      const r = results[i];
      const doc = r?.doc ?? r;
      byPlayer.delete(seat.profile.id);
      send(seat.conn, {
        t: "end",
        winner,
        reason,
        pot: winner === i ? pot : 0,
        refunded: winner === null ? m.entry : 0,
        trophies:
          winner === null ? 0 : winner === i ? TROPHIES.win : -TROPHIES.loss,
        xp: winner === null ? 0 : winner === i ? ONLINE_XP.win : ONLINE_XP.loss,
        crate: r?.crate ? publicCrate(r.crate) : null,
        player: doc ? deps.publicUser(doc) : null,
        // The phones are still animating the final shot; the result card waits for it.
        revealMs: delayMs,
      });
    });
    houseAfterEnd(m, delayMs);
    // Keep the table around briefly for a rematch.
    setTimeout(() => {
      matches.delete(m.id);
      m.seats.forEach((x) => x.house?.timers.forEach(clearTimeout));
    }, 120_000).unref();
  }

  function away(m: Match, seatIndex: number) {
    const seat = m.seats[seatIndex];
    seat.conn = null;
    if (m.ended) return;
    send(m.seats[1 - seatIndex].conn, {
      t: "opponent",
      status: "away",
      returnMs: RETURN_MS,
    });
    m.away[seatIndex] = setTimeout(() => {
      const other = m.seats[1 - seatIndex];
      // Both gone: nobody won, so nobody pays. The house is never gone.
      void end(
        m,
        other.conn || other.house ? 1 - seatIndex : null,
        "disconnect",
        0,
      );
    }, RETURN_MS);
  }

  async function handle(conn: Conn | null, ws: WebSocket, raw: any) {
    const m = message.parse(raw);
    if (m.t === "hello") {
      const u = await deps.authenticate(m.token);
      if (!u || u.suspended) {
        ws.send(
          JSON.stringify({ t: "error", message: "Please sign in again." }),
        );
        ws.close(4001);
        return null;
      }
      const previous = conns.get(u._id);
      if (previous && previous.ws !== ws) {
        leaveQueue(previous);
        closeRoom(previous);
        previous.ws.close(4002, "Signed in elsewhere");
      }
      const c: Conn = {
        ws,
        profile: profileOf(u),
        cue: u.selectedCue || "club",
        blocked: u.blockedPlayers || [],
        form: u.form || [],
        alive: true,
        lastEmote: 0,
      };
      conns.set(u._id, c);
      send(c, { t: "welcome", online: online(), emotes: EMOTES });
      const active = byPlayer.get(u._id);
      if (active && !active.ended) {
        const i = active.seats.findIndex((x) => x.profile.id === u._id);
        clearTimeout(active.away[i]);
        active.seats[i].conn = c;
        c.matchId = active.id;
        send(c, matchMessage(active, i, true));
        send(active.seats[1 - i].conn, { t: "opponent", status: "back" });
      }
      return c;
    }
    if (!conn) {
      send({ ws } as Conn, { t: "error", message: "Say hello first." });
      return null;
    }
    const match = conn.matchId ? matches.get(conn.matchId) : undefined;
    const seat = match
      ? match.seats.findIndex((x) => x.profile.id === conn.profile.id)
      : -1;
    switch (m.t) {
      case "ping":
        send(conn, { t: "pong", online: online() });
        break;
      case "queue": {
        if (match && !match.ended)
          return send(conn, {
            t: "error",
            message: "Finish your match first.",
          });
        const check = await eligible(conn, m.venueId);
        if (check.error)
          return send(conn, { t: "error", message: check.error });
        leaveQueue(conn);
        closeRoom(conn);
        conn.matchId = undefined;
        const q = (queues.get(m.venueId) || []).filter(
          (c) => c.ws.readyState === WebSocket.OPEN,
        );
        const rival = q.find((c) => c !== conn && !blocks(c, conn));
        if (rival) {
          queues.set(
            m.venueId,
            q.filter((c) => c !== rival),
          );
          rival.queued = undefined;
          clearTimeout(rival.queueTimer);
          rival.queueTimer = undefined;
          await startMatch(m.venueId, party(rival), party(conn), false);
        } else {
          q.push(conn);
          queues.set(m.venueId, q);
          conn.queued = m.venueId;
          send(conn, { t: "queued", venueId: m.venueId, online: online() });
          // A search always ends in a match: a person who arrives in time, else the house.
          conn.queueTimer = setTimeout(
            () => void seatHouse(conn, m.venueId),
            houseWait(),
          );
        }
        break;
      }
      case "cancel":
        leaveQueue(conn);
        closeRoom(conn);
        send(conn, { t: "cancelled" });
        break;
      case "room": {
        if (match && !match.ended)
          return send(conn, {
            t: "error",
            message: "Finish your match first.",
          });
        const check = await eligible(conn, m.venueId);
        if (check.error)
          return send(conn, { t: "error", message: check.error });
        leaveQueue(conn);
        closeRoom(conn);
        // No 0/O/1/I: the code is read aloud and typed on a phone.
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        do {
          code = Array.from(
            { length: 5 },
            () => alphabet[randomInt(alphabet.length)],
          ).join("");
        } while (rooms.has(code));
        rooms.set(code, {
          venueId: m.venueId,
          host: conn,
          expires: Date.now() + 15 * 60_000,
        });
        conn.room = code;
        send(conn, { t: "room", code, venueId: m.venueId });
        break;
      }
      case "join": {
        const room = rooms.get(m.code);
        if (
          !room ||
          room.expires < Date.now() ||
          room.host.ws.readyState !== WebSocket.OPEN
        )
          return send(conn, {
            t: "error",
            message:
              "That room code has expired. Ask your friend for a new one.",
          });
        if (room.host === conn)
          return send(conn, {
            t: "error",
            message: "Share this code with a friend.",
          });
        if (blocks(room.host, conn))
          return send(conn, {
            t: "error",
            message: "You cannot join this room.",
          });
        const check = await eligible(conn, room.venueId);
        if (check.error)
          return send(conn, { t: "error", message: check.error });
        rooms.delete(m.code);
        await startMatch(room.venueId, party(room.host), party(conn), true);
        break;
      }
      case "act": {
        if (!match || seat < 0)
          return send(conn, { t: "error", message: "No match in progress." });
        const error = apply(match, seat, m.action as Action, false);
        if (error)
          send(conn, {
            t: "reject",
            message: error,
            seq: match.seq,
            state: match.s.tableState(),
            turnMs: turnSeconds(match) * 1000,
          });
        break;
      }
      case "aim":
        if (
          match &&
          !match.ended &&
          seat >= 0 &&
          match.s.progress.turn === seat &&
          !match.s.running
        )
          send(match.seats[1 - seat].conn, { ...m, t: "aim" });
        break;
      case "emote":
        if (!match || seat < 0 || Date.now() - conn.lastEmote < 1500) break;
        conn.lastEmote = Date.now();
        send(match.seats[1 - seat].conn, { t: "emote", id: m.id });
        break;
      case "resign":
        if (match && !match.ended && seat >= 0)
          await end(match, 1 - seat, "resign", 0);
        break;
      case "rematch": {
        if (!match || !match.ended || seat < 0) break;
        const other = match.seats[1 - seat];
        if (other.house) {
          if (other.house.left)
            return send(conn, {
              t: "error",
              message: "Your opponent has left the table.",
            });
          if (match.rematch.has(seat)) break;
          match.rematch.add(seat);
          const offered = match.rematch.has(1 - seat);
          const accept = offered || Math.random() < HOUSE.rematchAccept;
          const house = other.house;
          house.timers.forEach(clearTimeout);
          house.timers = [];
          houseLater(house, offered ? 800 : between([1500, 4000]), () => {
            void (async () => {
              if (!accept) {
                house.left = true;
                return send(conn, { t: "left" });
              }
              match.rematch.clear();
              const check = await eligible(conn, match.venueId);
              if (check.error)
                return send(conn, {
                  t: "error",
                  message: "Rematch unavailable: " + check.error,
                });
              const doc = await users.findOne({ _id: other.profile.id });
              if (!doc) return;
              await startMatch(
                match.venueId,
                party(conn),
                houseParty(
                  doc,
                  formSkill(conn.form, check.venue!.level),
                  house.style,
                ),
                false,
              );
            })();
          });
          break;
        }
        if (!other.conn || other.conn.matchId !== match.id)
          return send(conn, {
            t: "error",
            message: "Your opponent has left the table.",
          });
        match.rematch.add(seat);
        if (match.rematch.size < 2) {
          send(other.conn, { t: "rematch" });
          break;
        }
        match.rematch.clear();
        const checks = await Promise.all(
          match.seats.map((x) => eligible(x.conn!, match.venueId)),
        );
        const failed = checks.find((c) => c.error);
        if (failed) {
          for (const x of match.seats)
            send(x.conn, {
              t: "error",
              message: "Rematch unavailable: " + failed.error,
            });
          break;
        }
        await startMatch(
          match.venueId,
          party(match.seats[0].conn!),
          party(match.seats[1].conn!),
          match.private,
        );
        break;
      }
      case "leave":
        if (match?.ended) {
          conn.matchId = undefined;
          const other = match.seats[1 - seat];
          if (other?.conn?.matchId === match.id)
            send(other.conn, { t: "left" });
          other?.house?.timers.forEach(clearTimeout);
        }
        break;
    }
    return conn;
  }

  const wss = new WebSocketServer({ server, path: "/live", maxPayload: 8192 });
  wss.on("connection", (ws) => {
    let conn: Conn | null = null;
    let budget = 40,
      refilled = Date.now();
    ws.on("pong", () => conn && (conn.alive = true));
    ws.on("message", async (data) => {
      // A small token bucket: aim updates run at ten a second, nothing legitimate needs more.
      const now = Date.now();
      budget = Math.min(40, budget + ((now - refilled) / 1000) * 25);
      refilled = now;
      if (--budget < 0) return ws.close(4008, "Too many messages");
      let raw;
      try {
        raw = JSON.parse(String(data));
      } catch {
        return;
      }
      try {
        conn = (await handle(conn, ws, raw)) ?? conn;
      } catch (e) {
        if (e instanceof z.ZodError)
          ws.send(JSON.stringify({ t: "error", message: "Invalid message." }));
        else console.error("Live error", (e as Error)?.name);
      }
    });
    ws.on("close", () => {
      if (!conn) return;
      leaveQueue(conn);
      closeRoom(conn);
      if (conns.get(conn.profile.id) === conn) conns.delete(conn.profile.id);
      const m = byPlayer.get(conn.profile.id);
      if (m && !m.ended) {
        const i = m.seats.findIndex((x) => x.conn === conn);
        if (i >= 0) away(m, i);
      } else if (m?.ended) {
        const i = m.seats.findIndex((x) => x.conn === conn);
        if (i >= 0) {
          m.seats[i].conn = null;
          send(m.seats[1 - i].conn, { t: "left" });
        }
      }
    });
  });
  // Mobile networks drop sockets silently; a missed pong is how we find out.
  const heartbeat = setInterval(() => {
    for (const c of conns.values()) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
    for (const [code, room] of rooms)
      if (room.expires < Date.now()) rooms.delete(code);
  }, 20_000);
  heartbeat.unref();
  return { online, matches };
}
