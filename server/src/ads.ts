import { createVerify, randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import type { Db } from "mongodb";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

/**
 * Rewarded video, verified by AdMob rather than by the phone.
 *
 * The phone can always lie about having watched an advert, so it never grants anything. The
 * flow is:
 *   1. the app asks for a ticket before it shows the advert;
 *   2. the ticket id travels to AdMob as the SSV `user_id`;
 *   3. AdMob calls `/ads/reward` with an ECDSA signature over the query string;
 *   4. we verify that signature against Google's published keys and only then redeem the ticket.
 *
 * Google's verifier keys: https://gstatic.com/admob/reward/verifier-keys.json
 * A callback cannot reach a laptop, so in development a ticket may also be redeemed by the app
 * that owns it. Production refuses that path outright — see `clientRedeemAllowed`.
 */
const KEYS_URL =
  process.env.ADS_VERIFIER_KEYS_URL ||
  "https://gstatic.com/admob/reward/verifier-keys.json";
type VerifierKey = { keyId: number; pem: string; base64: string };
let cached: { at: number; keys: VerifierKey[] } | null = null;

async function verifierKeys(): Promise<VerifierKey[]> {
  if (cached && Date.now() - cached.at < 3600_000) return cached.keys;
  const response = await fetch(KEYS_URL);
  if (!response.ok) throw new Error("Verifier keys unavailable.");
  const body = (await response.json()) as { keys: VerifierKey[] };
  cached = { at: Date.now(), keys: body.keys || [] };
  return cached.keys;
}

/**
 * AdMob signs everything before `&signature=`, and sends the signature and key id last.
 * Rebuilding the string from parsed parameters would reorder them, so slice the raw query.
 */
export function signedPortion(rawQuery: string) {
  const at = rawQuery.indexOf("&signature=");
  return at === -1 ? null : rawQuery.slice(0, at);
}
export async function verifyAdCallback(rawQuery: string) {
  const signed = signedPortion(rawQuery);
  if (!signed) return false;
  const params = new URLSearchParams(rawQuery);
  const signature = params.get("signature"),
    keyId = params.get("key_id");
  if (!signature || !keyId) return false;
  const key = (await verifierKeys()).find((k) => String(k.keyId) === keyId);
  if (!key) return false;
  return createVerify("SHA256")
    .update(signed)
    .verify(key.pem, Buffer.from(signature, "base64url"));
}
export const adsConfigured = () => !!process.env.ADS_PROVIDER;
/** Only a deployment that cannot receive AdMob callbacks may let the app redeem its own ticket. */
export const clientRedeemAllowed = () => process.env.NODE_ENV !== "production";

export function installAds(app: Express, db: Db, required: RequestHandler) {
  const tickets = db.collection<any>("adTickets"),
    users = db.collection<any>("players");

  app.post(
    "/ads/reward-ticket",
    required,
    rateLimit({
      message: { error: "Too many requests. Please try again shortly." },
      windowMs: 60000,
      limit: 12,
    }),
    async (req: any, res) => {
      if (!adsConfigured())
        return res
          .status(409)
          .json({ error: "Video rewards are not available yet." });
      const { crateId } = z
        .object({ crateId: z.string().uuid() })
        .strict()
        .parse(req.body);
      const crate = (req.player.crates || []).find(
        (c: any) => c.id === crateId,
      );
      if (!crate?.unlockAt)
        return res
          .status(409)
          .json({ error: "Start the crate before speeding it up." });
      const ticket = {
        _id: randomUUID(),
        playerId: req.player._id,
        crateId,
        redeemed: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60000),
      };
      await tickets.insertOne(ticket);
      res.status(201).json({
        ticket: ticket._id,
        clientRedeem: clientRedeemAllowed(),
      });
    },
  );

  /** AdMob's server-side verification callback. Unauthenticated by design; the signature is the proof. */
  app.get(
    "/ads/reward",
    rateLimit({ windowMs: 60000, limit: 120, message: {} }),
    async (req: any, res) => {
      const rawQuery = req.originalUrl.split("?")[1] || "";
      let valid = false;
      try {
        valid = await verifyAdCallback(rawQuery);
      } catch {
        return res.status(503).end();
      }
      if (!valid) return res.status(403).end();
      const ticketId = new URLSearchParams(rawQuery).get("user_id") || "";
      await redeem(ticketId);
      // AdMob retries anything that is not a 2xx, and a redeemed ticket is a success.
      res.status(200).end();
    },
  );

  async function redeem(ticketId: string) {
    const ticket = await tickets.findOneAndUpdate(
      { _id: ticketId, redeemed: false, expiresAt: { $gt: new Date() } },
      { $set: { redeemed: true, redeemedAt: new Date() } },
    );
    if (!ticket) return false;
    const day = new Date().toISOString().slice(0, 10);
    const player = await users.findOne({ _id: ticket.playerId });
    const used = player?.videoDay === day ? player.videoCount || 0 : 0;
    if (used >= 6) return false;
    await users.updateOne(
      { _id: ticket.playerId, "crates.id": ticket.crateId },
      {
        $inc: { "crates.$.hoursOff": 1 },
        $set: { videoDay: day, videoCount: used + 1 },
      },
    );
    return true;
  }

  /** Development only: the app redeems the ticket it was issued, because no callback can arrive. */
  app.post("/ads/reward-ticket/:id/redeem", required, async (req: any, res) => {
    if (!clientRedeemAllowed())
      return res
        .status(403)
        .json({ error: "Rewards are granted by the ad network." });
    const ticket = await tickets.findOne({
      _id: req.params.id,
      playerId: req.player._id,
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found." });
    const granted = await redeem(req.params.id);
    if (!granted)
      return res.status(409).json({
        error: "This reward was already used, or the daily limit is reached.",
      });
    res.json({ granted: true });
  });
}
