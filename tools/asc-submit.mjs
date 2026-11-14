// Attaches the newest processed build to App Store version 1.0, answers the export-compliance
// question (no non-exempt encryption), bundles the 12 in-app purchases into one review
// submission with the version, and submits it to App Review.
//
//   node tools/asc-submit.mjs --key ~/Downloads/AuthKey_XXXX.p8 --kid XXXX [--iss <issuer>] [--dry-run]
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const APP = "6833168163";
const args = process.argv.slice(2);
const opt = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const keyFile = opt("--key"),
  kid = opt("--kid"),
  iss = opt("--iss", "f71295f2-a0fd-4155-94d1-df5f2a1e26d5");
const dryRun = args.includes("--dry-run");
if (!keyFile || !kid) throw Error("Pass --key <AuthKey.p8> --kid <key id>.");
const key = readFileSync(keyFile, "utf8");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64({ alg: "ES256", kid, typ: "JWT" }) +
    "." +
    b64({ iss, aud: "appstoreconnect-v1", iat: now, exp: now + 1200 });
  return (
    unsigned +
    "." +
    createSign("SHA256")
      .update(unsigned)
      .sign({ key, dsaEncoding: "ieee-p1363" }, "base64url")
  );
}
const already = (e) => /already added/i.test(e.message);
async function api(method, path, body) {
  const r = await fetch("https://api.appstoreconnect.apple.com" + path, {
    method,
    headers: {
      authorization: "Bearer " + token(),
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok)
    throw Error(`${method} ${path} → ${r.status} ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

const builds = (
  await api(
    "GET",
    `/v1/builds?filter[app]=${APP}&sort=-uploadedDate&limit=5&fields[builds]=version,processingState,uploadedDate,usesNonExemptEncryption`,
  )
).data;
const build = builds.find((b) => b.attributes.processingState === "VALID");
if (!build)
  throw Error(
    "No processed build yet: " +
      builds
        .map((b) => `${b.attributes.version} ${b.attributes.processingState}`)
        .join(", "),
  );
console.log(
  "build",
  build.attributes.version,
  build.id,
  "uploaded",
  build.attributes.uploadedDate,
);
const version = (
  await api(
    "GET",
    `/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=1`,
  )
).data[0];
console.log(
  "version",
  version.attributes.versionString,
  version.attributes.appStoreState,
);
const iaps = (
  await api(
    "GET",
    `/v1/apps/${APP}/inAppPurchasesV2?fields[inAppPurchases]=productId,state&limit=50`,
  )
).data;
console.log(
  "purchases:",
  iaps.map((p) => `${p.attributes.productId}=${p.attributes.state}`).join(" "),
);
if (dryRun) process.exit(0);

if (build.attributes.usesNonExemptEncryption !== false)
  await api("PATCH", `/v1/builds/${build.id}`, {
    data: {
      type: "builds",
      id: build.id,
      attributes: { usesNonExemptEncryption: false },
    },
  });
await api("PATCH", `/v1/appStoreVersions/${version.id}/relationships/build`, {
  data: { type: "builds", id: build.id },
});
console.log("build attached, export compliance answered");

let submission = (
  await api(
    "GET",
    `/v1/apps/${APP}/reviewSubmissions?filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES`,
  )
).data[0];
if (!submission)
  submission = (
    await api("POST", "/v1/reviewSubmissions", {
      data: {
        type: "reviewSubmissions",
        attributes: { platform: "IOS" },
        relationships: { app: { data: { type: "apps", id: APP } } },
      },
    })
  ).data;
console.log("review submission", submission.id, submission.attributes.state);
const items = (await api("GET", `/v1/reviewSubmissions/${submission.id}/items`))
  .data;
const has = (type, id) =>
  items.some((i) => i.relationships?.[type]?.data?.id === id);
if (!has("appStoreVersion", version.id))
  await api("POST", "/v1/reviewSubmissionItems", {
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: {
          data: { type: "reviewSubmissions", id: submission.id },
        },
        appStoreVersion: { data: { type: "appStoreVersions", id: version.id } },
      },
    },
  }).catch((e) => {
    if (!already(e)) throw e;
  });
// The public API cannot attach in-app purchases to a submission. For the first consumable
// purchases, open each purchase in App Store Connect and use "Add for Review" > the draft iOS
// submission before running this script; they then ride along with the version item.
console.log("version item added");
// After a rejection the rejected item must be marked resolved (the fix is already on the
// version: new metadata or a new build) or the submission cannot be submitted again.
for (const item of items.filter((i) => i.attributes.state === "REJECTED")) {
  await api("PATCH", `/v1/reviewSubmissionItems/${item.id}`, {
    data: {
      type: "reviewSubmissionItems",
      id: item.id,
      attributes: { resolved: true },
    },
  });
  console.log("rejected item marked resolved", item.id);
}
await api("PATCH", `/v1/reviewSubmissions/${submission.id}`, {
  data: {
    type: "reviewSubmissions",
    id: submission.id,
    attributes: { submitted: true },
  },
});
console.log("submitted for review");
