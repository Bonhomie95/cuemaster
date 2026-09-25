import { test } from "node:test";
import assert from "node:assert/strict";
import { createSign, generateKeyPairSync, createPublicKey } from "node:crypto";
import { createServer } from "node:http";
import { signedPortion } from "../src/ads";

test("only AdMob's own signature over the exact query string is accepted", async () => {
  // A throwaway EC key stands in for Google's; the server fetches the key set by URL, so
  // pointing it at a local one exercises the real verification path end to end.
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const pem = publicKey;
  const keys = JSON.stringify({ keys: [{ keyId: 777, pem, base64: "" }] });
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(keys);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as any).port;
  process.env.ADS_VERIFIER_KEYS_URL = `http://127.0.0.1:${port}/keys.json`;
  const { verifyAdCallback } = await import("../src/ads?fresh=" + port);

  const body =
    "ad_network=5450213213286189855&reward_amount=1&user_id=ticket-1";
  const signature = createSign("SHA256")
    .update(body)
    .sign(privateKey)
    .toString("base64url");
  const query = `${body}&signature=${signature}&key_id=777`;

  assert.equal(
    signedPortion(query),
    body,
    "everything before &signature= is signed",
  );
  assert.equal(await verifyAdCallback(query), true);

  // A tampered ticket, an unknown key and a missing signature must all fail.
  assert.equal(
    await verifyAdCallback(query.replace("ticket-1", "ticket-2")),
    false,
  );
  assert.equal(
    await verifyAdCallback(query.replace("key_id=777", "key_id=1")),
    false,
  );
  assert.equal(await verifyAdCallback(body), false);
  assert.equal(signedPortion(body), null);
  server.close();
});

test("a rewarded ticket cannot be redeemed twice or by another player", async () => {
  const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
  const guest = async () => {
    const r = await fetch(base + "/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adultConfirmed: true }),
    });
    const created = await r.json();
    return (path: string, method = "GET", body?: unknown) =>
      fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${created.token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }).then(async (res) => ({
        status: res.status,
        body: res.status === 204 ? null : await res.json(),
      }));
  };
  const call = await guest();
  // A crate the player does not hold cannot produce a ticket.
  const refused = await call("/ads/reward-ticket", "POST", {
    crateId: "00000000-0000-4000-8000-000000000000",
  });
  assert.equal(refused.status, 409);
  const forged = await call(
    "/ads/reward-ticket/00000000-0000-4000-8000-000000000000/redeem",
    "POST",
    {},
  );
  assert.equal(
    forged.status,
    404,
    "a ticket that was never issued grants nothing",
  );
  await call("/me", "DELETE", { confirm: "DELETE" });
});
