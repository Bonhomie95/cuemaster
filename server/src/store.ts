import type { Express, RequestHandler } from "express";
import type { Db } from "mongodb";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

/**
 * Ruby packs.
 *
 * Rubies are the only thing real money buys, and they buy nothing but time: a crate opened
 * early. Coins — the currency that actually matters — are always earned.
 *
 * Both stores require digital goods to be sold through their own billing, so the client buys
 * from Apple or Google and then sends the resulting transaction here. This module owns the
 * part that must be right no matter what the client does: a purchase is credited exactly once,
 * keyed by the store's own transaction identifier, and rubies are only ever added by the
 * server. `verifyPurchase` is the one place a store receipt is checked; until the owner
 * configures billing it refuses everything, so no untested code path can mint currency.
 */
export const RUBY_PACKS = [
  { id: "rubies.handful", rubies: 10, label: "Handful of rubies" },
  { id: "rubies.pouch", rubies: 55, label: "Pouch of rubies", bonus: "+10%" },
  { id: "rubies.chest", rubies: 120, label: "Chest of rubies", bonus: "+20%" },
  { id: "rubies.vault", rubies: 320, label: "Vault of rubies", bonus: "+28%" },
];
export const packById = (id: string) => RUBY_PACKS.find((p) => p.id === id);
export const billingConfigured = () => !!process.env.STORE_BILLING;

/**
 * Check a store transaction and return the pack it paid for.
 *
 * Deliberately unimplemented: validating an Apple or Google receipt needs the owner's App Store
 * Server API key or Play service account, and shipping a guess here would mean shipping a way
 * to mint currency for free. Implement against the configured provider, keep it server-side,
 * and never trust a price or product id that only the client asserted.
 */
async function verifyPurchase(_platform: string, _transactionId: string) {
  throw new Error("Store billing is not configured.");
}

export function installStore(
  app: Express,
  db: Db,
  required: RequestHandler,
  publicUser: (u: any) => any,
) {
  const users = db.collection<any>("players"),
    purchases = db.collection<any>("purchases");

  app.get("/store/rubies", required, async (req: any, res) => {
    res.json({
      available: billingConfigured(),
      rubies: req.player.rubies || 0,
      packs: RUBY_PACKS,
      note: billingConfigured()
        ? "Rubies open crates early. They never buy coins, cues or tables."
        : "Ruby purchases are not available yet. Crates and challenges still award rubies.",
      history: await purchases
        .find(
          { playerId: req.player._id },
          { projection: { _id: 0, packId: 1, rubies: 1, createdAt: 1 } },
        )
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
    });
  });

  app.post(
    "/store/rubies/claim",
    required,
    rateLimit({
      message: { error: "Too many requests. Please try again shortly." },
      windowMs: 60000,
      limit: 20,
    }),
    async (req: any, res) => {
      const input = z
        .object({
          platform: z.enum(["ios", "android"]),
          transactionId: z.string().trim().min(4).max(256),
        })
        .strict()
        .parse(req.body);
      if (!billingConfigured())
        return res
          .status(503)
          .json({ error: "Ruby purchases are not available yet." });
      let pack;
      try {
        pack = await verifyPurchase(input.platform, input.transactionId);
      } catch {
        return res
          .status(402)
          .json({ error: "This purchase could not be verified." });
      }
      // The store's transaction id is the idempotency key: a replayed receipt inserts nothing
      // and therefore credits nothing.
      const record = {
        _id: `${input.platform}:${input.transactionId}`,
        playerId: req.player._id,
        packId: (pack as any).id,
        rubies: (pack as any).rubies,
        createdAt: new Date(),
      };
      try {
        await purchases.insertOne(record);
      } catch (e: any) {
        if (e?.code !== 11000) throw e;
        return res.json({
          credited: false,
          player: publicUser(await users.findOne({ _id: req.player._id })),
        });
      }
      const updated = await users.findOneAndUpdate(
        { _id: req.player._id },
        { $inc: { rubies: record.rubies } },
        { returnDocument: "after" },
      );
      res.json({
        credited: true,
        rubies: record.rubies,
        player: publicUser(updated),
      });
    },
  );
}
