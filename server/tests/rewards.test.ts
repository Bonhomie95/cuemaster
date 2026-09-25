import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CRATES,
  SLOTS,
  crateOdds,
  rollContents,
  rubyCost,
  publicCrate,
} from "../src/rewards";
import { RUBY_PACKS } from "../src/store";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";

test("crate odds are internally consistent and contents stay inside their band", () => {
  const odds = crateOdds();
  assert.equal(odds.length, CRATES.length);
  // A tier that can never drop, or a set that does not total 100%, is a misconfigured table.
  assert.ok(
    Math.abs(odds.reduce((sum, o) => sum + o.chance, 0) - 100) < 0.05,
    "crate chances must total 100%",
  );
  for (const crate of CRATES) {
    const shown = odds.find((o) => o.tier === crate.tier)!;
    assert.equal(shown.coins.min, crate.coins[0]);
    assert.equal(shown.coins.max, crate.coins[1]);
    assert.equal(shown.hours, crate.hours);
    for (let i = 0; i < 400; i++) {
      const { coins, rubies } = rollContents(crate.tier);
      assert.ok(coins >= crate.coins[0] && coins <= crate.coins[1]);
      assert.ok(
        rubies === 0 ||
          (rubies >= crate.rubies[0] && rubies <= crate.rubies[1]),
      );
    }
  }
  // Coins are the reward; rubies stay scarce enough that buying them still means something.
  const richest = CRATES[CRATES.length - 1];
  assert.ok(
    richest.rubies[1] <= 6,
    "no crate should hand out a pack's worth of rubies",
  );
  assert.ok(RUBY_PACKS[0].rubies > richest.rubies[1]);
});

test("ruby cost falls as a crate unlocks and is zero once it is ready", () => {
  const now = Date.now();
  const crate = {
    id: "c",
    tier: "gold",
    earnedAt: new Date(now),
    unlockAt: new Date(now + 12 * 3600000),
  };
  const full = rubyCost(crate, now);
  assert.equal(full, 24, "12 hours at one ruby per half hour");
  assert.ok(rubyCost(crate, now + 6 * 3600000) < full);
  assert.equal(rubyCost(crate, now + 12 * 3600000), 0);
  assert.equal(publicCrate(crate, now + 12 * 3600000).ready, true);
  // A video takes a whole hour off, which the ready time must reflect.
  const sped = { ...crate, hoursOff: 2 };
  assert.equal(
    publicCrate(sped, now + 10 * 3600000).ready,
    true,
    "two hours off makes a 12 hour crate ready after ten",
  );
});

test("crates are earned by winning, bounded by slots, and paid out exactly once", async () => {
  let token = "";
  const call = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  token = (await call("/auth/guest", "POST", { adultConfirmed: true })).body
    .token;
  const win = async () => {
    const requestId = randomUUID();
    const started = await call("/local-matches/start", "POST", {
      venueId: "heritage",
      requestId,
      mode: "cpu",
    });
    assert.equal(started.status, 201);
    return call(`/local-matches/${requestId}/finish`, "POST", {
      outcome: "won",
    });
  };

  assert.equal((await call("/me/crates")).body.crates.length, 0);
  const first = await win();
  assert.ok(first.body.crate, "a win seals a crate");
  // Losing earns nothing.
  const requestId = randomUUID();
  await call("/local-matches/start", "POST", {
    venueId: "heritage",
    requestId,
    mode: "cpu",
  });
  const lost = await call(`/local-matches/${requestId}/finish`, "POST", {
    outcome: "lost",
  });
  assert.equal(lost.body.crate, null);

  for (let i = 0; i < SLOTS + 2; i++) await win();
  const held = (await call("/me/crates")).body;
  assert.equal(held.crates.length, SLOTS, "slots cap what can be held");
  assert.equal(held.rubies, 0);

  // Only one crate unlocks at a time.
  const [a, b] = held.crates;
  assert.equal((await call(`/me/crates/${a.id}/start`, "POST")).status, 200);
  assert.equal((await call(`/me/crates/${b.id}/start`, "POST")).status, 409);
  assert.equal((await call(`/me/crates/${a.id}/start`, "POST")).status, 409);

  // It is not ready, and the player has no rubies, so it cannot be opened either way.
  assert.equal((await call(`/me/crates/${a.id}/open`, "POST")).status, 409);
  assert.equal(
    (await call(`/me/crates/${a.id}/open`, "POST", { spendRubies: true }))
      .status,
    409,
  );
  // A rewarded-video ticket takes an hour off, exactly once, and only for a started crate.
  const idle = held.crates[2];
  assert.equal(
    (await call("/ads/reward-ticket", "POST", { crateId: idle.id })).status,
    409,
    "a crate that is not unlocking cannot be sped up",
  );
  const issued = await call("/ads/reward-ticket", "POST", { crateId: a.id });
  assert.equal(issued.status, 201);
  assert.equal(
    (await call(`/ads/reward-ticket/${issued.body.ticket}/redeem`, "POST", {}))
      .status,
    200,
  );
  assert.equal(
    (await call(`/ads/reward-ticket/${issued.body.ticket}/redeem`, "POST", {}))
      .status,
    409,
    "a ticket cannot pay out twice",
  );
  const sped = (await call("/me/crates")).body.crates.find(
    (c: any) => c.id === a.id,
  );
  assert.equal(sped.hoursOff, 1);
  assert.equal((await call("/me/crates")).body.videosLeft, 5);
  assert.equal((await call("/me")).body.crates, SLOTS);
  assert.equal((await call("/store/rubies")).body.available, false);
  assert.equal(
    (
      await call("/store/rubies/claim", "POST", {
        platform: "ios",
        transactionId: "forged-receipt-0001",
      })
    ).status,
    503,
    "an unconfigured store must never credit rubies",
  );
  assert.equal((await call("/me")).body.rubies, 0);
  await call("/me", "DELETE", { confirm: "DELETE" });
});
