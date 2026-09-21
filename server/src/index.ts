import { assertProductionConfig } from "./config";
import {
  appleConfigured,
  exchangeAppleCode,
  revokeAppleToken,
} from "./appleTokens";
import { fileURLToPath } from "node:url";
import { installPlatform, publicEvent, eventIsOpen } from "./platform";
import { makeCpu } from "../../mobile/src/game/cpu";
import { cues, cueById } from "../../mobile/src/game/cues";
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { MongoClient } from "mongodb";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import { venues, challenges, tournaments, levelOf } from "./catalog";
import { verifyIdentity } from "./auth";
assertProductionConfig(process.env);
const port = Number(process.env.PORT || 4000);
const client = new MongoClient(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27028",
);
await client.connect();
const db = client.db(process.env.MONGODB_DB || "cuemaster");
const users = db.collection<any>("players"),
  sessions = db.collection<any>("sessions"),
  tickets = db.collection<any>("practiceTickets"),
  entries = db.collection<any>("entries"),
  nonces = db.collection<any>("nonces");
await Promise.all([
  db
    .collection("walletChallenges")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  sessions.createIndex({ tokenHash: 1 }, { unique: true }),
  db
    .collection("administrators")
    .createIndex({ username: 1 }, { unique: true }),
  db
    .collection("adminSessions")
    .createIndex({ tokenHash: 1 }, { unique: true }),
  db
    .collection("adminSessions")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  users.createIndex({ "providers.google": 1 }, { unique: true, sparse: true }),
  users.createIndex({ "providers.apple": 1 }, { unique: true, sparse: true }),
  entries.createIndex({ playerId: 1, eventId: 1 }, { unique: true }),
  tickets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  nonces.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
]);
const events = db.collection<any>("tournaments");
await events.createIndex({ id: 1 }, { unique: true });
for (const event of tournaments)
  await events.updateOne(
    { id: event.id },
    {
      $setOnInsert: {
        ...event,
        version: 1,
        drill: "pocket",
        targets: [1],
        createdAt: new Date(),
        history: [],
      },
    },
    { upsert: true },
  );
const app = express();
app.disable("x-powered-by");
if(process.env.TRUST_PROXY)app.set("trust proxy",process.env.TRUST_PROXY.split(",").map(s=>s.trim()));
app.use(helmet());
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(
  "/admin",
  express.static(fileURLToPath(new URL("../public/admin", import.meta.url)), {
    index: "index.html",
    dotfiles: "deny",
  }),
);
const origins = (
  process.env.CORS_ORIGINS || "http://localhost:8081,http://127.0.0.1:8081"
).split(",").map(s=>s.trim());
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
  }),
);
app.use(express.json({ limit: "48kb" }));
app.use(
  rateLimit({
    message: { error: "Too many requests. Please try again shortly." },
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
const authLimit = rateLimit({
  message: { error: "Too many requests. Please try again shortly." },
  windowMs: 60_000,
  limit: 15,
});
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const publicUser = (u: any) => ({
  id: u._id,
  name: u.name,
  country: u.country,
  avatar: u.avatar,
  guest: Object.keys(u.providers || {}).length === 0,
  providers: Object.keys(u.providers || {}),
  xp: u.xp,
  level: levelOf(u.xp),
  coins: u.coins,
  ownedCues: u.ownedCues || ["club"],
  selectedCue: u.selectedCue || "club",
  completed: u.completed || [],
  selectedTable: u.selectedTable,
  stats: u.stats || { finishes: 0, shots: 0 },
  createdAt: u.createdAt,
});
async function issue(playerId: string) {
  const token = randomBytes(32).toString("base64url");
  await sessions.insertOne({
    _id: randomUUID(),
    playerId,
    tokenHash: hash(token),
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 86400000),
  });
  return token;
}
async function account(req: any) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const s = await sessions.findOne({
    tokenHash: hash(token),
    expiresAt: { $gt: new Date() },
  });
  req.session = s;
  return s ? await users.findOne({ _id: s.playerId }) : null;
}
async function required(req: any, res: any, next: any) {
  const u = await account(req);
  if (!u) return res.status(401).json({ error: "Please sign in again." });
  if (u.suspended)
    return res
      .status(403)
      .json({ error: "This account is suspended. Contact support." });
  req.player = u;
  next();
}
app.get("/health", async (_req, res) => {
  await db.command({ ping: 1 });
  res.json({ ok: true, database: "mongodb" });
});
app.get("/config", (_req, res) =>
  res.json({
    google: !!process.env.GOOGLE_CLIENT_IDS,
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID || "",
    apple: appleConfigured(),
    cashPayouts: false,
    onlineMatchmaking: false,
  }),
);
app.get("/catalog", async (_req, res) =>
  res.json({
    venues,
    challenges,
    tournaments: (
      await events
        .find({ status: { $ne: "draft" } })
        .limit(100)
        .toArray()
    ).map(publicEvent),
    cues,
  }),
);
app.post("/me/cue", required, async (req: any, res) => {
  const { cueId } = z
    .object({ cueId: z.enum(["club", "precision", "master"]) })
    .parse(req.body);
  const cue = cueById(cueId);
  if (cue.id === "club" || (req.player.ownedCues || []).includes(cue.id)) {
    const u = await users.findOneAndUpdate(
      { _id: req.player._id },
      { $set: { selectedCue: cue.id } },
      { returnDocument: "after" },
    );
    return res.json(publicUser(u));
  }
  const u = await users.findOneAndUpdate(
    {
      _id: req.player._id,
      coins: { $gte: cue.price },
      ownedCues: { $ne: cue.id },
    },
    {
      $inc: { coins: -cue.price },
      $addToSet: { ownedCues: cue.id },
      $set: { selectedCue: cue.id },
    },
    { returnDocument: "after" },
  );
  if (u) return res.json(publicUser(u));
  const current = await users.findOne({ _id: req.player._id });
  if ((current.ownedCues || []).includes(cue.id))
    return res.json(publicUser(current));
  return res.status(409).json({ error: "Not enough coins for this cue." });
});
// Embedded match state makes charging and retry protection a single atomic write.
app.post("/local-matches/start", required, async (req: any, res) => {
  const { venueId, requestId, mode } = z
    .object({
      venueId: z.string(),
      requestId: z.string().uuid(),
      mode: z.enum(["local", "cpu"]).default("local"),
    })
    .parse(req.body);
  const v = venues.find((v) => v.id === venueId);
  if (!v) return res.status(404).json({ error: "Venue not found." });
  const u = await users.findOne({ _id: req.player._id });
  if (u.localMatch?.id === requestId)
    return res.json({ player: publicUser(u), match: u.localMatch });
  if ((u.localEntryIds || []).includes(requestId))
    return res.status(409).json({
      error:
        "This entry request has already been used. Choose the venue again.",
    });
  if (levelOf(u.xp) < v.level)
    return res.status(403).json({ error: `Unlocks at level ${v.level}.` });
  const match = {
    id: requestId,
    venueId: v.id,
    entry: v.entry,
    mode,
    opponent:
      mode === "cpu"
        ? makeCpu(u.stats || {}, randomBytes(4).readUInt32BE())
        : null,
    status: "active",
    startedAt: new Date(),
  };
  const updated = await users.findOneAndUpdate(
    {
      _id: u._id,
      coins: { $gte: v.entry },
      "localMatch.status": { $ne: "active" },
      localEntryIds: { $ne: requestId },
    },
    {
      $inc: { coins: -v.entry },
      $set: { localMatch: match },
      $addToSet: { localEntryIds: requestId },
    },
    { returnDocument: "after" },
  );
  if (!updated)
    return res.status(409).json({
      error:
        u.localMatch?.status === "active"
          ? "Finish or quit your active local match first."
          : "Not enough coins for this venue.",
    });
  res.status(201).json({ player: publicUser(updated), match });
});
app.get("/local-matches/active", required, async (req: any, res) =>
  res.json(
    req.player.localMatch?.status === "active" ? req.player.localMatch : null,
  ),
);
app.post("/local-matches/:id/finish", required, async (req: any, res) => {
  const { outcome } = z
    .object({ outcome: z.enum(["won", "lost", "forfeit"]) })
    .parse(req.body);
  const cpu = req.player.localMatch?.mode === "cpu";
  const prefix = cpu ? "cpu" : "local";
  const won = outcome === "won";
  const updated = await users.findOneAndUpdate(
    {
      _id: req.player._id,
      "localMatch.id": req.params.id,
      "localMatch.status": "active",
    },
    [
      {
        $set: {
          "localMatch.status": outcome,
          "localMatch.endedAt": new Date(),
          [`stats.${prefix}Matches`]: {
            $add: [{ $ifNull: [`$stats.${prefix}Matches`, 0] }, 1],
          },
          [`stats.${prefix}${won ? "Wins" : "Losses"}`]: {
            $add: [
              { $ifNull: [`$stats.${prefix}${won ? "Wins" : "Losses"}`, 0] },
              1,
            ],
          },
          ...(cpu
            ? {
                "stats.cpuStreak": {
                  $cond: [
                    {
                      [won ? "$gt" : "$lt"]: [
                        { $ifNull: ["$stats.cpuStreak", 0] },
                        0,
                      ],
                    },
                    { $add: ["$stats.cpuStreak", won ? 1 : -1] },
                    won ? 1 : -1,
                  ],
                },
              }
            : {}),
        },
      },
    ],
    { returnDocument: "after" },
  );
  const u = updated || (await users.findOne({ _id: req.player._id }));
  if (u.localMatch?.id !== req.params.id)
    return res.status(404).json({ error: "Match not found." });
  // Local outcomes are unranked; never mint coins or competitive rewards from client results.
  res.json({ player: publicUser(u), match: u.localMatch });
});
app.post("/auth/guest", authLimit, async (req, res) => {
  const input = z.object({ adultConfirmed: z.literal(true) }).parse(req.body);
  const u = {
    _id: randomUUID(),
    name: "Rookie",
    country: "",
    avatar: 0,
    xp: 0,
    coins: 1000,
    completed: [],
    selectedTable: "heritage",
    providers: {},
    adultConfirmed: input.adultConfirmed,
    createdAt: new Date(),
    stats: { finishes: 0, shots: 0 },
  };
  await users.insertOne(u);
  res.status(201).json({ token: await issue(u._id), player: publicUser(u) });
});
app.post("/auth/challenge", authLimit, async (_req, res) => {
  const nonce = randomBytes(24).toString("hex");
  await nonces.insertOne({
    _id: hash(nonce),
    expiresAt: new Date(Date.now() + 300000),
  });
  res.json({ nonce });
});
app.post("/auth/provider", authLimit, async (req, res) => {
  const input = z
    .object({
      provider: z.enum(["google", "apple"]),
      idToken: z.string().min(20).max(12000),
      nonce: z.string().max(200).optional(),
      authorizationCode: z.string().min(1).max(4096).optional(),
      adultConfirmed: z.literal(true),
    })
    .parse(req.body);
  if (input.provider === "apple") {
    if (
      !input.nonce ||
      !(await nonces.findOneAndDelete({
        _id: hash(input.nonce),
        expiresAt: { $gt: new Date() },
      }))
    )
      return res
        .status(401)
        .json({ error: "Sign-in challenge expired. Try again." });
  }
  let identity;
  try {
    identity = await verifyIdentity(input.provider, input.idToken, input.nonce);
  } catch (e) {
    return res.status(401).json({ error: (e as Error).message });
  }
  let appleCredential;
  if (input.provider === "apple") {
    if (!input.authorizationCode || !identity.audience)
      return res
        .status(400)
        .json({ error: "Apple authorization code is required." });
    try {
      appleCredential = await exchangeAppleCode(
        input.authorizationCode,
        identity.audience,
        identity.subject,
        input.nonce!,
      );
    } catch {
      return res
        .status(503)
        .json({
          error: "Apple sign-in could not be completed. Please try again.",
        });
    }
  }
  const field = `providers.${input.provider}`;
  let u = await users.findOne({ [field]: identity.subject });
  const current = await account(req);
  if (u?.suspended || current?.suspended)
    return res
      .status(403)
      .json({ error: "This account is suspended. Contact support." });
  if (!u && current) {
    if (
      current.providers?.[input.provider] &&
      current.providers[input.provider] !== identity.subject
    )
      return res.status(409).json({
        error: "A different account is already linked. Sign out first.",
      });
    u = await users.findOneAndUpdate(
      { _id: current._id },
      { $set: { [field]: identity.subject } },
      { returnDocument: "after" },
    );
  }
  if (!u) {
    u = {
      _id: randomUUID(),
      name: (identity.name || "Player").slice(0, 24),
      country: "",
      avatar: 0,
      xp: 0,
      coins: 1000,
      completed: [],
      selectedTable: "heritage",
      providers: { [input.provider]: identity.subject },
      adultConfirmed: true,
      createdAt: new Date(),
      stats: { finishes: 0, shots: 0 },
    };
    await users.insertOne(u);
  }
  if (appleCredential)
    await users.updateOne({ _id: u._id }, { $set: { appleCredential } });
  // Existing registered accounts keep their progress; never silently overwrite or sum rewards.
  res.json({
    token: await issue(u._id),
    player: publicUser(u),
    switchedAccount: !!current && current._id !== u._id,
  });
});
app.get("/me", required, (req: any, res) => res.json(publicUser(req.player)));
app.patch("/me", required, async (req: any, res) => {
  const input = z
    .object({
      name: z
        .string()
        .trim()
        .min(2)
        .max(24)
        .regex(/^[\p{L}\p{N} _.'-]+$/u),
      country: z
        .string()
        .regex(/^[A-Z]{2}$/)
        .or(z.literal("")),
      avatar: z.number().int().min(0).max(1),
    })
    .strict()
    .parse(req.body);
  const u = await users.findOneAndUpdate(
    { _id: req.player._id },
    { $set: input },
    { returnDocument: "after" },
  );
  res.json(publicUser(u));
});
app.post("/me/table", required, async (req: any, res) => {
  const { tableId } = z.object({ tableId: z.string() }).parse(req.body);
  const table = venues.find((t) => t.id === tableId);
  if (!table) return res.status(404).json({ error: "Table not found." });
  if (levelOf(req.player.xp) < table.level)
    return res.status(403).json({ error: `Unlocks at level ${table.level}.` });
  const u = await users.findOneAndUpdate(
    { _id: req.player._id },
    { $set: { selectedTable: table.id } },
    { returnDocument: "after" },
  );
  res.json(publicUser(u));
});
app.post("/me/daily", required, async (req: any, res) => {
  const key = "daily:" + new Date().toISOString().slice(0, 10);
  const updated = await users.findOneAndUpdate(
    { _id: req.player._id, completed: { $ne: key } },
    { $addToSet: { completed: key }, $inc: { coins: 100 } },
    { returnDocument: "after" },
  );
  res.json({
    claimed: !!updated,
    player: publicUser(
      updated || (await users.findOne({ _id: req.player._id })),
    ),
  });
});
app.post("/auth/logout", required, async (req, res) => {
  await sessions.deleteOne({
    tokenHash: hash(req.headers.authorization!.slice(7)),
  });
  res.status(204).end();
});
app.delete("/me", required, async (req: any, res) => {
  if (req.body.confirm !== "DELETE")
    return res.status(400).json({ error: "Type DELETE to confirm." });
  const id = req.player._id;
  if (req.player.providers?.apple) {
    try {
      await revokeAppleToken(
        req.player.appleCredential,
        req.player.providers.apple,
      );
    } catch {
      return res
        .status(503)
        .json({
          error:
            "Apple authorization could not be revoked. Sign in with Apple again, then retry deletion.",
        });
    }
  }
  await users.deleteOne({ _id: id });
  await Promise.all([
    sessions.deleteMany({ playerId: id }),
    tickets.deleteMany({ playerId: id }),
    db.collection("walletChallenges").deleteMany({ playerId: id }),
    entries.deleteMany({ playerId: id }),
    db
      .collection("reports")
      .deleteMany({ $or: [{ playerId: id }, { reporterId: id }] }),
    users.updateMany({}, { $pull: { blockedPlayers: id } as any }),
  ]);
  res.status(204).end();
});
app.post("/practice/start", required, async (req: any, res) => {
  const { challengeId, tableId } = z
    .object({ challengeId: z.string(), tableId: z.string() })
    .parse(req.body);
  const challenge = challenges.find((c) => c.id === challengeId),
    table = venues.find((v) => v.id === tableId);
  if (!challenge || !table)
    return res.status(404).json({ error: "Challenge or table not found." });
  if (levelOf(req.player.xp) < table.level)
    return res.status(403).json({ error: "This table is still locked." });
  const ticket = {
    _id: randomUUID(),
    playerId: req.player._id,
    challengeId,
    expiresAt: new Date(Date.now() + 3600000),
  };
  await tickets.insertOne(ticket);
  res.status(201).json({ ticket: ticket._id, challenge });
});
let verifying = 0;
function replay(drill: string, shots: any[], targets: number[]): Promise<any> {
  return new Promise((resolve, reject) => {
    if (verifying >= 2)
      return reject(new Error("The referee is busy. Please retry shortly."));
    verifying++;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      workerData: { drill, shots, targets },
      execArgv: ["--import", "tsx"],
    });
    let done = false;
    const finish = (error?: Error, value?: any) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      verifying--;
      void worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(
      () => finish(new Error("Replay took too long.")),
      12000,
    );
    worker.on("message", (m) =>
      finish(m.error ? new Error(m.error) : undefined, m.result),
    );
    worker.on("error", (e) => finish(e));
    worker.on("exit", (code) => {
      if (!done) finish(new Error(`Replay stopped (${code}).`));
    });
  });
}
const shot = z
  .object({
    angle: z.number().finite().min(-1000).max(1000),
    power: z.number().min(0.001).max(1),
    side: z.number().min(-1).max(1),
    top: z.number().min(-1).max(1),
  })
  .strict();
app.post(
  "/practice/complete",
  required,
  rateLimit({
    message: { error: "Too many requests. Please try again shortly." },
    windowMs: 60000,
    limit: 10,
  }),
  async (req: any, res) => {
    const input = z
      .object({
        ticket: z.string().uuid(),
        shots: z.array(shot).min(1).max(12),
      })
      .strict()
      .parse(req.body);
    const ticket = await tickets.findOne({
      _id: input.ticket,
      playerId: req.player._id,
      expiresAt: { $gt: new Date() },
    });
    if (!ticket)
      return res
        .status(404)
        .json({ error: "Practice session expired. Start a new challenge." });
    const challenge = challenges.find((c) => c.id === ticket.challengeId)!;
    let result;
    try {
      result = await replay(challenge.drill, input.shots, challenge.targets);
    } catch (e) {
      return res.status(422).json({ error: (e as Error).message });
    }
    const key = `practice:${challenge.id}`;
    const rewarded = await users.findOneAndUpdate(
      { _id: req.player._id, completed: { $ne: key } },
      {
        $addToSet: { completed: key },
        $inc: {
          xp: challenge.xp,
          coins: challenge.coins,
          "stats.finishes": 1,
          "stats.shots": result.shots,
        },
      },
      { returnDocument: "after" },
    );
    await tickets.updateOne(
      { _id: ticket._id },
      { $set: { verified: true, result } },
    );
    res.json({
      verified: true,
      reward: rewarded
        ? { xp: challenge.xp, coins: challenge.coins }
        : { xp: 0, coins: 0 },
      player: publicUser(
        rewarded || (await users.findOne({ _id: req.player._id })),
      ),
    });
  },
);
installPlatform(app, db, required);
app.get("/tournaments/:id", required, async (req: any, res) => {
  const event = await events.findOne({
    id: req.params.id,
    status: { $ne: "draft" },
  });
  if (!event) return res.status(404).json({ error: "Event not found." });
  const board = await entries
    .aggregate([
      { $match: { eventId: event.id, score: { $exists: true } } },
      { $sort: { score: 1, submittedAt: 1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "players",
          localField: "playerId",
          foreignField: "_id",
          as: "player",
        },
      },
      { $unwind: "$player" },
      {
        $match: {
          "player.suspended": { $ne: true },
          "player._id": { $nin: req.player.blockedPlayers || [] },
        },
      },
      {
        $project: {
          _id: 0,
          playerId: "$player._id",
          name: "$player.name",
          country: "$player.country",
          shots: 1,
          score: 1,
        },
      },
    ])
    .toArray();
  res.json({
    event: publicEvent(event),
    entry: await entries.findOne({
      playerId: req.player._id,
      eventId: event.id,
    }),
    leaderboard: board,
  });
});
app.post("/tournaments/:id/enter", required, async (req: any, res) => {
  const event = await events.findOne({
    id: req.params.id,
    status: { $ne: "draft" },
  });
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (!eventIsOpen(event))
    return res
      .status(409)
      .json({ error: "Registration is not open. No payment has been taken." });
  if (levelOf(req.player.xp) < event.level)
    return res.status(403).json({ error: "Level requirement not met." });
  if (req.body.acceptRules !== true)
    return res.status(400).json({ error: "Please accept the event rules." });
  await entries.updateOne(
    { playerId: req.player._id, eventId: event.id },
    {
      $setOnInsert: {
        _id: randomUUID(),
        playerId: req.player._id,
        eventId: event.id,
        joinedAt: new Date(),
      },
    },
    { upsert: true },
  );
  res.json({ joined: true });
});
app.post(
  "/tournaments/:id/submit",
  required,
  rateLimit({
    message: { error: "Too many requests. Please try again shortly." },
    windowMs: 60000,
    limit: 6,
  }),
  async (req: any, res) => {
    const event = await events.findOne({
      id: req.params.id,
      status: { $ne: "draft" },
    });
    if (!event || !eventIsOpen(event))
      return res.status(409).json({ error: "Event is not open." });
    const input = z
      .object({ shots: z.array(shot).min(1).max(12) })
      .strict()
      .parse(req.body);
    if (
      !(await entries.findOne({ playerId: req.player._id, eventId: event.id }))
    )
      return res.status(403).json({ error: "Join the event first." });
    let result;
    try {
      result = await replay(
        event!.drill || "pocket",
        input.shots,
        event!.targets || [1],
      );
    } catch (e) {
      return res.status(422).json({ error: (e as Error).message });
    }
    await entries.updateOne(
      {
        playerId: req.player._id,
        eventId: event.id,
        $or: [{ score: { $exists: false } }, { score: { $gt: result.score } }],
      },
      {
        $set: {
          score: result.score,
          shots: result.shots,
          submittedAt: new Date(),
        },
      },
    );
    const key = `event:${event.id}`;
    const rewarded = await users.findOneAndUpdate(
      { _id: req.player._id, completed: { $ne: key } },
      { $addToSet: { completed: key }, $inc: { coins: event.reward } },
      { returnDocument: "after" },
    );
    res.json({
      verified: true,
      reward: { xp: 0, coins: rewarded ? event.reward : 0 },
      player: publicUser(
        rewarded || (await users.findOne({ _id: req.player._id })),
      ),
    });
  },
);
app.use((err: any, _req: any, res: any, _next: any) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({ error: "Please check the supplied fields." });
  if (err?.code === 11000)
    return res
      .status(409)
      .json({ error: "That account or entry already exists. Please retry." });
  if (err?.type === "entity.parse.failed")
    return res.status(400).json({ error: "Invalid JSON request." });
  if (err?.type === "entity.too.large")
    return res.status(413).json({ error: "Request is too large." });
  console.error("API error", err?.name);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});
app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`CueMaster API http://127.0.0.1:${port} · MongoDB connected`),
);
