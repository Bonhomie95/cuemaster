import { randomInt } from "node:crypto";
import type { Express, RequestHandler } from "express";
import type { Db } from "mongodb";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

/**
 * Invite codes. A new player enters a friend's code in their first week; once they have
 * finished three matches, both players are paid once. Paying on finished matches rather than
 * on sign-up means a farm of empty guest accounts earns nothing.
 */
export const INVITE_REWARD = { coins: 500, rubies: 10 };
const MATCHES_NEEDED = 3;
const REDEEM_WINDOW_DAYS = 7;
const MAX_REFERRALS = 100;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function installInvites(
  app: Express,
  db: Db,
  required: RequestHandler,
  publicUser: (u: any) => any,
) {
  const users = db.collection<any>("players");
  void users
    .createIndex({ inviteCode: 1 }, { unique: true, sparse: true })
    .catch(() => {});

  /** The player's own code, minted on first request. */
  app.get("/me/invite", required, async (req: any, res) => {
    let code = req.player.inviteCode as string | undefined;
    for (let i = 0; !code && i < 5; i++) {
      const candidate = Array.from(
        { length: 6 },
        () => ALPHABET[randomInt(ALPHABET.length)],
      ).join("");
      try {
        const u = await users.findOneAndUpdate(
          { _id: req.player._id, inviteCode: { $exists: false } },
          { $set: { inviteCode: candidate } },
          { returnDocument: "after" },
        );
        code =
          u?.inviteCode ??
          (await users.findOne({ _id: req.player._id }))?.inviteCode;
      } catch (e: any) {
        if (e?.code !== 11000) throw e;
      }
    }
    if (!code) return res.status(503).json({ error: "Try again in a moment." });
    const ageDays =
      (Date.now() - new Date(req.player.createdAt).getTime()) / 86_400_000;
    res.json({
      code,
      reward: INVITE_REWARD,
      matchesNeeded: MATCHES_NEEDED,
      friends: req.player.stats?.referrals || 0,
      // Shown in the profile so a newcomer who has not used a code can still enter one.
      canRedeem: !req.player.referredBy && ageDays <= REDEEM_WINDOW_DAYS,
      redeemed: !!req.player.referredBy,
    });
  });

  app.post(
    "/me/invite/redeem",
    required,
    rateLimit({
      message: { error: "Too many requests. Please try again shortly." },
      windowMs: 3_600_000,
      limit: 10,
    }),
    async (req: any, res) => {
      const { code } = z
        .object({
          code: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z2-9]{6}$/),
        })
        .strict()
        .parse(req.body);
      const ageDays =
        (Date.now() - new Date(req.player.createdAt).getTime()) / 86_400_000;
      if (ageDays > REDEEM_WINDOW_DAYS)
        return res
          .status(409)
          .json({ error: "Invite codes work in your first week." });
      const friend = await users.findOne({ inviteCode: code });
      if (!friend || friend._id === req.player._id)
        return res
          .status(404)
          .json({ error: "That invite code was not found." });
      const u = await users.findOneAndUpdate(
        { _id: req.player._id, referredBy: { $exists: false } },
        { $set: { referredBy: friend._id } },
        { returnDocument: "after" },
      );
      if (!u)
        return res
          .status(409)
          .json({ error: "You have already used an invite code." });
      await settleInvite(db, u._id);
      res.json({
        friend: friend.name,
        reward: INVITE_REWARD,
        matchesNeeded: MATCHES_NEEDED,
        player: publicUser((await users.findOne({ _id: u._id })) || u),
      });
    },
  );
}

/**
 * Pay both sides once the invited player has finished enough matches. Safe to call after every
 * match: the `invitePaid` flag in the same write makes it pay exactly once.
 */
export async function settleInvite(db: Db, playerId: string) {
  const users = db.collection<any>("players");
  const paid = await users.findOneAndUpdate(
    {
      _id: playerId,
      referredBy: { $exists: true },
      invitePaid: { $ne: true },
      $expr: {
        $gte: [
          {
            $add: [
              { $ifNull: ["$stats.cpuMatches", 0] },
              { $ifNull: ["$stats.onlineMatches", 0] },
            ],
          },
          MATCHES_NEEDED,
        ],
      },
    },
    {
      $set: { invitePaid: true },
      $inc: { coins: INVITE_REWARD.coins, rubies: INVITE_REWARD.rubies },
    },
  );
  if (!paid) return false;
  await users.updateOne(
    {
      _id: paid.referredBy,
      "stats.referrals": { $not: { $gte: MAX_REFERRALS } },
    },
    {
      $inc: {
        coins: INVITE_REWARD.coins,
        rubies: INVITE_REWARD.rubies,
        "stats.referrals": 1,
      },
    },
  );
  return true;
}
