import { randomUUID, randomInt } from "node:crypto";
import type { Express, RequestHandler } from "express";
import type { Db } from "mongodb";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

/**
 * Reward crates.
 *
 * Winning a match earns a sealed crate. One crate unlocks at a time; the others wait in a slot.
 * A player may wait out the timer, take an hour off it with a rewarded video, or spend rubies to
 * open it immediately. Coins are the reward that matters; rubies are a rare bonus, because they
 * are also the thing people buy.
 *
 * Contents are rolled here, at open time, never on the device: a crate is a surprise, and the
 * device is not allowed to decide what is in it. CRATES is the only table anything rolls
 * against. `crateOdds` is derived from it and kept for the tests and for regulator-facing
 * disclosure; the game deliberately shows players the crate type, not a breakdown.
 */
export type Crate = {
  id: string;
  tier: string;
  earnedAt: Date;
  unlockAt?: Date;
  hoursOff?: number;
};
export const SLOTS = 4;
/** A day's worth of claimed wins cannot outrun the unlock timers, but cap it anyway. */
export const DAILY_CRATE_LIMIT = 12;
/** Rewarded-video speed-ups per day, enforced by the server. */
export const DAILY_VIDEO_LIMIT = 6;
const MINUTES_PER_RUBY = 30;

export const CRATES = [
  {
    tier: "practice",
    name: "Practice crate",
    hours: 1,
    weight: 40,
    coins: [60, 120] as const,
    rubyChance: 0.08,
    rubies: [1, 1] as const,
  },
  {
    tier: "club",
    name: "Club crate",
    hours: 3,
    weight: 25,
    coins: [150, 300] as const,
    rubyChance: 0.12,
    rubies: [1, 2] as const,
  },
  {
    tier: "silver",
    name: "Silver crate",
    hours: 8,
    weight: 18,
    coins: [400, 700] as const,
    rubyChance: 0.18,
    rubies: [1, 2] as const,
  },
  {
    tier: "gold",
    name: "Gold crate",
    hours: 12,
    weight: 10,
    coins: [700, 1100] as const,
    rubyChance: 0.25,
    rubies: [1, 3] as const,
  },
  {
    tier: "champion",
    name: "Champion crate",
    hours: 24,
    weight: 5,
    coins: [1500, 2400] as const,
    rubyChance: 0.35,
    rubies: [2, 4] as const,
  },
  {
    tier: "master",
    name: "Master crate",
    hours: 48,
    weight: 2,
    coins: [3200, 5000] as const,
    rubyChance: 0.5,
    rubies: [3, 6] as const,
  },
];
export const crateByTier = (tier: string) =>
  CRATES.find((c) => c.tier === tier) || CRATES[0];

const TOTAL_WEIGHT = CRATES.reduce((sum, c) => sum + c.weight, 0);
export function rollCrate() {
  let ticket = randomInt(TOTAL_WEIGHT);
  for (const crate of CRATES) {
    ticket -= crate.weight;
    if (ticket < 0) return crate;
  }
  return CRATES[0];
}
const between = ([low, high]: readonly [number, number]) =>
  low + (high > low ? randomInt(high - low + 1) : 0);
export function rollContents(tier: string) {
  const crate = crateByTier(tier);
  const rubies =
    randomInt(10000) / 10000 < crate.rubyChance ? between(crate.rubies) : 0;
  return { coins: between(crate.coins), rubies };
}
/** Derived from CRATES, so any disclosure can never drift from what the server actually rolls. */
export const crateOdds = () =>
  CRATES.map((c) => ({
    tier: c.tier,
    name: c.name,
    hours: c.hours,
    chance: Number(((100 * c.weight) / TOTAL_WEIGHT).toFixed(2)),
    coins: { min: c.coins[0], max: c.coins[1] },
    rubyChance: Number((100 * c.rubyChance).toFixed(1)),
    rubies: { min: c.rubies[0], max: c.rubies[1] },
  }));

export function readyAt(crate: Crate) {
  if (!crate.unlockAt) return null;
  return new Date(
    new Date(crate.unlockAt).getTime() - (crate.hoursOff || 0) * 3600000,
  );
}
export function rubyCost(crate: Crate, now = Date.now()) {
  const ready = readyAt(crate);
  const remaining = ready
    ? ready.getTime() - now
    : crateByTier(crate.tier).hours * 3600000;
  if (remaining <= 0) return 0;
  return Math.max(1, Math.ceil(remaining / (MINUTES_PER_RUBY * 60000)));
}
export function publicCrate(crate: Crate, now = Date.now()) {
  const meta = crateByTier(crate.tier);
  const ready = readyAt(crate);
  return {
    id: crate.id,
    tier: crate.tier,
    name: meta.name,
    hours: meta.hours,
    earnedAt: crate.earnedAt,
    unlocking: !!crate.unlockAt,
    readyAt: ready,
    ready: !!ready && ready.getTime() <= now,
    hoursOff: crate.hoursOff || 0,
    rubyCost: rubyCost(crate, now),
  };
}
const todayKey = () => new Date().toISOString().slice(0, 10);

export function installRewards(
  app: Express,
  db: Db,
  required: RequestHandler,
  publicUser: (u: any) => any,
) {
  const users = db.collection<any>("players");
  // Speed-ups are granted by the ad network's signed callback, never by this endpoint; see ads.ts.
  const videoConfigured = () => !!process.env.ADS_PROVIDER;

  app.get("/me/crates", required, async (req: any, res) => {
    const now = Date.now();
    const crates: Crate[] = req.player.crates || [];
    res.json({
      slots: SLOTS,
      rubies: req.player.rubies || 0,
      crates: crates.map((c) => publicCrate(c, now)),
      unlocking: crates.some((c) => c.unlockAt && !publicCrate(c, now).ready),
      videoUnlock: videoConfigured(),
      videosLeft: videoConfigured()
        ? Math.max(
            0,
            DAILY_VIDEO_LIMIT -
              (req.player.videoDay === todayKey()
                ? req.player.videoCount || 0
                : 0),
          )
        : 0,
      dailyCratesLeft: Math.max(
        0,
        DAILY_CRATE_LIMIT -
          (req.player.crateDay === todayKey() ? req.player.crateCount || 0 : 0),
      ),
    });
  });

  // Start the timer on one crate. Only one unlocks at a time, which is what bounds the
  // reward rate: claimed wins cannot mint coins faster than the clock allows.
  app.post("/me/crates/:id/start", required, async (req: any, res) => {
    const now = Date.now();
    const crates: Crate[] = req.player.crates || [];
    const crate = crates.find((c) => c.id === req.params.id);
    if (!crate) return res.status(404).json({ error: "Crate not found." });
    if (crate.unlockAt)
      return res
        .status(409)
        .json({ error: "This crate is already unlocking." });
    if (crates.some((c) => c.unlockAt && !publicCrate(c, now).ready))
      return res.status(409).json({
        error: "Another crate is already unlocking. Open it first.",
      });
    const unlockAt = new Date(now + crateByTier(crate.tier).hours * 3600000);
    const updated = await users.findOneAndUpdate(
      {
        _id: req.player._id,
        crates: { $elemMatch: { id: crate.id, unlockAt: null } },
      },
      { $set: { "crates.$.unlockAt": unlockAt } },
      { returnDocument: "after" },
    );
    if (!updated)
      return res.status(409).json({ error: "Crate changed. Reload rewards." });
    res.json({
      crates: (updated.crates || []).map((c: Crate) => publicCrate(c, now)),
    });
  });

  app.post(
    "/me/crates/:id/open",
    required,
    rateLimit({
      message: { error: "Too many requests. Please try again shortly." },
      windowMs: 60000,
      limit: 30,
    }),
    async (req: any, res) => {
      const { spendRubies } = z
        .object({ spendRubies: z.boolean().default(false) })
        .strict()
        .parse(req.body ?? {});
      const now = Date.now();
      const crate: Crate | undefined = (req.player.crates || []).find(
        (c: Crate) => c.id === req.params.id,
      );
      if (!crate) return res.status(404).json({ error: "Crate not found." });
      const view = publicCrate(crate, now);
      const cost = view.ready ? 0 : rubyCost(crate, now);
      if (cost > 0 && !spendRubies)
        return res.status(409).json({ error: "This crate is not ready yet." });
      if (cost > (req.player.rubies || 0))
        return res
          .status(409)
          .json({ error: `Not enough rubies. This crate costs ${cost}.` });
      const reward = rollContents(crate.tier);
      // One atomic write removes the crate and pays it out, so a retry cannot pay twice.
      const updated = await users.findOneAndUpdate(
        {
          _id: req.player._id,
          "crates.id": crate.id,
          ...(cost > 0 ? { rubies: { $gte: cost } } : {}),
        },
        {
          $pull: { crates: { id: crate.id } } as any,
          $inc: {
            coins: reward.coins,
            rubies: reward.rubies - cost,
            "stats.cratesOpened": 1,
          },
        },
        { returnDocument: "after" },
      );
      if (!updated)
        return res
          .status(409)
          .json({ error: "Crate already opened. Reload rewards." });
      res.json({
        opened: { ...view, spentRubies: cost },
        reward,
        player: publicUser(updated),
        crates: (updated.crates || []).map((c: Crate) => publicCrate(c, now)),
      });
    },
  );
}

/**
 * Fields that award one crate for a win, as aggregation-pipeline expressions.
 *
 * The caller merges these into its existing atomic match-result write, so the crate and the
 * recorded win land together or not at all, and a retried request cannot mint a second crate.
 * Slot and daily limits are re-evaluated server-side inside the write rather than from the
 * document the request was read with.
 */
export function crateAwardStage() {
  const crate: Crate = {
    id: randomUUID(),
    tier: rollCrate().tier,
    earnedAt: new Date(),
    hoursOff: 0,
  };
  const day = todayKey();
  const used = {
    $cond: [{ $eq: ["$crateDay", day] }, { $ifNull: ["$crateCount", 0] }, 0],
  };
  const held = { $ifNull: ["$crates", []] };
  const allowed = {
    $and: [
      { $lt: [{ $size: held }, SLOTS] },
      { $lt: [used, DAILY_CRATE_LIMIT] },
    ],
  };
  return {
    crate,
    fields: {
      crates: {
        $cond: [allowed, { $concatArrays: [held, [crate]] }, held],
      },
      crateDay: day,
      crateCount: { $cond: [allowed, { $add: [used, 1] }, used] },
    },
  };
}
