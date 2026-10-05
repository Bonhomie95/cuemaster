import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { playCpuMatch } from "./playCpu";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
test("CPU entries preserve rivals on retry and update separate adaptive records exactly once", async () => {
  let token = "";
  const call = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = r.status === 204 ? null : await r.json();
    assert.ok(r.ok, JSON.stringify(result));
    return result;
  };
  token = (await call("/auth/guest", "POST", { adultConfirmed: true })).token;
  try {
    const request = {
      venueId: "heritage",
      requestId: randomUUID(),
      mode: "cpu",
    };
    const first = await call("/local-matches/start", "POST", request);
    assert.equal(first.match.opponent.kind, "cpu");
    const skill = first.match.opponent.skill;
    const retry = await call("/local-matches/start", "POST", request);
    assert.deepEqual(retry.match.opponent, first.match.opponent);
    assert.equal(retry.player.coins, 950);
    await Promise.all(
      [1, 2].map(() =>
        call(`/local-matches/${request.requestId}/finish`, "POST", {
          outcome: "lost",
        }),
      ),
    );
    let p = await call("/me");
    assert.equal(p.stats.cpuLosses, 1);
    assert.equal(p.stats.cpuStreak, -1);
    assert.equal(p.stats.localLosses, undefined);
    // A win only counts once the referee replays the record against the same rival seed.
    let won = false,
      spent = 50;
    for (let i = 0; i < 6 && !won; i++) {
      const second = await call("/local-matches/start", "POST", {
        ...request,
        requestId: randomUUID(),
      });
      spent += 50;
      assert.ok(second.match.opponent.skill < skill);
      const played = playCpuMatch(second.match.opponent, second.match.seed);
      const result = await call(
        `/local-matches/${second.match.id}/finish`,
        "POST",
        {
          outcome: played.winner === 0 ? "won" : "lost",
          actions: played.actions,
        },
      );
      won = result.verified;
      if (played.winner === 0) assert.ok(won, "a played-out win verifies");
    }
    assert.ok(won, "the planner beat the rival within six racks");
    p = await call("/me");
    assert.equal(p.stats.cpuStreak, 1);
    assert.equal(p.stats.bestStreak, 1);
    assert.equal(p.stats.cpuWins, 1);
    const board = await call("/leaderboard");
    assert.ok(board.players.some((r: any) => r.bestStreak === 1));
    assert.equal(p.coins, 1000 - spent);
  } finally {
    await call("/me", "DELETE", { confirm: "DELETE" });
  }
});
