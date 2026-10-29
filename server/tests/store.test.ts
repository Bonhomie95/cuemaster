import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  createPrivateKey,
  generateKeyPairSync,
  randomUUID,
  X509Certificate,
  type KeyObject,
} from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CompactSign, jwtVerify } from "jose";
import { PRODUCTS, RUBY_PACKS, billingConfigured } from "../src/store";
import { currentSeason } from "../src/season";

/**
 * The suite's own API (from the runner) keeps billing pinned off, which is what the 503 check
 * needs. The certificates and keys below only exist once this file runs, after that API has
 * started, so the purchase checks start their own API with billing on, trusting the generated
 * Apple root and talking to a local stand-in for Google.
 */
const pinned = process.env.TEST_API_URL || "http://127.0.0.1:4000";

// A root, an intermediate and EC P-256 leaves made with the openssl CLI, as Apple's are.
const dir = mkdtempSync(join(tmpdir(), "cuemaster-store-"));
writeFileSync(
  join(dir, "ca.cnf"),
  `[req]
distinguished_name = dn
[dn]
[root]
basicConstraints = critical,CA:true
keyUsage = critical,keyCertSign,cRLSign
[intermediate]
basicConstraints = critical,CA:true,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
1.2.840.113635.100.6.2.1 = ASN1:NULL
[leaf]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
1.2.840.113635.100.6.11.1 = ASN1:NULL
[unmarked]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
`,
);
const openssl = (...args: string[]) =>
  execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
let serial = 1;
function issue(name: string, issuer: string | null, section: string) {
  openssl(
    "ecparam",
    "-name",
    "prime256v1",
    "-genkey",
    "-noout",
    "-out",
    `${name}.key`,
  );
  const subject = ["-subj", `/CN=${name}`, "-config", "ca.cnf"];
  if (issuer) {
    openssl(
      "req",
      "-new",
      "-key",
      `${name}.key`,
      ...subject,
      "-out",
      `${name}.csr`,
    );
    openssl(
      "x509",
      "-req",
      "-in",
      `${name}.csr`,
      "-CA",
      `${issuer}.pem`,
      "-CAkey",
      `${issuer}.key`,
      "-set_serial",
      String(++serial),
      "-days",
      "30",
      "-extfile",
      "ca.cnf",
      "-extensions",
      section,
      "-out",
      `${name}.pem`,
    );
  } else
    openssl(
      "req",
      "-new",
      "-x509",
      "-key",
      `${name}.key`,
      ...subject,
      "-days",
      "30",
      "-extensions",
      section,
      "-out",
      `${name}.pem`,
    );
  return {
    pem: readFileSync(join(dir, `${name}.pem`), "utf8"),
    key: createPrivateKey(readFileSync(join(dir, `${name}.key`))),
  };
}
type Chain = { x5c: string[]; key: KeyObject };
const chainOf = (...certs: { pem: string; key: KeyObject }[]): Chain => ({
  x5c: certs.map((c) => new X509Certificate(c.pem).raw.toString("base64")),
  key: certs[0].key,
});
const root = issue("root", null, "root"),
  mid = issue("mid", "root", "intermediate");
const otherRoot = issue("other-root", null, "root"),
  otherMid = issue("other-mid", "other-root", "intermediate");
const chains = {
  apple: chainOf(issue("leaf", "mid", "leaf"), mid, root),
  untrusted: chainOf(
    issue("other-leaf", "other-mid", "leaf"),
    otherMid,
    otherRoot,
  ),
  unmarked: chainOf(issue("plain-leaf", "mid", "unmarked"), mid, root),
};

// A stand-in for Google: the OAuth token exchange and the Play purchases API.
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const serviceAccount = {
  type: "service_account",
  client_email: "store@cuemaster-test.iam.gserviceaccount.com",
  private_key_id: "test-key",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
};
const play = {
  tokens: 0,
  purchases: new Map<string, any>(),
  acknowledged: new Set<string>(),
  consumed: new Set<string>(),
};
const google = createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", async () => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/token") {
      try {
        const { payload } = await jwtVerify(
          new URLSearchParams(body).get("assertion") || "",
          publicKey,
          {
            issuer: serviceAccount.client_email,
            audience: googleBase + "/token",
          },
        );
        if (
          payload.scope !== "https://www.googleapis.com/auth/androidpublisher"
        )
          throw Error("scope");
        play.tokens++;
        return res.end(
          JSON.stringify({ access_token: "play-access", expires_in: 3600 }),
        );
      } catch {
        res.statusCode = 400;
        return res.end("{}");
      }
    }
    const [, productId, token, action] =
      req.url!.match(
        /^\/androidpublisher\/v3\/applications\/com\.bonhomie\.cuemaster\/purchases\/products\/([^/]+)\/tokens\/([^/:]+)(:\w+)?$/,
      ) || [];
    const purchase = token && play.purchases.get(decodeURIComponent(token));
    // Google binds a token to its product: asking about another product finds nothing.
    if (
      req.headers.authorization !== "Bearer play-access" ||
      !purchase ||
      purchase.productId !== productId
    ) {
      res.statusCode = 404;
      return res.end("{}");
    }
    if (action === ":acknowledge") play.acknowledged.add(token);
    if (action === ":consume") play.consumed.add(token);
    res.end(action ? "" : JSON.stringify(purchase));
  });
});
await new Promise<void>((r) => google.listen(0, "127.0.0.1", () => r()));
google.unref(); // never what keeps a failed run alive
const googleBase = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;

async function startApi(env: Record<string, string>) {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", () => r()));
  const port = (probe.address() as AddressInfo).port;
  await new Promise((r) => probe.close(r));
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let logs = "";
  child.stderr!.on("data", (d) => (logs = (logs + d).slice(-4000)));
  const base = `http://127.0.0.1:${port}`;
  running.push({ stop: () => child.kill() });
  for (let i = 0; i < 300 && child.exitCode === null; i++) {
    try {
      if ((await fetch(base + "/health")).ok) return base;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw Error("The billing API did not start: " + logs);
}
/** A fresh billing API per test, so each starts with its own claim rate limit, as suites do. */
const billingApi = () =>
  startApi({
    STORE_BILLING: "ios,android",
    APPLE_ROOT_CA_PEM: root.pem,
    // Base64, as it would be pasted into a hosting dashboard.
    GOOGLE_PLAY_SERVICE_ACCOUNT: Buffer.from(
      JSON.stringify(serviceAccount),
    ).toString("base64"),
    GOOGLE_OAUTH_TOKEN_URL: googleBase + "/token",
    GOOGLE_PLAY_API_URL: googleBase,
  });
const running: { stop: () => void }[] = [];
after(() => {
  running.forEach((api) => api.stop());
  google.close();
  rmSync(dir, { recursive: true, force: true });
});

async function guest(base: string) {
  const created = await (
    await fetch(base + "/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adultConfirmed: true }),
    })
  ).json();
  return (path: string, method = "GET", body?: unknown) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${created.token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (r) => ({
      status: r.status,
      body: r.status === 204 ? null : await r.json(),
    }));
}

test("catalog: unique ids, honest bonuses that rise with price, one starter pack", () => {
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length);
  for (const kind of ["rubies", "coins"] as const) {
    const packs = PRODUCTS.filter((p) => p.kind === kind).sort(
      (a, b) => a.usd - b.usd,
    );
    // The smallest pack sets the base rate per (rounded) dollar; each label must state the
    // real extra over that rate, and every step up must pay more per dollar.
    const rate = packs[0].grants[kind]! / Math.round(packs[0].usd);
    let previous = -1;
    for (const p of packs) {
      const bonus = Math.round(
        100 * (p.grants[kind]! / (Math.round(p.usd) * rate) - 1),
      );
      assert.equal(p.bonus ?? "", bonus ? `+${bonus}%` : "", `${p.id} label`);
      assert.ok(bonus > previous, `${p.id} pays more per dollar`);
      previous = bonus;
    }
  }
  // starterBought marks the one one-time offer; a second would need its own flag.
  assert.deepEqual(
    PRODUCTS.filter((p) => p.oneTime).map((p) => p.id),
    ["starter.pack"],
  );
  assert.ok(RUBY_PACKS.every((p) => p.kind === "rubies" && p.rubies > 0));
});

test("STORE_BILLING switches platforms on, and Android also needs the Play service account", () => {
  const { STORE_BILLING, GOOGLE_PLAY_SERVICE_ACCOUNT } = process.env;
  try {
    process.env.STORE_BILLING = " ios , android ";
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
    assert.equal(billingConfigured("ios"), true, "iOS is verified offline");
    assert.equal(billingConfigured("android"), false);
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT = "{}";
    assert.equal(billingConfigured("android"), true);
    process.env.STORE_BILLING = "android";
    assert.equal(billingConfigured("ios"), false);
    process.env.STORE_BILLING = "";
    assert.equal(billingConfigured(), false);
  } finally {
    process.env.STORE_BILLING = STORE_BILLING ?? "";
    if (GOOGLE_PLAY_SERVICE_ACCOUNT === undefined)
      delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
    else process.env.GOOGLE_PLAY_SERVICE_ACCOUNT = GOOGLE_PLAY_SERVICE_ACCOUNT;
  }
});

test("a platform that is not switched on refuses every claim with 503", async () => {
  const call = await guest(pinned);
  assert.deepEqual((await call("/store")).body.platforms, {
    ios: false,
    android: false,
  });
  for (const platform of ["ios", "android"])
    assert.equal(
      (
        await call("/store/claim", "POST", {
          platform,
          productId: "rubies.handful",
          transaction: "forged-transaction",
        })
      ).status,
      503,
    );
  assert.equal((await call("/me")).body.rubies, 0);
  await call("/me", "DELETE", { confirm: "DELETE" });
});

test("iOS: a signed StoreKit transaction credits once; forged, foreign or edited ones never do", async () => {
  const call = await guest(await billingApi());
  const store = (await call("/store")).body;
  assert.deepEqual(store.platforms, { ios: true, android: true });
  const account: string = store.accountToken;
  assert.match(
    account,
    /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "StoreKit keeps appAccountToken only when it is a UUID",
  );
  let transactionId = 2000000000;
  const fields = (extra: object = {}) => ({
    transactionId: String(++transactionId),
    bundleId: "com.bonhomie.cuemaster",
    productId: "rubies.pouch",
    type: "Consumable",
    quantity: 1,
    appAccountToken: account,
    environment: "Sandbox",
    purchaseDate: Date.now(),
    signedDate: Date.now(),
    ...extra,
  });
  const sign = (chain: Chain, payload: object) =>
    new CompactSign(Buffer.from(JSON.stringify(payload)))
      .setProtectedHeader({ alg: "ES256", x5c: chain.x5c })
      .sign(chain.key);
  const claim = (transaction: string, productId = "rubies.pouch") =>
    call("/store/claim", "POST", { platform: "ios", productId, transaction });

  const valid = await sign(chains.apple, fields());
  const first = await claim(valid);
  assert.equal(first.status, 200);
  assert.equal(first.body.credited, true);
  assert.deepEqual(first.body.grants, { rubies: 110 });
  assert.equal(first.body.player.rubies, 110);
  const replay = await claim(valid);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.credited, false, "a replay credits nothing");
  assert.equal(replay.body.player.rubies, 110);
  // The app can deliver one transaction twice at once: a launch recovery and its listener.
  const twice = await sign(chains.apple, fields());
  const both = await Promise.all([claim(twice), claim(twice)]);
  assert.deepEqual(both.map((r) => r.body.credited).sort(), [false, true]);
  assert.equal((await call("/me")).body.rubies, 220);

  // Each differs from a valid purchase in exactly one way.
  const [header, body, signature] = valid.split(".");
  const edited = [
    header,
    Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body, "base64url").toString()),
        productId: "rubies.hoard",
      }),
    ).toString("base64url"),
    signature,
  ].join(".");
  const refused: [string, string, string?][] = [
    [
      "another app",
      await sign(chains.apple, fields({ bundleId: "com.example.other" })),
    ],
    [
      "refunded",
      await sign(chains.apple, fields({ revocationDate: Date.now() })),
    ],
    ["payload edited after signing", edited, "rubies.hoard"],
    ["untrusted root", await sign(chains.untrusted, fields())],
    ["leaf without Apple's marker", await sign(chains.unmarked, fields())],
    [
      "another player's purchase",
      await sign(chains.apple, fields({ appAccountToken: randomUUID() })),
    ],
    [
      "claimed as a bigger pack",
      await sign(chains.apple, fields()),
      "rubies.hoard",
    ],
    [
      "not a consumable",
      await sign(chains.apple, fields({ type: "Non-Consumable" })),
    ],
    [
      "Xcode's local store",
      await sign(chains.apple, fields({ environment: "Xcode" })),
    ],
    [
      "signed after the certificate expired",
      await sign(
        chains.apple,
        fields({ signedDate: Date.now() + 60 * 86400000 }),
      ),
    ],
  ];
  for (const [why, transaction, productId] of refused)
    assert.equal((await claim(transaction, productId)).status, 402, why);
  assert.equal((await call("/me")).body.rubies, 220, "refusals credit nothing");

  // The starter pack is a one-time offer; the pass belongs to the season it is bought in.
  const offer = (id: string, products: any[]) =>
    products.find((p) => p.id === id);
  assert.equal(offer("starter.pack", store.products).available, true);
  assert.equal(offer("pass.premium", store.products).available, true);
  const starter = await claim(
    await sign(
      chains.apple,
      fields({ productId: "starter.pack", environment: "Production" }),
    ),
    "starter.pack",
  );
  assert.equal(starter.body.credited, true);
  assert.equal(starter.body.player.starterBought, true);
  assert.equal(starter.body.player.coins, 1000 + 5000);
  assert.equal(starter.body.player.rubies, 220 + 60);
  const pass = await claim(
    await sign(chains.apple, fields({ productId: "pass.premium" })),
    "pass.premium",
  );
  assert.equal(pass.body.credited, true);
  assert.equal(pass.body.player.passPremiumSeason, currentSeason().id);
  const after = (await call("/store")).body;
  assert.deepEqual(
    [
      offer("starter.pack", after.products),
      offer("pass.premium", after.products),
    ].map((p) => [p.owned, p.available]),
    [
      [true, false],
      [true, false],
    ],
  );
  assert.deepEqual(
    after.history.map((h: any) => `${h.productId} ${h.environment}`).sort(),
    [
      "pass.premium Sandbox",
      "rubies.pouch Sandbox",
      "rubies.pouch Sandbox",
      "starter.pack Production",
    ],
  );
  await call("/me", "DELETE", { confirm: "DELETE" });
});

test("iOS: breaking the piggy bank pays what it holds right then, once, and empties it", async () => {
  const call = await guest(await billingApi());
  const account = (await call("/store")).body.accountToken;
  let transactionId = 3000000000;
  const transaction = () =>
    new CompactSign(
      Buffer.from(
        JSON.stringify({
          transactionId: String(++transactionId),
          bundleId: "com.bonhomie.cuemaster",
          productId: "piggy.break",
          type: "Consumable",
          quantity: 1,
          appAccountToken: account,
          environment: "Sandbox",
          purchaseDate: Date.now(),
          signedDate: Date.now(),
        }),
      ),
    )
      .setProtectedHeader({ alg: "ES256", x5c: chains.apple.x5c })
      .sign(chains.apple.key);
  const claim = (t: string) =>
    call("/store/claim", "POST", {
      platform: "ios",
      productId: "piggy.break",
      transaction: t,
    });
  // Two lost computer matches put coins in the bank, the way a player fills it.
  for (let i = 0; i < 2; i++) {
    const started = await call("/local-matches/start", "POST", {
      venueId: "heritage",
      requestId: randomUUID(),
      mode: "cpu",
    });
    await call(`/local-matches/${started.body.match.id}/finish`, "POST", {
      outcome: "lost",
    });
  }
  const bank = (await call("/store")).body.piggy;
  assert.equal(bank.coins, 2 * bank.lost);

  const paid = await transaction();
  const first = await claim(paid);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.credited, true);
  assert.deepEqual(first.body.grants, { coins: bank.coins });
  assert.equal(first.body.player.coins, 1000 - 2 * 50 + bank.coins);
  assert.equal((await call("/store")).body.piggy.coins, 0);
  const replay = await claim(paid);
  assert.equal(replay.body.credited, false, "a replay breaks nothing twice");
  assert.deepEqual(replay.body.grants, { coins: bank.coins });
  assert.equal(replay.body.player.coins, first.body.player.coins);
  // A paid break is always credited, even when there is nothing left in the bank.
  const empty = await claim(await transaction());
  assert.equal(empty.body.credited, true);
  assert.deepEqual(empty.body.grants, { coins: 0 });
  assert.deepEqual(
    (await call("/store")).body.history.map((h: any) => h.productId),
    ["piggy.break", "piggy.break"],
  );
  await call("/me", "DELETE", { confirm: "DELETE" });
});

test("Android: a Play purchase credits once and is consumed; it must be paid and made by this player", async () => {
  const call = await guest(await billingApi());
  const account = (await call("/store")).body.accountToken;
  const buy = (token: string, extra: object = {}) =>
    play.purchases.set(token, {
      productId: "coins.stack",
      purchaseState: 0,
      consumptionState: 0,
      acknowledgementState: 0,
      orderId: `GPA.${token}`,
      obfuscatedExternalAccountId: account,
      quantity: 1,
      ...extra,
    });
  const claim = (token: string, productId = "coins.stack") =>
    call("/store/claim", "POST", {
      platform: "android",
      productId,
      transaction: token,
    });

  buy("paid-token-0001");
  const first = await claim("paid-token-0001");
  assert.equal(first.status, 200);
  assert.equal(first.body.credited, true);
  assert.equal(first.body.player.coins, 1000 + 11000);
  assert.ok(play.acknowledged.has("paid-token-0001"));
  assert.ok(play.consumed.has("paid-token-0001"), "consumed once credited");
  const replay = await claim("paid-token-0001");
  assert.equal(replay.body.credited, false, "a replay credits nothing");
  assert.equal(replay.body.player.coins, 1000 + 11000);

  buy("cancelled-token", { purchaseState: 1 });
  buy("pending-token", { purchaseState: 2 });
  buy("foreign-token", { obfuscatedExternalAccountId: randomUUID() });
  buy("small-token", { productId: "coins.pile" });
  for (const [why, token, productId] of [
    ["cancelled", "cancelled-token"],
    ["still pending", "pending-token"],
    ["made by another player", "foreign-token"],
    ["claimed as a bigger pack", "small-token", "coins.vault"],
    ["unknown to Google", "never-bought-token"],
  ])
    assert.equal((await claim(token, productId)).status, 402, why);

  // Licence testers' purchases carry no order id; each still credits exactly once.
  buy("tester-token-1", { orderId: undefined, purchaseType: 0 });
  buy("tester-token-2", { orderId: undefined, purchaseType: 0 });
  assert.equal((await claim("tester-token-1")).body.credited, true);
  assert.equal((await claim("tester-token-2")).body.credited, true);
  assert.equal((await claim("tester-token-1")).body.credited, false);
  assert.equal((await call("/me")).body.coins, 1000 + 3 * 11000);
  assert.equal(
    play.tokens,
    1,
    "the Play access token is reused until it expires",
  );
  await call("/me", "DELETE", { confirm: "DELETE" });
});
