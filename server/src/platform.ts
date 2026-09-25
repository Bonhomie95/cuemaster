import { installUsdc } from "./usdc";
import { installAdminAuth, passwordHash } from "./adminAuth";
import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Express, RequestHandler } from "express";
import type { Db } from "mongodb";
import { rateLimit } from "express-rate-limit";

export const eventInput = z
  .object({
    name: z.string().trim().min(3).max(70),
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
export function publicEvent(e: any) {
  const { _id, history, createdBy, updatedBy, ...publicFields } = e;
  return publicFields;
}
export function eventIsOpen(e: any, now = Date.now()) {
  return (
    !!e &&
    e.status === "open" &&
    // Coins are virtual items. USDC would be a real-currency payout, which needs eligibility
    // and settlement that do not exist; country lists imply the same. Both stay closed.
    e.currency === "coins" &&
    !e.countries?.length &&
    (!e.startsAt || Date.parse(e.startsAt) <= now) &&
    (!e.endsAt || Date.parse(e.endsAt) > now)
  );
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
  app.get("/admin/tournaments", staffRequired, admin, async (_req, res) =>
    res.json(
      (await events.find({}).sort({ createdAt: -1 }).limit(100).toArray()).map(
        publicEvent,
      ),
    ),
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
      const { status, version } = z
        .object({
          status: z.enum(["announced", "open", "closed"]),
          version: z.number().int().positive(),
        })
        .strict()
        .parse(req.body);
      const event = await events.findOne({ id: req.params.id, version });
      if (!event)
        return res
          .status(409)
          .json({ error: "Event changed. Refresh before retrying." });
      if (
        event.status === "closed" ||
        (event.status === "open" && status !== "closed")
      )
        return res.status(409).json({
          error:
            "Published competitions can only be closed. Create a new event for new rules.",
        });
      if (
        status === "open" &&
        (event.currency !== "coins" ||
          event.countries?.length ||
          event.drill !== "pocket")
      )
        return res.status(409).json({
          error:
            "Only coin competitions can open. USDC prizes and country restrictions need eligibility and payout setup that is not in place.",
        });
      if (
        status === "open" &&
        (!event.endsAt || Date.parse(event.endsAt) <= Date.now())
      )
        return res
          .status(409)
          .json({ error: "Choose a future closing date before publishing." });
      const updated = await events.findOneAndUpdate(
        { id: event.id, version },
        {
          $set: { status },
          $inc: { version: 1 },
          $push: {
            history: { action: status, actor: req.player._id, at: new Date() },
          } as any,
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return res
          .status(409)
          .json({ error: "Event changed. Refresh before retrying." });
      const settlement =
        status === "closed" ? await settle(updated, req.staff._id) : null;
      res.json({ ...publicEvent(updated), settlement });
    },
  );
  /**
   * Pay a closed coin competition. Ranking matches the public board: fewest shots first, then
   * whoever got there earliest. Each credit is guarded by its own `prize:<event>` marker, so
   * running this twice — or resuming after a crash — pays every winner exactly once.
   */
  async function settle(event: any, actor: string) {
    if (event.currency !== "coins" || !(event.placements || []).length)
      return { paid: [], skipped: "No coin placements to pay." };
    const ranked = await entries
      .find({ eventId: event.id, score: { $exists: true } })
      .sort({ score: 1, submittedAt: 1 })
      .limit(1000)
      .toArray();
    const paid: { playerId: string; position: number; coins: number }[] = [];
    for (const [index, entry] of ranked.entries()) {
      const coins = placementFor(event, index + 1);
      if (coins <= 0) continue;
      const key = `prize:${event.id}`;
      const credited = await users.findOneAndUpdate(
        { _id: entry.playerId, completed: { $ne: key } },
        { $addToSet: { completed: key }, $inc: { coins } },
      );
      if (credited)
        paid.push({ playerId: entry.playerId, position: index + 1, coins });
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
    return { paid };
  }
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
