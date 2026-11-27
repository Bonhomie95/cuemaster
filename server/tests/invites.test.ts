import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { winVerifiedRack } from "./playCpu";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";

const client = async () => {
  const r = await fetch(base + "/auth/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adultConfirmed: true }),
  });
  const { token } = await r.json();
  return async (path: string, method = "GET", body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    };
  };
};

test("an invite pays both players once, after the newcomer wins three refereed matches", async () => {
  const [host, guest] = [await client(), await client()];
  const mine = (await host("/me/invite")).body;
  assert.match(mine.code, /^[A-Z2-9]{6}$/);
  assert.equal((await host("/me/invite")).body.code, mine.code, "stable code");
  assert.equal(
    (await host("/me/invite/redeem", "POST", { code: mine.code })).status,
    404,
    "nobody redeems their own code",
  );
  assert.equal(
    (await guest("/me/invite/redeem", "POST", { code: "ZZZZZ2" })).status,
    404,
  );
  const redeemed = await guest("/me/invite/redeem", "POST", {
    code: mine.code.toLowerCase(),
  });
  assert.equal(redeemed.status, 200);
  assert.equal(
    (await guest("/me/invite/redeem", "POST", { code: mine.code })).status,
    409,
    "one code per player",
  );
  const before = (await host("/me")).body;
  // Nothing is paid until three refereed wins; a quit or a claimed loss never counts.
  assert.equal((await guest("/me")).body.rubies, 0);
  const quit = await guest("/local-matches/start", "POST", {
    venueId: "heritage",
    requestId: randomUUID(),
    mode: "cpu",
  });
  assert.equal(quit.status, 201);
  await guest(`/local-matches/${quit.body.match.id}/finish`, "POST", {
    outcome: "forfeit",
  });
  for (let i = 0; i < 3; i++) {
    const lost = await guest("/local-matches/start", "POST", {
      venueId: "heritage",
      requestId: randomUUID(),
      mode: "cpu",
    });
    await guest(`/local-matches/${lost.body.match.id}/finish`, "POST", {
      outcome: "lost",
    });
  }
  assert.equal((await host("/me")).body.rubies, before.rubies);
  let finished = 0;
  while (finished < 3) {
    assert.equal((await host("/me")).body.rubies, before.rubies);
    const r = await winVerifiedRack(guest);
    assert.ok(r.body.verified);
    finished = (await guest("/me")).body.stats.refereedWins;
  }
  const after = (await host("/me")).body;
  assert.equal(after.rubies, before.rubies + 10);
  assert.equal(after.coins, before.coins + 500);
  assert.equal((await host("/me/invite")).body.friends, 1);
  const newcomer = (await guest("/me")).body;
  assert.equal(newcomer.rubies >= 10, true);
  // A fourth match pays nothing more.
  await winVerifiedRack(guest);
  assert.equal((await host("/me")).body.rubies, after.rubies);
});
