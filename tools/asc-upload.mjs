// Pushes CueMaster's App Store screenshots, in-app purchases and version metadata through the
// App Store Connect API, so the only clicks left in App Store Connect are picking the build and
// pressing "Add for Review".
//
//   node tools/asc-upload.mjs --key ~/Downloads/AuthKey_XXXX.p8 --kid XXXX --iss <issuer-id> [screenshots|iaps|version|all]
//
// Re-running is safe: screenshots are replaced per display type, products are created once and
// then updated, and metadata is overwritten.
import { readFileSync, readdirSync } from "node:fs";
import { createSign, createHash } from "node:crypto";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const APP = "6833168163";
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const keyFile = opt("--key"), kid = opt("--kid"), iss = opt("--iss", "f71295f2-a0fd-4155-94d1-df5f2a1e26d5");
const command = args.find((a) => !a.startsWith("--") && !["--key", "--kid", "--iss"].includes(args[args.indexOf(a) - 1])) || "all";
if (!keyFile || !kid) throw Error("Pass --key <AuthKey.p8> --kid <key id> (and --iss <issuer id> if not the team default).");
const key = readFileSync(keyFile, "utf8");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: "ES256", kid, typ: "JWT" }) + "." + b64({ iss, aud: "appstoreconnect-v1", iat: now, exp: now + 1200 });
  return unsigned + "." + createSign("SHA256").update(unsigned).sign({ key, dsaEncoding: "ieee-p1363" }, "base64url");
}
async function api(method, path, body) {
  const r = await fetch("https://api.appstoreconnect.apple.com" + path, {
    method,
    headers: { authorization: "Bearer " + token(), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw Error(`${method} ${path} → ${r.status} ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reserve, upload in chunks, then commit one asset (screenshot or review screenshot). */
async function uploadAsset(type, parentRel, file) {
  const data = readFileSync(file);
  const reserved = await api("POST", `/v1/${type}`, {
    data: { type, attributes: { fileName: basename(file), fileSize: data.length }, relationships: parentRel },
  });
  for (const op of reserved.data.attributes.uploadOperations) {
    const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
    const r = await fetch(op.url, { method: op.method, headers, body: data.subarray(op.offset, op.offset + op.length) });
    if (!r.ok) throw Error(`chunk upload ${r.status}`);
  }
  await api("PATCH", `/v1/${type}/${reserved.data.id}`, {
    data: { type, id: reserved.data.id, attributes: { uploaded: true, sourceFileChecksum: createHash("md5").update(data).digest("hex") } },
  });
  return reserved.data.id;
}

// ------------------------------------------------------------------ version
async function version() {
  const v = (await api("GET", `/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=1`)).data[0];
  const loc = (await api("GET", `/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data.find((l) => l.attributes.locale === "en-US");
  const listing = readFileSync(join(root, "tools", "play-upload.mjs"), "utf8");
  const full = listing.match(/fullDescription: `([^`]*)`/)[1];
  await api("PATCH", `/v1/appStoreVersionLocalizations/${loc.id}`, {
    data: {
      type: "appStoreVersionLocalizations",
      id: loc.id,
      attributes: {
        description: full,
        keywords: "8ball,cue,snooker,billiard,multiplayer,friends,trick,shot,spin,offline,classic,table,stick,club",
        promotionalText: "Real-physics 8-ball pool. Play online, challenge friends, win coins and crates every day.",
        supportUrl: "https://cuemaster-api.onrender.com/legal/support",
        marketingUrl: "https://cuemaster-api.onrender.com/play",
        whatsNew: undefined,
      },
    },
  });
  await api("PATCH", `/v1/appStoreVersions/${v.id}`, { data: { type: "appStoreVersions", id: v.id, attributes: { copyright: "2026 Bonhomie LLC", releaseType: "MANUAL" } } });
  console.log("version 1.0 metadata ok");
  return { v, loc };
}

// ------------------------------------------------------------------ screenshots
const SHOTS = {
  APP_IPHONE_67: join(root, "artifacts", "store-listing", "appstore-2868x1320"),
  APP_IPAD_PRO_3GEN_129: join(root, "artifacts", "store-listing", "ipad-2752x2064"),
};
async function screenshots() {
  const { loc } = await version();
  const sets = (await api("GET", `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?include=appScreenshots`)).data;
  for (const [display, dir] of Object.entries(SHOTS)) {
    let files;
    try { files = readdirSync(dir).filter((f) => /\.(png|jpg)$/.test(f)).sort().map((f) => join(dir, f)); } catch { console.log(`${display}: no folder ${dir}, skipped`); continue; }
    let set = sets.find((s) => s.attributes.screenshotDisplayType === display);
    if (!set) set = (await api("POST", "/v1/appScreenshotSets", { data: { type: "appScreenshotSets", attributes: { screenshotDisplayType: display }, relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: loc.id } } } } })).data;
    const existing = (await api("GET", `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data;
    for (const s of existing) await api("DELETE", `/v1/appScreenshots/${s.id}`);
    for (const f of files) await uploadAsset("appScreenshots", { appScreenshotSet: { data: { type: "appScreenshotSets", id: set.id } } }, f);
    console.log(`${display}: ${files.length} screenshots uploaded`);
  }
}

// ------------------------------------------------------------------ in-app purchases
const PRODUCTS = [
  ["rubies.handful", 0.99, "Handful of rubies", "20 rubies"],
  ["rubies.pouch", 4.99, "Pouch of rubies", "110 rubies, 10% bonus"],
  ["rubies.chest", 9.99, "Chest of rubies", "240 rubies, 20% bonus"],
  ["rubies.vault", 24.99, "Vault of rubies", "650 rubies, 30% bonus"],
  ["rubies.hoard", 49.99, "Hoard of rubies", "1,400 rubies, 40% bonus"],
  ["coins.pile", 0.99, "Pile of coins", "2,000 coins"],
  ["coins.stack", 4.99, "Stack of coins", "11,000 coins, 10% bonus"],
  ["coins.bag", 9.99, "Bag of coins", "24,000 coins, 20% bonus"],
  ["coins.vault", 24.99, "Vault of coins", "65,000 coins, 30% bonus"],
  ["starter.pack", 1.99, "Starter pack", "5,000 coins and 60 rubies, once"],
  ["pass.premium", 4.99, "CueMaster Pass", "Premium track of this season's pass"],
  ["piggy.break", 0.99, "Piggy bank", "Pays out everything saved inside"],
];
const REVIEW_SHOT = join(root, "artifacts", "store-screenshots", "appstore-2868x1320", "16-shop-rubies.png");
async function iaps() {
  const existing = (await api("GET", `/v1/apps/${APP}/inAppPurchasesV2?limit=200`)).data;
  const territories = (await api("GET", "/v1/territories?limit=200")).data.map((t) => ({ type: "territories", id: t.id }));
  for (const [productId, usd, name, description] of PRODUCTS) {
    let iap = existing.find((p) => p.attributes.productId === productId);
    if (!iap) {
      iap = (await api("POST", "/v2/inAppPurchases", { data: { type: "inAppPurchases", attributes: { name, productId, inAppPurchaseType: "CONSUMABLE", reviewNote: "Grants in-game currency or a pass; the server verifies the StoreKit transaction before crediting." }, relationships: { app: { data: { type: "apps", id: APP } } } } })).data;
      console.log("created", productId);
    }
    // Localization (display name ≤ 30, description ≤ 45).
    const locs = (await api("GET", `/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations`)).data;
    const en = locs.find((l) => l.attributes.locale === "en-US");
    if (en) await api("PATCH", `/v1/inAppPurchaseLocalizations/${en.id}`, { data: { type: "inAppPurchaseLocalizations", id: en.id, attributes: { name, description } } });
    else await api("POST", "/v1/inAppPurchaseLocalizations", { data: { type: "inAppPurchaseLocalizations", attributes: { name, description, locale: "en-US" }, relationships: { inAppPurchaseV2: { data: { type: "inAppPurchases", id: iap.id } } } } });
    // Price: the USD price point for the US, Apple fills every other territory.
    const points = (await api("GET", `/v2/inAppPurchases/${iap.id}/pricePoints?filter[territory]=USA&limit=200`)).data;
    const point = points.find((p) => Number(p.attributes.customerPrice) === usd);
    if (!point) throw Error(`no USD price point for ${usd}`);
    await api("POST", "/v1/inAppPurchasePriceSchedules", {
      data: {
        type: "inAppPurchasePriceSchedules",
        relationships: {
          inAppPurchase: { data: { type: "inAppPurchases", id: iap.id } },
          baseTerritory: { data: { type: "territories", id: "USA" } },
          manualPrices: { data: [{ type: "inAppPurchasePrices", id: "${price}" }] },
        },
      },
      included: [{ type: "inAppPurchasePrices", id: "${price}", attributes: { startDate: null }, relationships: { inAppPurchasePricePoint: { data: { type: "inAppPurchasePricePoints", id: point.id } } } }],
    });
    // Availability: everywhere, including territories Apple adds later.
    await api("POST", "/v1/inAppPurchaseAvailabilities", { data: { type: "inAppPurchaseAvailabilities", attributes: { availableInNewTerritories: true }, relationships: { inAppPurchase: { data: { type: "inAppPurchases", id: iap.id } }, availableTerritories: { data: territories } } } });
    // Review screenshot: the shop page.
    const shot = await api("GET", `/v2/inAppPurchases/${iap.id}/appStoreReviewScreenshot`).catch(() => ({ data: null }));
    if (!shot.data) await uploadAsset("inAppPurchaseAppStoreReviewScreenshots", { inAppPurchaseV2: { data: { type: "inAppPurchases", id: iap.id } } }, REVIEW_SHOT);
    console.log("ready", productId, usd);
  }
}

if (command === "version") await version();
else if (command === "screenshots") await screenshots();
else if (command === "iaps") await iaps();
else { await screenshots(); await iaps(); }
