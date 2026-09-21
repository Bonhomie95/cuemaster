import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
test("MongoDB account, locks, rewards, event scores and account lifecycle", async () => {
  let token = "";
  const call = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  assert.equal((await call("/health")).body.database, "mongodb");
  assert.equal((await call("/me")).status, 401);
  assert.equal(
    (await call("/auth/guest", "POST", { adultConfirmed: false })).status,
    400,
  );
  const created = await call("/auth/guest", "POST", { adultConfirmed: true });
  assert.equal(created.status, 201);
  token = created.body.token;
  try {
    assert.equal(
      (await call("/me/table", "POST", { tableId: "champion" })).status,
      403,
    );
    assert.equal(
      (
        await call("/practice/start", "POST", {
          tableId: "champion",
          challengeId: "pocket",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/me", "PATCH", {
          name: "Tester",
          country: "NG",
          avatar: 1,
          xp: 900,
        })
      ).status,
      400,
    );
    const edited = await call("/me", "PATCH", {
      name: "Integration Tester",
      country: "NG",
      avatar: 1,
    });
    assert.equal(edited.body.country, "NG");
    const gift = await call("/me/daily", "POST");
    assert.equal(gift.body.claimed, true);
    assert.equal((await call("/me/daily", "POST")).body.claimed, false);
    const start = await call("/practice/start", "POST", {
      tableId: "heritage",
      challengeId: "pocket",
    });
    assert.equal(start.status, 201);
    const invalid = await call("/practice/complete", "POST", {
      ticket: start.body.ticket,
      shots: [{ angle: 0, power: 0.1, side: 0, top: 0 }],
    });
    assert.equal(invalid.status, 422);
    const body = {
      ticket: start.body.ticket,
      shots: [{ angle: -Math.PI / 2, power: 0.22, side: 0, top: 0 }],
    };
    const result = await call("/practice/complete", "POST", body);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.player.level, 2);
    assert.equal(result.body.reward.xp, 100);
    const duplicate = await call("/practice/complete", "POST", body);
    assert.equal(duplicate.body.reward.xp, 0);
    assert.equal(duplicate.body.player.xp, 100);
    assert.equal(
      (await call("/me/table", "POST", { tableId: "riviera" })).body
        .selectedTable,
      "riviera",
    );
    assert.equal(
      (
        await call("/tournaments/masters-usdc/enter", "POST", {
          acceptRules: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("/tournaments/precision-preseason/enter", "POST", {
          acceptRules: false,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/tournaments/precision-preseason/enter", "POST", {
          acceptRules: true,
        })
      ).status,
      200,
    );
    const score = await call(
      "/tournaments/precision-preseason/submit",
      "POST",
      { shots: body.shots },
    );
    assert.equal(score.status, 200, JSON.stringify(score.body));
    assert.equal(score.body.reward.coins, 150);
    const score2 = await call(
      "/tournaments/precision-preseason/submit",
      "POST",
      { shots: body.shots },
    );
    assert.equal(score2.body.reward.coins, 0);
    const details = await call("/tournaments/precision-preseason");
    assert.ok(
      details.body.leaderboard.some(
        (r: any) => r.name === "Integration Tester",
      ),
    );
    assert.equal((await call("/me")).body.xp, 100);
  } finally {
    assert.equal(
      (await call("/me", "DELETE", { confirm: "DELETE" })).status,
      204,
    );
  }
  assert.equal((await call("/me")).status, 401);
});
