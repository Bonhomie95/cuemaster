// Pushes CueMaster's Google Play listing, store images, release bundle and in-app products with
// the Play Developer API, so nothing has to be clicked through the console by hand.
//
//   node tools/play-upload.mjs <service-account.json> [--bundle artifacts/release/x.aab] [--skip-products]
//
// The service account must be added under Play Console → Users and permissions with access to
// the app. Re-running is safe: listings and products are overwritten, images are replaced.
import { readFileSync, readdirSync } from "node:fs";
import { createSign } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const PKG = "com.bonhomie.cuemaster";
const LANG = "en-US";
const args = process.argv.slice(2);
const keyFile = args.find((a) => !a.startsWith("--"));
const bundle = args.includes("--bundle")
  ? args[args.indexOf("--bundle") + 1]
  : null;
if (!keyFile) throw Error("Pass the service-account JSON path.");
const key = JSON.parse(readFileSync(keyFile, "utf8"));

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });
  const sig = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(key.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + sig,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw Error("No token: " + JSON.stringify(j));
  return j.access_token;
}
const tok = await token();
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`;
async function call(method, url, body, type = "application/json") {
  const r = await fetch(url, {
    method,
    headers: {
      authorization: "Bearer " + tok,
      ...(body ? { "content-type": type } : {}),
    },
    body: body && type === "application/json" ? JSON.stringify(body) : body,
  });
  const text = await r.text();
  if (!r.ok)
    throw Error(
      `${method} ${url.replace(API, "").replace(UPLOAD, "")} → ${r.status} ${text.slice(0, 500)}`,
    );
  return text ? JSON.parse(text) : {};
}

// ------------------------------------------------------------------ listing
const LISTING = {
  language: LANG,
  title: "CueMaster: 3D Pool Billiards",
  shortDescription:
    "8-ball pool from Lagos to Monaco: win your way up to the billion-coin table.",
  fullDescription: `Start in Lagos. Finish in Monaco. CueMaster is 3D 8-ball pool across fourteen cities, each table harder to reach than the last, up to a final table where the entry is a billion coins. Every shot behaves the way it would on the felt: draw, follow and side spin change each rebound, cushions grip, and a ball struck slightly off line rattles in the jaws.

PLAY ONLINE
• 1v1 8-ball online: the winner takes the pot
• Invite a friend to a private table with a code or a link
• Rematch, quick chat and trophies for every win

PLAY YOUR WAY
• House rivals that adapt to your form when you want a quick rack
• 2-player pass & play on one phone
• Practice drills for cut shots, spin and clearing the table, and free play offline

FOURTEEN CITIES, ONE BILLION-COIN TABLE
Lagos, London, Paris, Tokyo, Dubai, New York, Cape Town, Rio de Janeiro, Cairo, Mumbai, Rome, Sydney, Singapore and Monaco, each with its own table, landmark and trick shots. Coins are not enough: win at one city to open the next, and climb from a 250-coin entry to a billion.

EVERY DAY THERE IS SOMETHING TO WIN
• Daily login rewards, free coins every four hours and a free spin of the prize wheel
• The Lucky Shot: stop the cue ball in the rings to win coins, rubies or a crate
• Three daily missions and the season CueMaster Pass
• The Daily Shot: the same layout for everyone, fewest shots wins
• Reward crates for every win, and a piggy bank that fills with every match

CLIMB THE WEEKLY LEAGUES
Play online to join a league of players at your level. Win the most pots by Sunday to move up, from Bronze to Diamond, and earn a crate.

PROPER 8-BALL RULES
Groups, fouls, ball in hand and break choices are all here, so a smart safety matters as much as a long pot.

SEE IT AGAIN
Slow-motion instant replay shows exactly how your best shot went in.

SIMPLE CONTROLS, DEEP GAME
Drag to aim, set spin with a touch, pull back for power. Easy to pick up, hard to master.

FAIR BY DESIGN
Every online shot is refereed by the server, so nobody can cheat their way to a win. Reward videos are always your choice, and nothing interrupts a rack.

Chalk your cue, pick a city and break.

Optional in-app purchases. Optional reward videos. Coins and rubies are virtual items with no cash value.`,
};
const DETAILS = {
  defaultLanguage: LANG,
  contactEmail: "support@bonhomieinc.dev",
  contactWebsite: "https://cuemaster-api.onrender.com/play",
};
const art = join(root, "artifacts", "store-listing");
const shots = readdirSync(join(art, "play-1920x1080"))
  .filter((f) => f.endsWith(".png"))
  .sort()
  .map((f) => join(art, "play-1920x1080", f));
const IMAGES = {
  icon: [join(art, "icon-512.png")],
  featureGraphic: [join(art, "feature-graphic-1024x500.png")],
  phoneScreenshots: shots,
  sevenInchScreenshots: shots,
  tenInchScreenshots: shots,
};

// ------------------------------------------------------------------ products
// Same ids, prices and quantities as server/src/store.ts PRODUCTS; the server grants from its own
// table, so a mismatch here only changes what the store page shows.
export const PRODUCTS = [
  [
    "rubies.handful",
    0.99,
    "Handful of rubies",
    "20 rubies to open crates early and keep the spins coming.",
  ],
  ["rubies.pouch", 4.99, "Pouch of rubies", "110 rubies, with a 10% bonus."],
  ["rubies.chest", 9.99, "Chest of rubies", "240 rubies, with a 20% bonus."],
  ["rubies.vault", 24.99, "Vault of rubies", "650 rubies, with a 30% bonus."],
  ["rubies.hoard", 49.99, "Hoard of rubies", "1,400 rubies, with a 40% bonus."],
  ["coins.pile", 0.99, "Pile of coins", "2,000 coins for table entries."],
  ["coins.stack", 4.99, "Stack of coins", "11,000 coins, with a 10% bonus."],
  ["coins.bag", 9.99, "Bag of coins", "24,000 coins, with a 20% bonus."],
  ["coins.vault", 24.99, "Vault of coins", "65,000 coins, with a 30% bonus."],
  [
    "starter.pack",
    1.99,
    "Starter pack",
    "5,000 coins and 60 rubies, once per account.",
  ],
  [
    "pass.premium",
    4.99,
    "CueMaster Pass",
    "Unlocks the premium track of this season's CueMaster Pass.",
  ],
  [
    "piggy.break",
    0.99,
    "Piggy bank",
    "Breaks open your piggy bank and pays out everything inside.",
  ],
];

// ------------------------------------------------------------------ run
if (!args.includes("--products-only")) {
  const edit = await call("POST", `${API}/edits`, {});
  const E = `${API}/edits/${edit.id}`;
  console.log("edit", edit.id);
  await call("PUT", `${E}/listings/${LANG}`, LISTING);
  console.log("listing ok");
  await call("PATCH", `${E}/details`, DETAILS);
  console.log("details ok");
  for (const [type, files] of Object.entries(IMAGES)) {
    await call("DELETE", `${E}/listings/${LANG}/${type}`);
    for (const f of files) {
      await call(
        "POST",
        `${UPLOAD}/edits/${edit.id}/listings/${LANG}/${type}?uploadType=media`,
        readFileSync(f),
        "image/png",
      );
    }
    console.log(`${type}: ${files.length} image(s)`);
  }
  if (bundle) {
    let up;
    try {
      up = await call(
        "POST",
        `${UPLOAD}/edits/${edit.id}/bundles?uploadType=media`,
        readFileSync(join(root, bundle)),
        "application/octet-stream",
      );
    } catch (e) {
      // The same version code was committed by an earlier run: reuse it instead of failing.
      if (!/already been used|already exists/i.test(e.message)) throw e;
      const have = (await call("GET", `${E}/bundles`)).bundles || [];
      up = have.sort((a, b) => b.versionCode - a.versionCode)[0];
      console.log(
        "bundle already on Play, reusing versionCode",
        up.versionCode,
      );
    }
    console.log("bundle versionCode", up.versionCode);
    const release = {
      name: "1.0.0 (" + up.versionCode + ")",
      versionCodes: [String(up.versionCode)],
      releaseNotes: [
        {
          language: LANG,
          text: "First release: real-physics 8-ball, online 1v1, fourteen city venues from Lagos to Monaco, daily rewards.",
        },
      ],
    };
    await call("PUT", `${E}/tracks/internal`, {
      track: "internal",
      releases: [{ ...release, status: "completed" }],
    });
    await call("PUT", `${E}/tracks/production`, {
      track: "production",
      releases: [{ ...release, status: "draft" }],
    });
    console.log("internal track live, production draft ready");
  }
  await call("POST", `${E}:commit`);
  console.log("edit committed");
}

if (!args.includes("--skip-products")) {
  // One-time products through the current monetization API: an upsert per product with every
  // region priced from the USD price (Google converts and rounds), then the purchase option is
  // activated. The legacy inappproducts endpoint refuses new apps.
  const money = (m) => ({
    currencyCode: m.currencyCode,
    units: m.units || "0",
    nanos: m.nanos || 0,
  });
  for (const [sku, usd, title, description] of PRODUCTS) {
    const base = {
      currencyCode: "USD",
      units: String(Math.floor(usd)),
      nanos: Math.round((usd - Math.floor(usd)) * 1e9),
    };
    const conv = await call("POST", `${API}/pricing:convertRegionPrices`, {
      price: base,
    });
    const regional = Object.values(conv.convertedRegionPrices || {}).map(
      (r) => ({
        regionCode: r.regionCode,
        price: money(r.price),
        availability: "AVAILABLE",
      }),
    );
    const body = {
      packageName: PKG,
      productId: sku,
      listings: [{ languageCode: LANG, title, description }],
      purchaseOptions: [
        {
          purchaseOptionId: "buy",
          buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
          regionalPricingAndAvailabilityConfigs: regional,
          newRegionsConfig: {
            usdPrice: money(conv.convertedOtherRegionsPrice?.usdPrice || base),
            eurPrice: money(
              conv.convertedOtherRegionsPrice?.eurPrice || {
                currencyCode: "EUR",
                units: base.units,
                nanos: base.nanos,
              },
            ),
            availability: "AVAILABLE",
          },
        },
      ],
    };
    await call(
      "PATCH",
      `${API}/onetimeproducts/${sku}?allowMissing=true&regionsVersion.version=2026/01&updateMask=listings,purchaseOptions&latencyTolerance=PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT`,
      body,
    );
    await call(
      "POST",
      `${API}/oneTimeProducts/${sku}/purchaseOptions:batchUpdateStates`,
      {
        requests: [
          {
            activatePurchaseOptionRequest: {
              packageName: PKG,
              productId: sku,
              purchaseOptionId: "buy",
              latencyTolerance:
                "PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT",
            },
          },
        ],
      },
    );
    console.log("product active", sku, usd, `(${regional.length} regions)`);
  }
}
