import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
test("venue fees are atomic, level gated, retry safe and forfeit is recorded once", async () => {
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
  try {
    const req = { venueId: "heritage", requestId: randomUUID() };
    assert.equal(
      (
        await call("/local-matches/start", "POST", {
          ...req,
          venueId: "champion",
        })
      ).status,
      403,
    );
    const entries = await Promise.all([
      call("/local-matches/start", "POST", req),
      call("/local-matches/start", "POST", req),
    ]);
    assert.ok(entries.some((r) => r.status === 201));
    assert.equal((await call("/me")).body.coins, 950);
    assert.equal(
      (await call("/local-matches/start", "POST", req)).body.player.coins,
      950,
    );
    assert.equal(
      (
        await call("/local-matches/start", "POST", {
          ...req,
          requestId: randomUUID(),
        })
      ).status,
      409,
    );
    const finish = () =>
      call(`/local-matches/${req.requestId}/finish`, "POST", {
        outcome: "forfeit",
      });
    await Promise.all([finish(), finish()]);
    const me = (await call("/me")).body;
    assert.equal(me.stats.localLosses, 1);
    assert.equal(me.coins, 950);
    assert.equal((await call("/local-matches/active")).body, null);
    // Exhaust a level-one wallet without allowing negative balances.
    for (let i = 0; i < 19; i++) {
      const r = { venueId: "heritage", requestId: randomUUID() };
      assert.equal((await call("/local-matches/start", "POST", r)).status, 201);
      await call(`/local-matches/${r.requestId}/finish`, "POST", {
        outcome: "lost",
      });
    }
    assert.equal(
      (
        await call("/local-matches/start", "POST", {
          venueId: "heritage",
          requestId: randomUUID(),
        })
      ).status,
      409,
    );
    assert.equal((await call("/me")).body.coins, 0);
  } finally {
    await call("/me", "DELETE", { confirm: "DELETE" });
  }
});
