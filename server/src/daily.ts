import { createHash, randomInt, randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import type { Db, Document } from "mongodb";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { SLOTS, crateByTier, type Crate } from "./rewards";
import { adsConfigured } from "./ads";
import { currentSeason } from "./season";
import { dailyKey } from "./catalog";

/**
 * Daily-return systems: a seven-day login streak, a free gift every few hours, the spin wheel,
 * three daily missions and the seasonal CueMaster Pass.
 *
 * Everything is rolled and paid here. Each claim is one atomic write whose filter *is* the claim
 * rule (not yet claimed today, gift cooled down, mission complete, tier reached), so a double tap
 * or a retried request finds nothing to update and pays nothing. All state lives on the player
 * document, so deleting an account deletes it too.
 *
 * Days are UTC (`dailyKey`). Mission progress moves only on events the server verified for
 * itself — a refereed win, a replayed drill, a crate it paid out — reported through `track()`.
 */

export type CrateTier =
  "practice" | "club" | "silver" | "gold" | "champion" | "master";
/** A reward as the tables describe it. Crates are named by type; contents are rolled on opening. */
export type Reward = { coins?: number; rubies?: number; crate?: CrateTier };
/** Events the server has verified for itself. Nothing a device merely reports may become one. */
export type MissionEvent =
  | "match_played"
  | "match_won"
  | "daily_shot"
  | "practice_clear"
  | "crate_opened"
  | "wheel_spun"
  | "online_played";
type Mission = {
  id: string;
  label: string;
  event: MissionEvent;
  goal: number;
  reward: Reward;
  passXp: number;
  /** Doable in a few minutes by anyone; every day's board carries at least one. */
  easy?: boolean;
};

/** Every tunable number for the daily systems. Retune here; nothing else hard-codes them. */
export const DAILY: {
  streak: Reward[];
  gift: { hours: number; coins: number };
  wheel: { label: string; weight: number; reward: Reward; jackpot?: boolean }[];
  spins: { freePerDay: number; adPerDay: number };
  missions: {
    perDay: number;
    pool: Mission[];
    bonus: { reward: Reward; passXp: number };
  };
  pass: { xpPerTier: number; free: Reward[]; premium: Reward[] };
  passXp: {
    cpuMatch: number;
    verifiedWin: number;
    dailyShot: number;
    streakClaim: number;
  };
  /**
   * What a crate reward pays when every slot is full: the crate's lowest coin roll, so keeping
   * the slots full is never a better deal than opening them.
   */
  crateFallbackCoins: Record<CrateTier, number>;
} = {
  streak: [
    { coins: 100 },
    { coins: 150 },
    { rubies: 2 },
    { coins: 250 },
    { crate: "club" },
    { coins: 400 },
    { crate: "silver", rubies: 5 },
  ],
  gift: { hours: 4, coins: 100 },
  // Wheel order, clockwise from the pointer; segment 0 sits under it at rest. Weights total 100.
  wheel: [
    { label: "50 coins", weight: 30, reward: { coins: 50 } },
    { label: "1 ruby", weight: 12, reward: { rubies: 1 } },
    { label: "100 coins", weight: 24, reward: { coins: 100 } },
    { label: "Club crate", weight: 7, reward: { crate: "club" } },
    { label: "250 coins", weight: 14, reward: { coins: 250 } },
    { label: "3 rubies", weight: 4, reward: { rubies: 3 } },
    { label: "500 coins", weight: 7, reward: { coins: 500 } },
    {
      label: "2,500 coins jackpot",
      weight: 2,
      reward: { coins: 2500 },
      jackpot: true,
    },
  ],
  spins: { freePerDay: 1, adPerDay: 3 },
  missions: {
    perDay: 3,
    pool: [
      {
        id: "play3",
        label: "Play 3 matches",
        event: "match_played",
        goal: 3,
        reward: { coins: 150 },
        passXp: 100,
      },
      {
        id: "win1",
        label: "Win a match",
        event: "match_won",
        goal: 1,
        reward: { coins: 200 },
        passXp: 100,
      },
      {
        id: "win3",
        label: "Win 3 matches",
        event: "match_won",
        goal: 3,
        reward: { coins: 500, rubies: 2 },
        passXp: 150,
      },
      {
        id: "daily",
        label: "Play the Daily Shot",
        event: "daily_shot",
        goal: 1,
        reward: { coins: 100 },
        passXp: 100,
        easy: true,
      },
      {
        id: "drills2",
        label: "Clear 2 practice drills",
        event: "practice_clear",
        goal: 2,
        reward: { coins: 150 },
        passXp: 100,
        easy: true,
      },
      {
        id: "crate1",
        label: "Open a crate",
        event: "crate_opened",
        goal: 1,
        reward: { coins: 100 },
        passXp: 100,
      },
      {
        id: "spin1",
        label: "Spin the wheel",
        event: "wheel_spun",
        goal: 1,
        reward: { coins: 50 },
        passXp: 50,
        easy: true,
      },
      {
        id: "online1",
        label: "Play an online match",
        event: "online_played",
        goal: 1,
        reward: { coins: 200 },
        passXp: 150,
      },
    ],
    bonus: { reward: { crate: "silver" }, passXp: 100 },
  },
  // One row per tier; tier n is reached at n × xpPerTier pass XP.
  pass: {
    xpPerTier: 250,
    free: [
      { coins: 100 },
      { coins: 150 },
      { coins: 100 },
      { coins: 200 },
      { rubies: 2 },
      { coins: 150 },
      { coins: 250 },
      { crate: "club" },
      { coins: 200 },
      { rubies: 3 },
      { coins: 250 },
      { coins: 300 },
      { coins: 200 },
      { coins: 300 },
      { rubies: 3 },
      { crate: "silver" },
      { coins: 300 },
      { coins: 350 },
      { coins: 300 },
      { rubies: 4 },
      { coins: 350 },
      { coins: 400 },
      { coins: 350 },
      { crate: "gold" },
      { rubies: 5 },
      { coins: 400 },
      { coins: 450 },
      { coins: 400 },
      { coins: 500 },
      { crate: "gold" },
    ],
    premium: [
      { rubies: 5 },
      { coins: 300 },
      { coins: 400 },
      { crate: "silver" },
      { coins: 500 },
      { rubies: 8 },
      { coins: 500 },
      { coins: 600 },
      { crate: "gold" },
      { rubies: 10 },
      { coins: 700 },
      { coins: 750 },
      { crate: "silver" },
      { coins: 800 },
      { rubies: 12 },
      { coins: 900 },
      { crate: "gold" },
      { coins: 1000 },
      { coins: 1000 },
      { rubies: 15 },
      { crate: "champion" },
      { coins: 1100 },
      { coins: 1200 },
      { crate: "gold" },
      { rubies: 15 },
      { coins: 1300 },
      { crate: "champion" },
      { coins: 1400 },
      { coins: 1500 },
      { crate: "master", rubies: 50 },
    ],
  },
  passXp: { cpuMatch: 15, verifiedWin: 40, dailyShot: 30, streakClaim: 20 },
  crateFallbackCoins: {
    practice: 60,
    club: 150,
    silver: 400,
    gold: 700,
    champion: 1500,
    master: 3200,
  },
};

const DAY_MS = 86400000;
const previousDay = (date: string) =>
  dailyKey(new Date(Date.parse(date) - DAY_MS));

/**
 * The streak day a claim on `date` lands on: the day after yesterday's claim (seven wraps to
 * one), or day one after any gap. Null when `date` has already been claimed.
 */
export function nextStreakDay(
  last: { day: number; date: string } | null | undefined,
  date: string,
) {
  if (last?.date === date) return null;
  return last?.date === previousDay(date)
    ? (last.day % DAILY.streak.length) + 1
    : 1;
}

/**
 * Today's missions, picked from a hash of the player and the date, so the board needs no
 * storage and every server agrees on it. One easy mission first, then distinct others.
 */
export function pickMissions(playerId: string, date: string) {
  const { pool, perDay } = DAILY.missions;
  const h = createHash("sha256").update(`${playerId}:${date}`).digest();
  const easy = pool.filter((m) => m.easy);
  const first = easy[h[0] % easy.length];
  const rest = pool.filter((m) => m !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = h[1 + i] % (i + 1);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, ...rest.slice(0, perDay - 1)];
}

export function rollWheel() {
  let ticket = randomInt(DAILY.wheel.reduce((sum, w) => sum + w.weight, 0));
  for (let i = 0; i < DAILY.wheel.length; i++) {
    ticket -= DAILY.wheel[i].weight;
    if (ticket < 0) return i;
  }
  return 0;
}

export const tierOf = (xp: number) =>
  Math.min(
    DAILY.pass.free.length,
    Math.floor(Math.max(0, xp) / DAILY.pass.xpPerTier),
  );

/** A reward for the client: crate type and its full-slots fallback, never what it holds. */
export const publicReward = (r: Reward) => ({
  coins: r.coins || 0,
  rubies: r.rubies || 0,
  crate: r.crate
    ? {
        tier: r.crate,
        name: crateByTier(r.crate).name,
        fallbackCoins: DAILY.crateFallbackCoins[r.crate],
      }
    : null,
});

/** Pass progress belongs to one season: the first XP of a new season starts a fresh track. */
function passStages(xp: number, now = new Date()) {
  const season = currentSeason(now.getTime()).id;
  return [
    {
      $set: {
        pass: {
          $cond: [
            { $eq: ["$pass.season", season] },
            "$pass",
            { season, xp: 0, free: [], premium: [] },
          ],
        },
      },
    },
    { $set: { "pass.xp": { $add: [{ $ifNull: ["$pass.xp", 0] }, xp] } } },
  ];
}

/** Today's mission progress. The first event of a new day discards yesterday's. */
function missionStages(event: MissionEvent, n: number, date = dailyKey()) {
  return [
    {
      $set: {
        missions: {
          $cond: [
            { $eq: ["$missions.date", date] },
            "$missions",
            { date, progress: { $literal: {} }, claimed: [], bonus: false },
          ],
        },
      },
    },
    {
      $set: {
        [`missions.progress.${event}`]: {
          $add: [{ $ifNull: [`$missions.progress.${event}`, 0] }, n],
        },
      },
    },
  ];
}

/**
 * Pipeline stages that pay one reward, plus optional pass XP, inside the caller's atomic write.
 * A crate goes into a free slot; with every slot full it pays its fallback coins instead. The
 * slot count is read inside the write, never from the copy of the player the request started
 * with, so two claims landing together cannot both squeeze into the last slot.
 */
function grant(reward: Reward, passXp = 0, now = new Date()) {
  const crate: Crate | null = reward.crate
    ? { id: randomUUID(), tier: reward.crate, earnedAt: now, hoursOff: 0 }
    : null;
  const fallback = reward.crate ? DAILY.crateFallbackCoins[reward.crate] : 0;
  const held = { $ifNull: ["$crates", []] };
  const room = { $lt: [{ $size: held }, SLOTS] };
  const stages: Document[] = [
    {
      $set: {
        coins: {
          $add: [
            { $ifNull: ["$coins", 0] },
            reward.coins || 0,
            crate ? { $cond: [room, 0, fallback] } : 0,
          ],
        },
        rubies: { $add: [{ $ifNull: ["$rubies", 0] }, reward.rubies || 0] },
        ...(crate
          ? {
              crates: {
                $cond: [room, { $concatArrays: [held, [crate]] }, held],
              },
            }
          : {}),
      },
    },
    ...(passXp ? passStages(passXp, now) : []),
  ];
  /** What the write actually paid, read back from the document it produced. */
  const paid = (after: any) => {
    const placed =
      !!crate && (after.crates || []).some((c: Crate) => c.id === crate.id);
    const name = crate ? crateByTier(crate.tier).name : "";
    return {
      coins: (reward.coins || 0) + (crate && !placed ? fallback : 0),
      rubies: reward.rubies || 0,
      crate: crate && placed ? { tier: crate.tier, name } : null,
      fallback:
        crate && !placed ? { tier: crate.tier, name, coins: fallback } : null,
      passXp,
    };
  };
  return { stages, paid };
}

/**
 * Count a server-verified event toward today's missions.
 *
 * Fire-and-forget by design: callers do not await it and a failure is logged, never thrown, so
 * tracking cannot fail or slow the route that reported the event. Call it only once the server
 * has itself verified what happened, and only from the write that recorded it, so a retried
 * request is not counted twice.
 */
export async function track(
  db: Db,
  playerId: string,
  event: MissionEvent,
  n = 1,
) {
  try {
    await db
      .collection<any>("players")
      .updateOne({ _id: playerId }, missionStages(event, n));
  } catch (e) {
    console.error("Mission tracking failed", event, (e as Error)?.name);
  }
}

/** Pass XP for a verified event. Fire-and-forget, like `track()`. */
export async function addPassXp(db: Db, playerId: string, n: number) {
  try {
    await db
      .collection<any>("players")
      .updateOne({ _id: playerId }, passStages(n));
  } catch (e) {
    console.error("Pass XP failed", (e as Error)?.name);
  }
}

/** Everything the client draws for the daily systems, from one player document. */
export function todayView(u: any, now = new Date()) {
  const date = dailyKey(now);
  const season = currentSeason(now.getTime());
  const streakToday = u.loginStreak?.date === date;
  const m = u.missions?.date === date ? u.missions : null;
  const list = pickMissions(String(u._id), date).map((x) => ({
    id: x.id,
    label: x.label,
    goal: x.goal,
    progress: Math.min(x.goal, m?.progress?.[x.event] || 0),
    reward: publicReward(x.reward),
    passXp: x.passXp,
    claimed: (m?.claimed || []).includes(x.id),
  }));
  const pass = u.pass?.season === season.id ? u.pass : null;
  const xp = pass?.xp || 0;
  const giftReady = u.giftAt
    ? new Date(u.giftAt).getTime() + DAILY.gift.hours * 3600000
    : 0;
  return {
    date,
    resetsAt: new Date(Date.parse(date) + DAY_MS),
    slots: { held: (u.crates || []).length, max: SLOTS },
    streak: {
      day: streakToday
        ? u.loginStreak.day
        : nextStreakDay(u.loginStreak, date)!,
      claimedToday: streakToday,
      rewards: DAILY.streak.map(publicReward),
    },
    gift: {
      coins: DAILY.gift.coins,
      hours: DAILY.gift.hours,
      readyAt: giftReady > now.getTime() ? new Date(giftReady) : null,
    },
    spin: {
      free: Math.max(
        0,
        DAILY.spins.freePerDay -
          (u.spinFreeDay === date ? u.spinFreeUsed || 0 : 0),
      ),
      tokens: u.spinTokens || 0,
      adSpinsLeft: Math.max(
        0,
        DAILY.spins.adPerDay - (u.spinAdDay === date ? u.spinAdCount || 0 : 0),
      ),
      ads: adsConfigured(),
      segments: DAILY.wheel.map((w) => ({
        label: w.label,
        jackpot: !!w.jackpot,
        ...publicReward(w.reward),
      })),
    },
    missions: {
      list,
      bonus: {
        reward: publicReward(DAILY.missions.bonus.reward),
        passXp: DAILY.missions.bonus.passXp,
        ready: list.every((x) => x.claimed),
        claimed: !!m?.bonus,
      },
    },
    pass: {
      season: season.id,
      endsAt: season.endsAt,
      xp,
      tier: tierOf(xp),
      xpPerTier: DAILY.pass.xpPerTier,
      // Set by billing for the season it was bought in; it never carries into the next.
      premium: u.passPremiumSeason === season.id,
      rewards: DAILY.pass.free.map((free, i) => ({
        tier: i + 1,
        xp: (i + 1) * DAILY.pass.xpPerTier,
        free: publicReward(free),
        premium: publicReward(DAILY.pass.premium[i]),
      })),
      claimed: {
        free: (pass?.free || []) as number[],
        premium: (pass?.premium || []) as number[],
      },
    },
  };
}

export function installDaily(
  app: Express,
  db: Db,
  required: RequestHandler,
  publicUser: (u: any) => any,
) {
  const users = db.collection<any>("players");
  const limit = rateLimit({
    message: { error: "Too many requests. Please try again shortly." },
    windowMs: 60000,
    limit: 60,
  });
  const empty = z.object({}).strict();
  // Every answer carries the new balance and the whole board, so one round trip redraws it.
  const answer = (res: any, u: any, extra: object) =>
    res.json({ ...extra, player: publicUser(u), today: todayView(u) });
  /** A refusal reads the player again: the request's copy may predate the claim that beat it. */
  async function refuse(
    req: any,
    res: any,
    status: number,
    error: string | ((u: any) => string),
    extra: object = {},
  ) {
    const u = await users.findOne({ _id: req.player._id });
    res.status(status).json({
      error: typeof error === "string" ? error : error(u),
      ...extra,
      today: u ? todayView(u) : null,
    });
  }

  app.get("/me/today", required, (req: any, res) =>
    res.json(todayView(req.player)),
  );

  app.post("/me/streak/claim", required, limit, async (req: any, res) => {
    empty.parse(req.body ?? {});
    const date = dailyKey();
    const last = req.player.loginStreak;
    const day = nextStreakDay(last, date);
    const already = "Today's streak reward is already collected.";
    if (!day) return refuse(req, res, 409, already);
    const { stages, paid } = grant(
      DAILY.streak[day - 1],
      DAILY.passXp.streakClaim,
    );
    // The stored date is a compare-and-swap key: two taps read the same streak, and only the
    // first write still finds it unchanged.
    const updated = await users.findOneAndUpdate(
      { _id: req.player._id, "loginStreak.date": last?.date ?? null },
      [...stages, { $set: { loginStreak: { day, date } } }],
      { returnDocument: "after" },
    );
    if (!updated) return refuse(req, res, 409, already);
    answer(res, updated, { day, granted: paid(updated) });
  });

  app.post("/me/gift/claim", required, limit, async (req: any, res) => {
    empty.parse(req.body ?? {});
    const now = new Date();
    const { stages, paid } = grant({ coins: DAILY.gift.coins });
    const updated = await users.findOneAndUpdate(
      {
        _id: req.player._id,
        giftAt: {
          $not: { $gt: new Date(now.getTime() - DAILY.gift.hours * 3600000) },
        },
      },
      [...stages, { $set: { giftAt: now } }],
      { returnDocument: "after" },
    );
    if (!updated) {
      const u = await users.findOne({ _id: req.player._id });
      return res.status(409).json({
        error: "The next free gift is not ready yet.",
        readyAt: u && todayView(u).gift.readyAt,
        today: u ? todayView(u) : null,
      });
    }
    answer(res, updated, { granted: paid(updated) });
  });

  app.post("/me/spin", required, limit, async (req: any, res) => {
    empty.parse(req.body ?? {});
    const date = dailyKey();
    // Rolled before the write and paid inside it: the spin and its prize land together.
    const index = rollWheel();
    const segment = DAILY.wheel[index];
    const { stages, paid } = grant(segment.reward);
    const spin = [...stages, ...missionStages("wheel_spun", 1, date)];
    // The day's free spin goes first; only then does a spin cost an earned token.
    const updated =
      (await users.findOneAndUpdate(
        {
          _id: req.player._id,
          $or: [
            { spinFreeDay: { $ne: date } },
            { spinFreeUsed: { $lt: DAILY.spins.freePerDay } },
          ],
        },
        [
          ...spin,
          {
            $set: {
              spinFreeDay: date,
              spinFreeUsed: {
                $cond: [
                  { $eq: ["$spinFreeDay", date] },
                  { $add: [{ $ifNull: ["$spinFreeUsed", 0] }, 1] },
                  1,
                ],
              },
            },
          },
        ],
        { returnDocument: "after" },
      )) ||
      (await users.findOneAndUpdate(
        { _id: req.player._id, spinTokens: { $gte: 1 } },
        [...spin, { $set: { spinTokens: { $subtract: ["$spinTokens", 1] } } }],
        { returnDocument: "after" },
      ));
    if (!updated)
      return refuse(req, res, 409, (u) =>
        adsConfigured() && u && todayView(u).spin.adSpinsLeft > 0
          ? "No spins left. Watch a video for another."
          : "No spins left today. Your free spin is back tomorrow.",
      );
    answer(res, updated, {
      index,
      prize: {
        label: segment.label,
        jackpot: !!segment.jackpot,
        ...publicReward(segment.reward),
      },
      granted: paid(updated),
    });
  });

  app.post("/me/missions/:id/claim", required, limit, async (req: any, res) => {
    empty.parse(req.body ?? {});
    const date = dailyKey();
    const mission = pickMissions(req.player._id, date).find(
      (m) => m.id === req.params.id,
    );
    if (!mission)
      return refuse(req, res, 404, "That mission is not on today's board.");
    const { stages, paid } = grant(mission.reward, mission.passXp);
    const updated = await users.findOneAndUpdate(
      {
        _id: req.player._id,
        "missions.date": date,
        "missions.claimed": { $ne: mission.id },
        [`missions.progress.${mission.event}`]: { $gte: mission.goal },
      },
      [
        ...stages,
        {
          $set: {
            "missions.claimed": {
              $concatArrays: [
                { $ifNull: ["$missions.claimed", []] },
                [mission.id],
              ],
            },
          },
        },
      ],
      { returnDocument: "after" },
    );
    if (!updated)
      return refuse(req, res, 409, (u) =>
        u?.missions?.date === date &&
        (u.missions.claimed || []).includes(mission.id)
          ? "This mission's reward is already collected."
          : "Finish the mission first.",
      );
    answer(res, updated, { mission: mission.id, granted: paid(updated) });
  });

  app.post("/me/missions/bonus", required, limit, async (req: any, res) => {
    empty.parse(req.body ?? {});
    const date = dailyKey();
    const ids = pickMissions(req.player._id, date).map((m) => m.id);
    const { reward, passXp } = DAILY.missions.bonus;
    const { stages, paid } = grant(reward, passXp);
    const updated = await users.findOneAndUpdate(
      {
        _id: req.player._id,
        "missions.date": date,
        "missions.claimed": { $all: ids },
        "missions.bonus": { $ne: true },
      },
      [...stages, { $set: { "missions.bonus": true } }],
      { returnDocument: "after" },
    );
    if (!updated)
      return refuse(req, res, 409, (u) =>
        u?.missions?.date === date && u.missions.bonus
          ? "Today's bonus is already collected."
          : "Collect all three missions first.",
      );
    answer(res, updated, { granted: paid(updated) });
  });

  app.post("/me/pass/claim", required, limit, async (req: any, res) => {
    const { tier, track: lane } = z
      .object({
        tier: z.number().int().min(1).max(DAILY.pass.free.length),
        track: z.enum(["free", "premium"]),
      })
      .strict()
      .parse(req.body);
    const season = currentSeason().id;
    const { stages, paid } = grant(DAILY.pass[lane][tier - 1]);
    const updated = await users.findOneAndUpdate(
      {
        _id: req.player._id,
        "pass.season": season,
        "pass.xp": { $gte: tier * DAILY.pass.xpPerTier },
        [`pass.${lane}`]: { $ne: tier },
        ...(lane === "premium" ? { passPremiumSeason: season } : {}),
      },
      [
        ...stages,
        {
          $set: {
            [`pass.${lane}`]: {
              $concatArrays: [{ $ifNull: [`$pass.${lane}`, []] }, [tier]],
            },
          },
        },
      ],
      { returnDocument: "after" },
    );
    if (!updated) {
      const u = await users.findOne({ _id: req.player._id });
      const view = u && todayView(u);
      const locked = lane === "premium" && !view?.pass.premium;
      return res.status(locked ? 403 : 409).json({
        error: locked
          ? "This reward is on the premium track. Unlock the pass to claim it."
          : view?.pass.claimed[lane].includes(tier)
            ? "This tier is already claimed."
            : `Reach tier ${tier} first.`,
        today: view,
      });
    }
    answer(res, updated, { tier, track: lane, granted: paid(updated) });
  });
}
