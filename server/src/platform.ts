import { installUsdc } from "./usdc";
import { installAdminAuth, passwordHash } from "./adminAuth";
import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Express, RequestHandler } from "express";
import type { Db } from "mongodb";
import { rateLimit } from "express-rate-limit";

export const FORMATS = ["drill", "series"] as const;
export const BEST_OF = [1, 3, 5] as const;
export type EventFormat = (typeof FORMATS)[number];
export const eventInput = z
  .object({
    name: z.string().trim().min(3).max(70),
    /**
     * drill: the server-replayed straight-pot score attack, ranked by fewest shots.
     * series: a best-of-1/3/5 eight-ball series against a seeded club rival, ranked by frames won.
     */
    format: z.enum(FORMATS).default("drill"),
    bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(1),
    maxPlayers: z.number().int().min(2).max(10000).default(64),
    minPlayers: z.number().int().min(1).max(10000).default(1),
    /** Join deadline. Entries close here; play runs from startsAt to endsAt. */
    registrationClosesAt: z.iso.datetime().optional(),
    subtitle: z.string().trim().min(3).max(100),
    description: z.string().trim().min(10).max(2000),
    level: z.number().int().min(1).max(100),
    currency: z.enum(["coins", "USDC"]),
    reward: z.number().int().min(0).max(10000),
    entry: z.number().int().min(0).max(1000000).default(0),
    placements: z
      .array(
        z
          .object({
            position: z.number().int().min(1).max(1000),
            amount: z.number().positive().max(1000000),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(250)
      .default([]),
    prize: z.string().trim().min(3).max(160),
    rules: z.array(z.string().trim().min(3).max(500)).min(2).max(20),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "End must follow start",
  )
  .refine(
    (v) =>
      !v.registrationClosesAt ||
      Date.parse(v.registrationClosesAt) <= Date.parse(v.startsAt),
    "The join deadline must be on or before the start",
  )
  .refine(
    (v) => v.minPlayers <= v.maxPlayers,
    "Minimum players cannot exceed the player cap",
  )
  .refine(
    (v) => v.format === "drill" || v.currency === "coins",
    "Series events pay coins",
  )
  .refine(
    (v) => v.placements.every((p) => p.position <= v.maxPlayers),
    "A rewarded position cannot exceed the player cap",
  )
  .refine(
    (v) =>
      new Set(v.placements.map((p) => p.position)).size === v.placements.length,
    "Each rewarded position must be unique",
  )
  .refine(
    (v) => new Set(v.countries).size === v.countries.length,
    "Countries must be unique",
  )
  .refine(
    (v) =>
      v.placements.every((p) =>
        v.currency === "coins"
          ? Number.isInteger(p.amount)
          : /^\d+(\.\d{1,6})?$/.test(String(p.amount)),
      ),
    "Use whole coins or at most six decimal places for USDC",
  );
/** Events written before formats existed read as the original straight-pot score attack. */
export function eventDefaults<T extends Record<string, any>>(e: T) {
  return {
    ...e,
    format: (e.format || "drill") as EventFormat,
    bestOf: e.bestOf || 1,
    maxPlayers: e.maxPlayers || 10000,
    minPlayers: e.minPlayers || 1,
  };
}
export function publicEvent(e: any) {
  const { _id, history, createdBy, updatedBy, payouts, ...publicFields } =
    eventDefaults(e);
  return { ...publicFields, joinDeadline: joinDeadlineOf(e) };
}
/** ISO join deadline: the explicit one, else the start for a series, else the close for a drill. */
export function joinDeadlineOf(e: any): string | null {
  if (e.registrationClosesAt) return e.registrationClosesAt;
  if ((e.format || "drill") === "series") return e.startsAt || null;
  return e.endsAt || null;
}
function coinEvent(e: any) {
  // Coins are virtual items. USDC would be a real-currency payout, which needs eligibility
  // and settlement that do not exist; country lists imply the same. Both stay closed.
  return (
    !!e && e.status === "open" && e.currency === "coins" && !e.countries?.length
  );
}
/** Entries are accepted while the event is published and the join deadline has not passed. */
export function registrationOpen(e: any, now = Date.now()) {
  const deadline = joinDeadlineOf(e);
  return coinEvent(e) && (!deadline || Date.parse(deadline) > now);
}
/** Play (drill submits, series frames) runs from the start to the close. */
export function eventIsOpen(e: any, now = Date.now()) {
  return (
    coinEvent(e) &&
    (!e.startsAt || Date.parse(e.startsAt) <= now) &&
    (!e.endsAt || Date.parse(e.endsAt) > now)
  );
}
export type EventPhase =
  | "draft"
  | "announced"
  | "registration"
  | "waiting"
  | "play"
  | "closed"
  | "cancelled";
/** The one word the client and console key their state on. */
export function eventPhase(e: any, now = Date.now()): EventPhase {
  if (!e || e.status === "draft") return "draft";
  if (e.status === "announced") return "announced";
  if (e.status === "closed") return "closed";
  if (e.status === "cancelled") return "cancelled";
  if (e.endsAt && Date.parse(e.endsAt) <= now) return "closed";
  if (registrationOpen(e, now) && !eventIsOpen(e, now)) return "registration";
  if (eventIsOpen(e, now)) return "play";
  return "waiting";
}
/** Frames a side must win to take the series. */
export function seriesTarget(bestOf: number) {
  return Math.ceil(bestOf / 2);
}
/** Lower is better, like the drill score: frames dropped short of the target, then frames lost, then time at the table. */
export function seriesScore(
  bestOf: number,
  wins: number,
  losses: number,
  playedMs: number,
) {
  return (
    Math.max(0, seriesTarget(bestOf) - wins) * 1e9 +
    losses * 1e6 +
    Math.min(999999, Math.max(0, Math.round(playedMs / 1000)))
  );
}
/** Shortest eight-ball frame the referee accepts as a win; faster claims are recorded as losses. */
export function frameMinimumMs() {
  return Math.max(0, Number(process.env.EVENT_MIN_FRAME_MS || 12000));
}
export function publicSeries(entry: any) {
  if (!entry) return null;
  const frames = (entry.frames || []) as any[];
  const active = frames.find((f) => f.id === entry.activeFrame) || null;
  return {
    bestOf: entry.bestOf,
    wins: entry.wins || 0,
    losses: entry.losses || 0,
    done: !!entry.done,
    opponent: entry.opponent || null,
    activeFrame: active
      ? { id: active.id, seed: active.seed, startedAt: active.startedAt }
      : null,
    frames: frames.map((f) => ({
      id: f.id,
      outcome: f.outcome || null,
      startedAt: f.startedAt,
      endedAt: f.endedAt || null,
      flag: f.flag || null,
    })),
  };
}
/** Prize coins owed per finishing position, once an event closes. */
export function placementFor(event: any, position: number) {
  const row = (event.placements || []).find(
    (p: any) => p.position === position,
  );
  return row ? Math.floor(row.amount) : 0;
}
export function installPlatform(
  app: Express,
  db: Db,
  required: RequestHandler,
) {
  const users = db.collection<{
      _id: string;
      adminHistory: Record<string, unknown>[];
      [key: string]: any;
    }>("players"),
    events = db.collection<{
      _id: string;
      history: Record<string, unknown>[];
      [key: string]: any;
    }>("tournaments"),
    reports = db.collection<any>("reports"),
    entries = db.collection<any>("entries"),
    audit = db.collection<any>("adminAudit");
  const staffRequired = installAdminAuth(app, db);
  const admin: RequestHandler = (req: any, res, next) => {
    if (
      !["owner", "admin"].includes(req.player.role) ||
      !req.staff ||
      req.staff.mustChangePassword
    )
      return res.status(403).json({ error: "Administrator access required." });
    if (
      !req.session?.issuedAt ||
      Date.now() - new Date(req.session.issuedAt).getTime() > 15 * 60_000
    )
      return res
        .status(401)
        .json({ error: "Sign in again to administer CueMaster." });
    next();
  };
  const owner: RequestHandler = (req: any, res, next) =>
    req.player.role === "owner"
      ? next()
      : res.status(403).json({ error: "Owner access required." });
  app.get("/leaderboard", required, async (req: any, res) => {
    const scope = z
      .enum(["global", "country"])
      .default("global")
      .parse(req.query.scope);
    const blocked = req.player.blockedPlayers || [];
    const country = scope === "country" ? req.player.country : null;
    if (scope === "country" && !country)
      return res.json({
        scope,
        players: [],
        message: "Set your country in your profile first.",
      });
    const board = await users
      .find(
        {
          suspended: { $ne: true },
          _id: { $nin: blocked },
          ...(country ? { country } : {}),
        },
        {
          projection: {
            name: 1,
            avatar: 1,
            country: 1,
            xp: 1,
            "stats.finishes": 1,
          },
        },
      )
      .sort({ xp: -1, "stats.finishes": -1, _id: 1 })
      .limit(100)
      .toArray();
    res.json({
      scope,
      metric: "Verified progression XP",
      players: board.map((u, i) => ({
        id: u._id,
        rank: i + 1,
        name: u.name,
        avatar: u.avatar,
        country: u.country,
        xp: u.xp,
        finishes: u.stats?.finishes || 0,
      })),
    });
  });
  app.post(
    "/players/:id/report",
    required,
    rateLimit({
      message: { error: "Too many requests. Please try again shortly." },
      windowMs: 3600000,
      limit: 10,
    }),
    async (req: any, res) => {
      const input = z
        .object({
          reason: z.enum(["name", "abuse", "cheating"]),
          details: z.string().trim().max(1000).default(""),
        })
        .strict()
        .parse(req.body);
      if (
        req.params.id === req.player._id ||
        !(await users.findOne({ _id: req.params.id }))
      )
        return res.status(404).json({ error: "Player not found." });
      await reports.insertOne({
        _id: randomUUID(),
        reporterId: req.player._id,
        playerId: req.params.id,
        ...input,
        status: "open",
        createdAt: new Date(),
      });
      res.status(201).json({ received: true });
    },
  );
  app.post(
    "/players/:id/block",
    required,
    rateLimit({
      message: { error: "Too many requests. Please try again shortly." },
      windowMs: 3600000,
      limit: 60,
    }),
    async (req: any, res) => {
      if (
        req.params.id === req.player._id ||
        !(await users.findOne({ _id: req.params.id }))
      )
        return res.status(404).json({ error: "Player not found." });
      if ((req.player.blockedPlayers || []).length >= 500)
        return res.status(409).json({
          error: "Block list is full. Unblock someone before adding another.",
        });
      await users.updateOne(
        { _id: req.player._id },
        { $addToSet: { blockedPlayers: req.params.id } },
      );
      res.json({ blocked: true });
    },
  );
  app.get("/me/blocked", required, async (req: any, res) => {
    const rows = await users
      .find(
        { _id: { $in: req.player.blockedPlayers || [] } },
        { projection: { name: 1 } },
      )
      .limit(200)
      .toArray();
    res.json({ players: rows.map((u) => ({ id: u._id, name: u.name })) });
  });
  app.delete("/players/:id/block", required, async (req: any, res) => {
    await users.updateOne(
      { _id: req.player._id },
      { $pull: { blockedPlayers: req.params.id } as any },
    );
    res.status(204).end();
  });
  installUsdc(app, db, required);
  app.get("/admin/overview", staffRequired, admin, async (_req, res) =>
    res.json({
      players: await users.countDocuments(),
      tournaments: await events.countDocuments(),
      openReports: await reports.countDocuments({ status: "open" }),
      payoutsEnabled: false,
    }),
  );
  async function entrantCounts(ids: string[]) {
    const rows = await entries
      .aggregate([
        { $match: { eventId: { $in: ids } } },
        { $group: { _id: "$eventId", n: { $sum: 1 } } },
      ])
      .toArray();
    return new Map(rows.map((r: any) => [r._id as string, r.n as number]));
  }
  app.get("/admin/tournaments", staffRequired, admin, async (_req, res) => {
    const rows = await events
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    const counts = await entrantCounts(rows.map((e) => e.id));
    res.json(
      rows.map((e) => ({
        ...publicEvent(e),
        entrants: counts.get(e.id) || 0,
        phase: eventPhase(e),
        payouts: e.payouts || null,
        settledAt: e.settledAt || null,
        cancelledAt: e.cancelledAt || null,
      })),
    );
  });
  /** Who is in, and how they stand: the console's participants view. */
  app.get(
    "/admin/tournaments/:id/entries",
    staffRequired,
    admin,
    async (req: any, res) => {
      const event = await events.findOne({ id: req.params.id });
      if (!event) return res.status(404).json({ error: "Event not found." });
      const rows = await entries
        .aggregate([
          { $match: { eventId: event.id } },
          { $sort: { score: 1, submittedAt: 1, joinedAt: 1 } },
          { $limit: 500 },
          {
            $lookup: {
              from: "players",
              localField: "playerId",
              foreignField: "_id",
              as: "player",
            },
          },
          { $unwind: { path: "$player", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              playerId: 1,
              name: { $ifNull: ["$player.name", "(deleted)"] },
              country: "$player.country",
              suspended: "$player.suspended",
              entry: 1,
              joinedAt: 1,
              score: 1,
              shots: 1,
              wins: 1,
              losses: 1,
              done: 1,
              activeFrame: 1,
              frames: { $size: { $ifNull: ["$frames", []] } },
            },
          },
        ])
        .toArray();
      res.json(rows);
    },
  );
  app.post(
    "/admin/tournaments",
    staffRequired,
    admin,
    async (req: any, res) => {
      const data = eventInput.parse(req.body),
        id = randomUUID(),
        at = new Date();
      const event = {
        ...data,
        registrationClosesAt: data.registrationClosesAt ?? joinDeadlineOf(data),
        id,
        kind: data.currency === "USDC" ? "crypto" : "coins",
        status: "draft",
        drill: "pocket",
        targets: [1],
        version: 1,
        createdAt: at,
        createdBy: req.player._id,
        history: [{ action: "created", actor: req.player._id, at }],
      };
      await events.insertOne({ _id: id, ...event });
      res.status(201).json(publicEvent(event));
    },
  );
  app.patch(
    "/admin/tournaments/:id",
    staffRequired,
    admin,
    async (req: any, res) => {
      const { version, ...data } = z
        .object({ version: z.number().int().positive(), data: eventInput })
        .strict()
        .parse(req.body);
      const updated = await events.findOneAndUpdate(
        { id: req.params.id, status: "draft", version },
        {
          $set: {
            ...data.data,
            registrationClosesAt:
              data.data.registrationClosesAt ?? joinDeadlineOf(data.data),
            kind: data.data.currency === "USDC" ? "crypto" : "coins",
            updatedBy: req.player._id,
          },
          $inc: { version: 1 },
          $push: {
            history: {
              action: "edited",
              actor: req.player._id,
              at: new Date(),
            },
          } as any,
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return res.status(409).json({
          error: "Only current drafts can be edited. Refresh before retrying.",
        });
      res.json(publicEvent(updated));
    },
  );
  app.post(
    "/admin/tournaments/:id/status",
    staffRequired,
    admin,
    async (req: any, res) => {
      const { status, version, reason } = z
        .object({
          status: z.enum(["announced", "open", "closed", "cancelled"]),
          version: z.number().int().positive(),
          reason: z.string().trim().min(5).max(300).optional(),
        })
        .strict()
        .parse(req.body);
      const event = await events.findOne({ id: req.params.id, version });
      if (!event)
        return res
          .status(409)
          .json({ error: "Event changed. Refresh before retrying." });
      const allowed: Record<string, string[]> = {
        draft: ["announced", "open"],
        announced: ["open", "cancelled"],
        open: ["closed", "cancelled"],
        closed: [],
        cancelled: [],
      };
      if (!allowed[event.status]?.includes(status))
        return res.status(409).json({
          error:
            event.status === "open"
              ? "A live competition can only be closed (paying prizes) or cancelled (refunding entries)."
              : event.status === "draft"
                ? "Announce or open a draft; it cannot be closed before it runs."
                : "Published competitions cannot change back. Create a new event for new rules.",
        });
      if (status === "cancelled" && !reason)
        return res
          .status(400)
          .json({ error: "Give players a reason for the cancellation." });
      if (status === "open") {
        if (
          event.currency !== "coins" ||
          event.countries?.length ||
          event.drill !== "pocket"
        )
          return res.status(409).json({
            error:
              "Only coin competitions can open. USDC prizes and country restrictions need eligibility and payout setup that is not in place.",
          });
        if (!event.endsAt || Date.parse(event.endsAt) <= Date.now())
          return res
            .status(409)
            .json({ error: "Choose a future closing date before publishing." });
        const deadline = joinDeadlineOf(event);
        if (deadline && Date.parse(deadline) <= Date.now())
          return res.status(409).json({
            error:
              "The join deadline has already passed. Move the deadline or start into the future so players have time to enter.",
          });
        if (
          eventDefaults(event).format === "series" &&
          !(event.placements || []).length &&
          !event.reward
        )
          return res.status(409).json({
            error: "A series needs prize placements or a completion reward.",
          });
      }
      const updated = await events.findOneAndUpdate(
        { id: event.id, version },
        {
          $set: {
            status,
            ...(status === "cancelled"
              ? { cancelledAt: new Date(), cancelReason: reason }
              : {}),
          },
          $inc: { version: 1 },
          $push: {
            history: {
              action: status,
              actor: req.player._id,
              at: new Date(),
              ...(reason ? { reason } : {}),
            },
          } as any,
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return res
          .status(409)
          .json({ error: "Event changed. Refresh before retrying." });
      const settlement =
        status === "closed"
          ? await settle(updated, req.staff._id)
          : status === "cancelled"
            ? await refund(updated, req.staff._id, reason!)
            : null;
      res.json({ ...publicEvent(updated), settlement });
    },
  );
  /**
   * Pay a closed coin competition. The ranking matches the public board (drill: fewest shots,
   * then earliest; series: most frames won, fewest lost, then least time at the table). The
   * ranked payout list is written to the event once, so a re-run — or a resume after a crash —
   * pays the same people the same coins, even if a player above them is suspended or deleted
   * afterwards. Each credit is also guarded by its own `prize:<event>` marker.
   */
  async function rankEntries(eventId: string, limit: number) {
    return entries
      .aggregate([
        { $match: { eventId, score: { $exists: true } } },
        { $sort: { score: 1, submittedAt: 1 } },
        {
          $lookup: {
            from: "players",
            localField: "playerId",
            foreignField: "_id",
            as: "player",
          },
        },
        { $unwind: "$player" },
        // Suspended players are hidden from the public board, so they must not be paid from it
        // either: banning a cheater before settlement has to actually cost them the prize.
        { $match: { "player.suspended": { $ne: true } } },
        { $limit: limit },
        { $project: { playerId: 1 } },
      ])
      .toArray();
  }
  async function settle(event: any, actor: string) {
    if (event.currency !== "coins" || !(event.placements || []).length)
      return { paid: [], skipped: "No coin placements to pay." };
    let payouts: { playerId: string; position: number; coins: number }[] =
      event.payouts;
    if (!payouts) {
      const ranked = await rankEntries(event.id, 1000);
      payouts = ranked
        .map((entry, index) => ({
          playerId: entry.playerId as string,
          position: index + 1,
          coins: placementFor(event, index + 1),
        }))
        .filter((p) => p.coins > 0);
      const sealed = await events.findOneAndUpdate(
        { id: event.id, payouts: { $exists: false } },
        { $set: { payouts, settledAt: new Date() } },
        { returnDocument: "after" },
      );
      // Another settle call sealed the list first; pay from that one.
      if (!sealed)
        payouts = (await events.findOne({ id: event.id }))?.payouts || [];
    }
    const paid: typeof payouts = [];
    for (const row of payouts) {
      const key = `prize:${event.id}`;
      const credited = await users.findOneAndUpdate(
        { _id: row.playerId, completed: { $ne: key } },
        { $addToSet: { completed: key }, $inc: { coins: row.coins } },
      );
      if (credited) paid.push(row);
    }
    await audit.insertOne({
      _id: randomUUID(),
      action: "tournament.settled",
      actor,
      at: new Date(),
      event: { id: event.id, name: event.name },
      reason: `Paid ${paid.length} placement${paid.length === 1 ? "" : "s"}`,
      paid,
    });
    return { paid, payouts };
  }
  /** Return every entry fee of a cancelled event exactly once. */
  async function refund(event: any, actor: string, reason: string) {
    const rows = await entries
      .find({ eventId: event.id, entry: { $gt: 0 } })
      .project({ playerId: 1, entry: 1 })
      .toArray();
    const refunded: { playerId: string; coins: number }[] = [];
    for (const row of rows) {
      const key = `refund:${event.id}`;
      const credited = await users.findOneAndUpdate(
        { _id: row.playerId, completed: { $ne: key } },
        { $addToSet: { completed: key }, $inc: { coins: row.entry } },
      );
      if (credited) refunded.push({ playerId: row.playerId, coins: row.entry });
    }
    await audit.insertOne({
      _id: randomUUID(),
      action: "tournament.cancelled",
      actor,
      at: new Date(),
      event: { id: event.id, name: event.name },
      reason,
      refunded,
    });
    return { refunded };
  }
  /**
   * The clock the console does not have to watch. Every tick: a published event whose start
   * arrived with too few entrants is cancelled and refunded; a published event whose close
   * arrived is closed and paid. Both transitions are version-guarded, so a manual click and the
   * scheduler cannot double-act.
   */
  async function runLifecycle(now = new Date()) {
    const acted: { id: string; action: string }[] = [];
    const short = await events
      .find({
        status: "open",
        startsAt: { $lte: now.toISOString() },
        minPlayers: { $gt: 1 },
      })
      .toArray();
    for (const event of short) {
      const entrants = await entries.countDocuments({ eventId: event.id });
      if (entrants >= event.minPlayers) continue;
      const reason = `Only ${entrants} of the ${event.minPlayers} players needed entered before the start.`;
      const updated = await events.findOneAndUpdate(
        { id: event.id, version: event.version, status: "open" },
        {
          $set: { status: "cancelled", cancelledAt: now, cancelReason: reason },
          $inc: { version: 1 },
          $push: {
            history: {
              action: "cancelled",
              actor: "scheduler",
              at: now,
              reason,
            },
          } as any,
        },
        { returnDocument: "after" },
      );
      if (updated) {
        await refund(updated, "scheduler", reason);
        acted.push({ id: event.id, action: "cancelled" });
      }
    }
    const due = await events
      .find({ status: "open", endsAt: { $lte: now.toISOString() } })
      .toArray();
    for (const event of due) {
      const updated = await events.findOneAndUpdate(
        { id: event.id, version: event.version, status: "open" },
        {
          $set: { status: "closed" },
          $inc: { version: 1 },
          $push: {
            history: { action: "closed", actor: "scheduler", at: now },
          } as any,
        },
        { returnDocument: "after" },
      );
      if (updated) {
        await settle(updated, "scheduler");
        acted.push({ id: event.id, action: "closed" });
      }
    }
    return acted;
  }
  const tick = Number(process.env.EVENT_TICK_MS || 30000);
  if (tick > 0) {
    const timer = setInterval(() => {
      runLifecycle().catch((e) =>
        console.error("Event lifecycle tick failed:", (e as Error).message),
      );
    }, tick);
    timer.unref();
  }
  app.post(
    "/admin/tournaments/lifecycle",
    staffRequired,
    admin,
    async (_req, res) => res.json({ acted: await runLifecycle() }),
  );
  app.post(
    "/admin/tournaments/:id/settle",
    staffRequired,
    admin,
    async (req: any, res) => {
      const event = await events.findOne({ id: req.params.id });
      if (!event) return res.status(404).json({ error: "Event not found." });
      if (event.status !== "closed")
        return res
          .status(409)
          .json({ error: "Close the event before paying prizes." });
      res.json(await settle(event, req.staff._id));
    },
  );
  app.delete(
    "/admin/tournaments/:id",
    staffRequired,
    admin,
    async (req: any, res) => {
      const { version, reason } = z
        .object({
          version: z.number().int().positive(),
          reason: z.string().trim().min(5).max(300),
        })
        .strict()
        .parse(req.body);
      const event = await events.findOne({ id: req.params.id, version });
      if (!event)
        return res
          .status(409)
          .json({ error: "Event changed. Refresh before retrying." });
      // An open competition holds live entries; close it first so players see a result.
      if (event.status === "open")
        return res
          .status(409)
          .json({ error: "Close the competition before deleting it." });
      if (await entries.countDocuments({ eventId: event.id }, { limit: 1 }))
        return res.status(409).json({
          error:
            "Players have entered this event. Their records must be kept; close it instead.",
        });
      // Written before the delete: the audit must survive even if the removal fails.
      await audit.insertOne({
        _id: randomUUID(),
        action: "tournament.deleted",
        actor: req.staff._id,
        actorName: req.staff.username,
        reason,
        at: new Date(),
        event: publicEvent(event),
      });
      const removed = await events.deleteOne({ id: event.id, version });
      if (!removed.deletedCount)
        return res
          .status(409)
          .json({ error: "Event changed. Refresh before retrying." });
      res.json({ deleted: true });
    },
  );
  app.get("/admin/audit", staffRequired, admin, async (_req, res) =>
    res.json(await audit.find({}).sort({ at: -1 }).limit(200).toArray()),
  );
  app.get("/admin/players", staffRequired, admin, async (req: any, res) => {
    const q = z.string().max(80).default("").parse(req.query.q);
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rows = await users
      .find(
        q
          ? { $or: [{ _id: q }, { name: { $regex: safe, $options: "i" } }] }
          : {},
        {
          projection: {
            name: 1,
            role: 1,
            suspended: 1,
            xp: 1,
            coins: 1,
            createdAt: 1,
          },
        },
      )
      .limit(50)
      .toArray();
    res.json(rows.map(({ _id, ...p }) => ({ id: _id, ...p })));
  });
  app.patch(
    "/admin/players/:id",
    staffRequired,
    admin,
    async (req: any, res) => {
      const input = z
        .object({
          suspended: z.boolean().optional(),
          name: z
            .string()
            .trim()
            .min(2)
            .max(24)
            .regex(/^[\p{L}\p{N} _.'-]+$/u)
            .optional(),
          reason: z.string().trim().min(5).max(300),
        })
        .strict()
        .parse(req.body);
      const target = await users.findOne({ _id: req.params.id });
      if (!target) return res.status(404).json({ error: "Player not found." });
      if (
        target.role === "owner" ||
        (target.role === "admin" && req.player.role !== "owner")
      )
        return res
          .status(403)
          .json({ error: "Cannot modify this administrator." });
      const { reason, ...update } = input;
      const changed = await users.updateOne(
        { _id: target._id, role: target.role ?? { $exists: false } },
        {
          $set: update,
          $push: {
            adminHistory: {
              actor: req.player._id,
              at: new Date(),
              reason,
              changes: update,
            },
          } as any,
        },
      );
      if (!changed.matchedCount)
        return res
          .status(409)
          .json({ error: "Player changed. Refresh before retrying." });
      if (input.suspended)
        await db.collection("sessions").deleteMany({ playerId: target._id });
      res.json({ updated: true });
    },
  );
  app.get("/admin/staff", staffRequired, admin, owner, async (_req, res) =>
    res.json(
      await db
        .collection("administrators")
        .find({}, { projection: { passwordHash: 0 } })
        .limit(50)
        .toArray(),
    ),
  );
  app.post(
    "/admin/staff",
    staffRequired,
    admin,
    owner,
    async (req: any, res) => {
      const input = z
        .object({
          username: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9._-]{3,60}$/),
          name: z.string().trim().min(2).max(80),
          email: z.email().max(254),
        })
        .strict()
        .parse(req.body);
      const temporaryPassword = randomBytes(24).toString("base64url"),
        id = randomUUID();
      await db.collection<any>("administrators").insertOne({
        _id: id,
        ...input,
        role: "admin",
        passwordHash: await passwordHash(temporaryPassword),
        mustChangePassword: true,
        emailVerified: false,
        createdAt: new Date(),
        history: [{ action: "created", actor: req.staff._id, at: new Date() }],
      });
      res.set("Cache-Control", "no-store").status(201).json({
        id,
        temporaryPassword,
        message:
          "Shown once. Deliver privately. Password change is required at first sign-in.",
      });
    },
  );
  app.patch(
    "/admin/staff/:id",
    staffRequired,
    admin,
    owner,
    async (req: any, res) => {
      const input = z
        .object({
          disabled: z.boolean(),
          reason: z.string().trim().min(5).max(300),
        })
        .strict()
        .parse(req.body);
      const changed = await db.collection<any>("administrators").updateOne(
        { _id: req.params.id, role: "admin" },
        {
          $set: { disabled: input.disabled },
          $push: {
            history: {
              action: input.disabled ? "disabled" : "enabled",
              actor: req.staff._id,
              reason: input.reason,
              at: new Date(),
            },
          } as any,
        },
      );
      if (!changed.matchedCount)
        return res.status(404).json({
          error: "Staff member not found or protected owner account.",
        });
      await db
        .collection("adminSessions")
        .deleteMany({ adminId: req.params.id });
      res.json({ updated: true });
    },
  );
  app.get("/admin/reports", staffRequired, admin, async (_req, res) =>
    res.json(
      await reports
        .find({ status: "open" })
        .sort({ createdAt: 1 })
        .limit(100)
        .toArray(),
    ),
  );
  app.post(
    "/admin/reports/:id/resolve",
    staffRequired,
    admin,
    async (req: any, res) => {
      const { note } = z
        .object({ note: z.string().trim().min(3).max(500) })
        .strict()
        .parse(req.body);
      const changed = await reports.updateOne(
        { _id: req.params.id, status: "open" },
        {
          $set: {
            status: "resolved",
            note,
            resolvedBy: req.player._id,
            resolvedAt: new Date(),
          },
        },
      );
      if (!changed.matchedCount)
        return res.status(409).json({ error: "Report is no longer open." });
      res.json({ resolved: true });
    },
  );
  app.get(
    "/admin/tournaments/:id/audit",
    staffRequired,
    admin,
    async (req: any, res) => {
      const event = await events.findOne({ id: req.params.id });
      if (!event) return res.status(404).json({ error: "Event not found." });
      res.json(event.history || []);
    },
  );
}
