import { createHash, X509Certificate } from "node:crypto";
import type { Express, RequestHandler } from "express";
import type { Db } from "mongodb";
import { rateLimit } from "express-rate-limit";
import {
  compactVerify,
  decodeProtectedHeader,
  importPKCS8,
  importX509,
  SignJWT,
} from "jose";
import { z } from "zod";
import { currentSeason } from "./season";

/**
 * The store.
 *
 * Real money buys rubies, the premium currency (crates opened early), and coins, the soft
 * currency that pays entry fees, cues and tables, plus a one-time starter pack and the current
 * season's premium pass.
 *
 * Both stores require digital goods to be sold through their own billing, so the app buys from
 * Apple or Google and sends the store's proof here. Nothing the device says about price,
 * product or quantity is believed: the grant comes from PRODUCTS, for the product and quantity
 * the store itself signed (Apple) or reported (Google), and only once the purchase is proven to
 * belong to the signed-in player. Each transaction is credited exactly once.
 */
export type Product = {
  id: string;
  kind: "rubies" | "coins" | "bundle" | "pass";
  label: string;
  grants: { coins?: number; rubies?: number; passSeason?: true };
  bonus?: string;
  oneTime?: boolean;
  /** Display fallback only: the player pays the localized price their store shows. */
  usd: number;
};
/** The one table to tune. Ids must match App Store Connect and Play Console exactly. */
export const PRODUCTS: Product[] = [
  {
    id: "rubies.handful",
    kind: "rubies",
    label: "Handful of rubies",
    grants: { rubies: 20 },
    usd: 0.99,
  },
  {
    id: "rubies.pouch",
    kind: "rubies",
    label: "Pouch of rubies",
    grants: { rubies: 110 },
    bonus: "+10%",
    usd: 4.99,
  },
  {
    id: "rubies.chest",
    kind: "rubies",
    label: "Chest of rubies",
    grants: { rubies: 240 },
    bonus: "+20%",
    usd: 9.99,
  },
  {
    id: "rubies.vault",
    kind: "rubies",
    label: "Vault of rubies",
    grants: { rubies: 650 },
    bonus: "+30%",
    usd: 24.99,
  },
  {
    id: "rubies.hoard",
    kind: "rubies",
    label: "Hoard of rubies",
    grants: { rubies: 1400 },
    bonus: "+40%",
    usd: 49.99,
  },
  {
    id: "coins.pile",
    kind: "coins",
    label: "Pile of coins",
    grants: { coins: 2000 },
    usd: 0.99,
  },
  {
    id: "coins.stack",
    kind: "coins",
    label: "Stack of coins",
    grants: { coins: 11000 },
    bonus: "+10%",
    usd: 4.99,
  },
  {
    id: "coins.bag",
    kind: "coins",
    label: "Bag of coins",
    grants: { coins: 24000 },
    bonus: "+20%",
    usd: 9.99,
  },
  {
    id: "coins.vault",
    kind: "coins",
    label: "Vault of coins",
    grants: { coins: 65000 },
    bonus: "+30%",
    usd: 24.99,
  },
  {
    id: "starter.pack",
    kind: "bundle",
    label: "Starter pack",
    grants: { coins: 5000, rubies: 60 },
    oneTime: true,
    usd: 1.99,
  },
  {
    id: "pass.premium",
    kind: "pass",
    label: "CueMaster Pass",
    grants: { passSeason: true },
    usd: 4.99,
  },
];
export const RUBY_PACKS = PRODUCTS.filter((p) => p.kind === "rubies").map(
  (p) => ({ ...p, rubies: p.grants.rubies! }),
);

type Platform = "ios" | "android";
/**
 * `STORE_BILLING` lists the platforms whose purchases are switched on: `ios`, `android` or both.
 * Apple's proof is checked offline, so iOS needs nothing else; Google has to be asked, which
 * needs the Play service account.
 */
export function billingConfigured(platform?: Platform): boolean {
  if (!platform)
    return billingConfigured("ios") || billingConfigured("android");
  const enabled = (process.env.STORE_BILLING || "")
    .split(",")
    .map((s) => s.trim());
  return (
    enabled.includes(platform) &&
    (platform === "ios" || !!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT)
  );
}

/**
 * The token every purchase carries for its player: StoreKit's `appAccountToken`, Play's
 * obfuscated account id. A UUID (version 8, SHA-256 name-based, RFC 9562) because Apple drops
 * anything else, and a hash so neither store learns the player id. The app reads it from
 * `GET /store`.
 */
export function accountToken(playerId: string) {
  const b = createHash("sha256")
    .update(`cuemaster-store:${playerId}`)
    .digest()
    .subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x80;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** SHA-256 of Apple Root CA - G3: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer */
const APPLE_ROOT_G3 =
  "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";
/** Apple's marker extensions, DER: 1.2.840.113635.100.6.11.1 (App Store signing leaf) and .6.2.1 (WWDR intermediate). */
const LEAF_MARKER = "2a864886f76364060b01",
  INTERMEDIATE_MARKER = "2a864886f76364060201";
/** Tests sign with their own chain; nothing else can swap the root. */
const trustedRoot = () =>
  process.env.NODE_ENV === "test" && process.env.APPLE_ROOT_CA_PEM
    ? new X509Certificate(process.env.APPLE_ROOT_CA_PEM).fingerprint256
    : APPLE_ROOT_G3;

/** Extension OIDs (hex) of a DER certificate: Certificate → tbsCertificate → [3] → Extension → OID. */
function extensionOids(der: Buffer) {
  type Node = { tag: number; start: number; end: number };
  const at = (i: number): Node => {
    let start = i + 2,
      len = der[i + 1];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = der.readUIntBE(start, n);
      start += n;
    }
    return { tag: der[i], start, end: start + len };
  };
  const inside = ({ start, end }: Node) => {
    const items: Node[] = [];
    for (let i = start; i < end; i = items[items.length - 1].end)
      items.push(at(i));
    return items;
  };
  const extensions = inside(inside(at(0))[0]).find((e) => e.tag === 0xa3);
  return extensions
    ? inside(at(extensions.start)).map((e) => {
        const oid = inside(e)[0];
        return der.toString("hex", oid.start, oid.end);
      })
    : [];
}

/** StoreKit 2: the transaction's `jwsRepresentation`, verified offline against Apple's root. */
async function verifyApple(productId: string, jws: string, account: string) {
  const chain = decodeProtectedHeader(jws).x5c || [];
  if (chain.length !== 3) throw Error("expected three certificates");
  const [leaf, intermediate, root] = chain.map(
    (c) => new X509Certificate(Buffer.from(c, "base64")),
  );
  if (root.fingerprint256 !== trustedRoot()) throw Error("untrusted root");
  if (
    !intermediate.ca ||
    !intermediate.checkIssued(root) ||
    !intermediate.verify(root.publicKey) ||
    !leaf.checkIssued(intermediate) ||
    !leaf.verify(intermediate.publicKey)
  )
    throw Error("broken certificate chain");
  if (
    !extensionOids(intermediate.raw).includes(INTERMEDIATE_MARKER) ||
    !extensionOids(leaf.raw).includes(LEAF_MARKER)
  )
    throw Error("not an App Store signing certificate");
  const { payload } = await compactVerify(
    jws,
    await importX509(leaf.toString(), "ES256"),
    { algorithms: ["ES256"] },
  );
  const t = JSON.parse(new TextDecoder().decode(payload));
  // Offline, the question is whether each certificate was valid when Apple signed: the date
  // Apple's own server library checks against when it is not doing online revocation checks.
  const signed = new Date(t.signedDate);
  if (
    ![leaf, intermediate, root].every(
      (c) => c.validFromDate <= signed && signed <= c.validToDate,
    )
  )
    throw Error("certificate not valid when signed");
  if (t.bundleId !== (process.env.APPLE_BUNDLE_ID || "com.bonhomie.cuemaster"))
    throw Error(`bundle ${t.bundleId}`);
  if (t.productId !== productId || t.type !== "Consumable")
    throw Error(`product ${t.productId} (${t.type})`);
  if (t.revocationDate) throw Error("revoked");
  // App Review buys in the sandbox, so Sandbox is accepted and recorded; Xcode's local store is not.
  if (t.environment !== "Production" && t.environment !== "Sandbox")
    throw Error(`environment ${t.environment}`);
  if (String(t.appAccountToken).toLowerCase() !== account)
    throw Error("bought by another account");
  if (!t.transactionId) throw Error("no transaction id");
  return {
    key: `ios:${t.transactionId}`,
    quantity: t.quantity ?? 1,
    environment: t.environment as string,
    settle: async () => {},
  };
}

const PACKAGE = "com.bonhomie.cuemaster"; // android.package in mobile/app.json
let playToken: { value: string; until: number } | undefined;
/** An OAuth token for the Play Developer API, signed by the service account and cached until it expires. */
async function playAccess() {
  if (playToken && Date.now() < playToken.until) return playToken.value;
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT!.trim();
  const account = JSON.parse(
    raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"),
  );
  const url =
    process.env.GOOGLE_OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token";
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/androidpublisher",
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
      kid: account.private_key_id,
    })
    .setIssuer(account.client_email)
    .setAudience(url)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(await importPKCS8(account.private_key, "RS256"));
  const response = await fetch(url, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error(`token exchange ${response.status}`);
  const { access_token, expires_in } = await response.json();
  playToken = {
    value: access_token,
    until: Date.now() + (expires_in - 60) * 1000,
  };
  return access_token as string;
}

/** Google Play: the purchase token, looked up with the Play Developer API. */
async function verifyGoogle(productId: string, token: string, account: string) {
  const url = `${process.env.GOOGLE_PLAY_API_URL || "https://androidpublisher.googleapis.com"}/androidpublisher/v3/applications/${PACKAGE}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const play = async (action = "") => {
    const response = await fetch(url + action, {
      method: action ? "POST" : "GET",
      headers: { Authorization: `Bearer ${await playAccess()}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw Error(`Google Play ${action || "lookup"} ${response.status}`);
    return response;
  };
  const p = await (await play()).json();
  if (p.purchaseState !== 0) throw Error(`purchase state ${p.purchaseState}`);
  if (p.productId && p.productId !== productId)
    throw Error(`product ${p.productId}`);
  if (p.obfuscatedExternalAccountId !== account)
    throw Error("bought by another account");
  return {
    // Licence-tester purchases carry no order id.
    key: `android:${p.orderId || createHash("sha256").update(token).digest("hex")}`,
    quantity: p.quantity ?? 1,
    environment: p.purchaseType === 0 ? "Test" : "Production",
    // Once credited, consume it so the product can be bought again. Best effort: the app
    // consumes it too when it finishes the transaction, and a retried claim runs this again.
    settle: async () => {
      if (p.acknowledgementState !== 1)
        await play(":acknowledge").catch(() => {});
      if (p.consumptionState !== 1) await play(":consume").catch(() => {});
    },
  };
}

/**
 * Prove a store transaction paid for `productId` and was made for `account`. Throws otherwise.
 * Returns the store's own idempotency key for it, and `settle` to run once it is credited.
 */
export async function verifyPurchase(
  platform: Platform,
  productId: string,
  payload: string,
  account: string,
) {
  const verified =
    platform === "ios"
      ? await verifyApple(productId, payload, account)
      : await verifyGoogle(productId, payload, account);
  if (!Number.isInteger(verified.quantity) || verified.quantity < 1)
    throw Error(`quantity ${verified.quantity}`);
  return verified;
}

export function installStore(
  app: Express,
  db: Db,
  required: RequestHandler,
  publicUser: (u: any) => any,
) {
  const users = db.collection<any>("players"),
    purchases = db.collection<any>("purchases");

  app.get("/store", required, async (req: any, res) => {
    const season = currentSeason();
    res.json({
      platforms: {
        ios: billingConfigured("ios"),
        android: billingConfigured("android"),
      },
      rubies: req.player.rubies || 0,
      coins: req.player.coins || 0,
      products: PRODUCTS.map((p) => {
        if (p.oneTime)
          return {
            ...p,
            owned: !!req.player.starterBought,
            available: !req.player.starterBought,
          };
        if (p.grants.passSeason) {
          const owned = req.player.passPremiumSeason === season.id;
          return { ...p, owned, available: !owned, season };
        }
        return p;
      }),
      accountToken: accountToken(req.player._id),
      history: await purchases
        .find(
          { playerId: req.player._id },
          {
            projection: {
              _id: 0,
              productId: 1,
              platform: 1,
              grants: 1,
              environment: 1,
              createdAt: 1,
            },
          },
        )
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
    });
  });

  app.post(
    "/store/claim",
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
          productId: z.enum(PRODUCTS.map((p) => p.id) as [string, ...string[]]),
          transaction: z.string().trim().min(8).max(16000),
        })
        .strict()
        .parse(req.body);
      if (!billingConfigured(input.platform))
        return res
          .status(503)
          .json({ error: "Purchases are not available on this device yet." });
      const product = PRODUCTS.find((p) => p.id === input.productId)!;
      let verified;
      try {
        verified = await verifyPurchase(
          input.platform,
          product.id,
          input.transaction,
          accountToken(req.player._id),
        );
      } catch (e) {
        console.warn(
          "Store purchase refused:",
          input.platform,
          product.id,
          (e as Error).message,
        );
        return res
          .status(402)
          .json({ error: "This purchase could not be verified." });
      }
      const { key, quantity } = verified;
      const grants = {
        ...(product.grants.coins
          ? { coins: product.grants.coins * quantity }
          : {}),
        ...(product.grants.rubies
          ? { rubies: product.grants.rubies * quantity }
          : {}),
        ...(product.grants.passSeason
          ? { passSeason: currentSeason().id }
          : {}),
      };
      const set = {
        ...(product.oneTime ? { starterBought: true } : {}),
        ...(grants.passSeason ? { passPremiumSeason: grants.passSeason } : {}),
      };
      // The credit and its idempotency key land in one atomic write on the player, so a replayed,
      // retried or concurrent claim can never pay twice, and a crash after it cannot lose a
      // purchase. (Spanning two collections atomically would need a replica set.)
      // ponytail: every credited key stays on the player document; cap it with $slice plus a
      // `purchases` lookup if a player ever holds thousands.
      const updated = await users.findOneAndUpdate(
        { _id: req.player._id, purchaseKeys: { $ne: key } },
        {
          $inc: { coins: grants.coins || 0, rubies: grants.rubies || 0 },
          $addToSet: { purchaseKeys: key },
          ...(Object.keys(set).length ? { $set: set } : {}),
        },
        { returnDocument: "after" },
      );
      // The record keeps the store's transaction key as its id; a replay finds the original.
      const record = await purchases.findOneAndUpdate(
        { _id: key },
        {
          $setOnInsert: {
            playerId: req.player._id,
            platform: input.platform,
            productId: product.id,
            grants,
            quantity,
            environment: verified.environment,
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "after" },
      );
      await verified.settle();
      res.json({
        credited: !!updated,
        grants: record?.grants || grants,
        player: publicUser(
          updated || (await users.findOne({ _id: req.player._id })),
        ),
      });
    },
  );
}
