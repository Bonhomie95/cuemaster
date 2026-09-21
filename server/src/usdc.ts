import { getAddress, verifyMessage, ZeroAddress } from "ethers";
import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import type { Db } from "mongodb";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
export function baseAddress(value: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value))
    throw new Error("Enter a Base wallet address starting with 0x.");
  const address = getAddress(value);
  if (address === ZeroAddress)
    throw new Error("The zero address cannot receive prizes.");
  return address;
}
export function installUsdc(app: Express, db: Db, required: RequestHandler) {
  const users = db.collection<any>("players"),
    challenges = db.collection<any>("walletChallenges");
  app.get("/me/usdc", required, async (req: any, res) => {
    const payouts = await db
      .collection("payouts")
      .find(
        { playerId: req.player._id },
        {
          projection: {
            _id: 0,
            id: 1,
            amount: 1,
            network: 1,
            status: 1,
            transactionHash: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json({
      currency: "USDC",
      network: "base",
      chainId: 8453,
      payoutsEnabled: false,
      wallet: req.player.usdcWallet || null,
      payouts,
      message:
        "Prize payouts are not active. Saving an address does not enable withdrawals or deposits.",
    });
  });
  app.put("/me/usdc", required, async (req: any, res) => {
    const input = z
      .object({
        network: z.literal("base"),
        address: z.string().trim().max(42),
        acknowledgeNetwork: z.literal(true),
      })
      .strict()
      .parse(req.body);
    let address;
    try {
      address = baseAddress(input.address);
    } catch {
      return res
        .status(400)
        .json({
          error:
            "Invalid Base address or checksum. TRON/TRC20 addresses are not supported for USDC.",
        });
    }
    const current = req.player.usdcWallet;
    const wallet =
      current?.address === address
        ? current
        : { network: "base", address, verified: false, updatedAt: new Date() };
    await users.updateOne(
      { _id: req.player._id },
      { $set: { usdcWallet: wallet } },
    );
    res.json({ wallet });
  });
  app.delete("/me/usdc", required, async (req: any, res) => {
    await users.updateOne(
      { _id: req.player._id },
      { $unset: { usdcWallet: "" } },
    );
    await challenges.deleteMany({ playerId: req.player._id });
    res.status(204).end();
  });
  app.post(
    "/me/usdc/challenge",
    required,
    rateLimit({
      message: { error: "Too many requests. Please try again shortly." },
      windowMs: 60000,
      limit: 5,
    }),
    async (req: any, res) => {
      const wallet = req.player.usdcWallet;
      if (!wallet)
        return res
          .status(409)
          .json({ error: "Save a Base payout address first." });
      const nonce = randomUUID(),
        expiresAt = new Date(Date.now() + 5 * 60000);
      const message = `CueMaster wallet ownership verification\nAccount: ${req.player._id}\nAddress: ${wallet.address}\nNetwork: Base (8453)\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}\nThis signature does not authorize a payment or transfer.`;
      await challenges.insertOne({
        _id: nonce,
        playerId: req.player._id,
        address: wallet.address,
        message,
        expiresAt,
      });
      res.json({ id: nonce, message, expiresAt });
    },
  );
  app.post("/me/usdc/verify", required, async (req: any, res) => {
    const { id, signature } = z
      .object({
        id: z.string().uuid(),
        signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
      })
      .strict()
      .parse(req.body);
    const challenge = await challenges.findOne({
      _id: id,
      playerId: req.player._id,
      expiresAt: { $gt: new Date() },
    });
    if (!challenge)
      return res
        .status(400)
        .json({ error: "Verification expired. Request another challenge." });
    let signer;
    try {
      signer = verifyMessage(challenge.message, signature);
    } catch {
      return res.status(400).json({ error: "Invalid wallet signature." });
    }
    if (signer !== challenge.address)
      return res
        .status(400)
        .json({ error: "Signature does not match this payout address." });
    const consumed = await challenges.findOneAndDelete({
      _id: id,
      playerId: req.player._id,
      expiresAt: { $gt: new Date() },
    });
    if (!consumed)
      return res
        .status(409)
        .json({ error: "This challenge was already used." });
    const result = await users.updateOne(
      { _id: req.player._id, "usdcWallet.address": challenge.address },
      {
        $set: {
          "usdcWallet.verified": true,
          "usdcWallet.verifiedAt": new Date(),
        },
      },
    );
    if (!result.matchedCount)
      return res
        .status(409)
        .json({ error: "The address changed. Verify the new address." });
    res.json({ verified: true });
  });
}
