// Pushes CueMaster's Google Play listing, store images, release bundle and in-app products with
// the Play Developer API, so nothing has to be clicked through the console by hand.
//
//   node tools/play-upload.mjs <service-account.json> [--bundle artifacts/release/x.aab] [--skip-products]
//   node tools/play-upload.mjs <service-account.json> --bundle x.aab --internal-only
//
// --internal-only puts the bundle on the internal testing track and touches nothing else, so a
// release that is in review on production stays exactly as submitted.
//
// The service account must be added under Play Console → Users and permissions with access to
// the app. Re-running is safe: listings and products are overwritten, images are replaced.
import { readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
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
/**
 * Google can hold a bundle upload's reply past fetch's five-minute header timeout (27 Nov), so the
 * bundle goes up with curl, which waits. The token reaches curl through a private header file.
 */
function uploadFile(url, file) {
  const auth = join(tmpdir(), `play-auth-${process.pid}`);
  writeFileSync(auth, `Authorization: Bearer ${tok}\n`, { mode: 0o600 });
  try {
    const out = execFileSync(
      "curl",
      [
        "-sS",
        "-X",
        "POST",
        "-H",
        `@${auth}`,
        "-H",
        "Content-Type: application/octet-stream",
        "--data-binary",
        `@${file}`,
        "-w",
        "\n%{http_code}",
        url,
      ],
      { maxBuffer: 1 << 26 },
    ).toString();
    const cut = out.lastIndexOf("\n"),
      status = Number(out.slice(cut + 1));
    if (status >= 300)
      throw Error(
        `POST ${url.replace(UPLOAD, "")} → ${status} ${out.slice(0, cut).slice(0, 400)}`,
      );
    return JSON.parse(out.slice(0, cut));
  } finally {
    rmSync(auth, { force: true });
  }
}
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
  fullDescription: `Start in Lagos. Finish in Monaco. CueMaster is 3D pool across fourteen real cities, each with its own table, landmark and trick shots. Coins alone do not open the next city: you have to win there first, and the climb ends at a Monaco table where the entry is a billion coins.

THE DAILY SHOT
One layout for every player in the world each day. Fewest shots wins.

FOURTEEN CITIES, ONE BILLION-COIN TABLE
Lagos, London, Paris, Tokyo, Dubai, New York, Cape Town, Rio de Janeiro, Cairo, Mumbai, Rome, Sydney, Singapore and Monaco. Each city has its own felt, its own landmark and its own trick shots to learn.

PHYSICS, NOT ANIMATION
Every shot behaves the way it would on the felt: draw, follow and side spin change each rebound, cushions grip, and a ball struck slightly off line rattles in the jaws. Slow-motion instant replay shows exactly how your best shot went in.

PLAY ONLINE, REFEREED BY THE SERVER
• 1v1 online: the winner takes the pot, and every shot is ruled on the server, so nobody can cheat their way to a win
• Invite a friend to a private table with a code or a link
• Rematch, quick chat and trophies for every win
• Weekly leagues from Bronze to Diamond: win the most pots by Sunday to move up

PLAY YOUR WAY
• House rivals that adapt to your form when you want a quick rack
• 2-player pass & play on one phone
• Practice drills for cut shots, spin and clearing the table, and free play offline

PROPER 8-BALL RULES
Groups, fouls, ball in hand and break choices are all here, so a smart safety matters as much as a long pot.

SOMETHING TO WIN EVERY DAY
Daily login rewards, free coins every four hours, a free spin, the Lucky Shot at the prize rings, three daily missions, the season CueMaster Pass, a reward crate for every win and a piggy bank that fills with every match.

SIMPLE CONTROLS, DEEP GAME
Drag to aim, set spin with a touch, pull back for power. Easy to pick up, hard to master.

Reward videos are always your choice, and nothing interrupts a rack.

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
const internalOnly = args.includes("--internal-only");
if (internalOnly && !bundle) throw Error("--internal-only needs --bundle");
if (!args.includes("--products-only")) {
  const edit = await call("POST", `${API}/edits`, {});
  const E = `${API}/edits/${edit.id}`;
  console.log("edit", edit.id);
  if (!internalOnly) await pushListing(E, edit.id);
  if (bundle) {
    let up;
    try {
      up = uploadFile(
        `${UPLOAD}/edits/${edit.id}/bundles?uploadType=media`,
        join(root, bundle),
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
    if (internalOnly) console.log("internal track live");
    else {
      await call("PUT", `${E}/tracks/production`, {
        track: "production",
        releases: [{ ...release, status: "draft" }],
      });
      console.log("internal track live, production draft ready");
    }
  }
  // Once a submission has been reviewed (or rejected), Play refuses to send further changes for
  // review by API: commit them unsent and press "Send changes for review" in the Console.
  // While a review is already running, Play insists the opposite way round: the commit itself
  // sends the changes for review and the flag is refused.
  try {
    await call("POST", `${E}:commit?changesNotSentForReview=true`);
    console.log("edit committed (send for review from the Console)");
  } catch (e) {
    if (!/must not be set/.test(e.message)) throw e;
    await call("POST", `${E}:commit`);
    console.log("edit committed and sent for review");
  }
}
async function pushListing(E, editId) {
  await call("PUT", `${E}/listings/${LANG}`, LISTING);
  console.log("listing ok");
  await call("PATCH", `${E}/details`, DETAILS);
  console.log("details ok");
  for (const [type, files] of Object.entries(IMAGES)) {
    await call("DELETE", `${E}/listings/${LANG}/${type}`);
    for (const f of files) {
      await call(
        "POST",
        `${UPLOAD}/edits/${editId}/listings/${LANG}/${type}?uploadType=media`,
        readFileSync(f),
        "image/png",
      );
    }
    console.log(`${type}: ${files.length} image(s)`);
  }
}

if (!args.includes("--skip-products") && !internalOnly) {
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
