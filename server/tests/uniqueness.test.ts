import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { World, drill } from "../../mobile/src/physics/engine";
import { planCpuShot } from "../../mobile/src/game/cpu";
import { Progress } from "../../mobile/src/game/progress";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
/** Let the planner solve a layout so the test does not hard-code shots that drift with physics. */
function solve(name: string, targets: number[]) {
  const w = new World(drill(name)),
    p = new Progress(),
    shots = [];
  for (let i = 0; i < 8; i++) {
    const left = targets.filter(
      (id) => !w.balls.find((b) => b.id === id)!.pocketed,
    );
    if (!left.length) break;
    const view = w.balls.map((b) =>
      b.id && b.id !== 8 && !left.includes(b.id) ? { ...b, pocketed: true } : b,
    );
    const shot = planCpuShot(view, p, 0.98, false, () => 0.5);
    w.strike(shot.angle, shot.power, shot.side, shot.top);
    shots.push(shot);
    let n = 0;
    while (w.active && n++ < 14400) {
      w.tick();
      w.events.length = 0;
    }
  }
  return shots;
}
test("daily shot, replay XP, leader ghosts and verified CPU wins", async () => {
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
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  token = (await call("/auth/guest", "POST", { adultConfirmed: true })).body
    .token;
  try {
    const catalog = (await call("/catalog")).body;
    assert.equal(catalog.cityChallenges.length, 12);
    const daily = (await call("/daily")).body;
    assert.match(daily.drill, /^daily:\d{4}-\d{2}-\d{2}$/);
    assert.equal(daily.leaderReplay, null);
    const shots = solve(daily.drill, [1]);
    const first = await call("/daily/submit", "POST", { shots });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.reward.xp, 50);
    const again = await call("/daily/submit", "POST", { shots });
    assert.equal(again.body.reward.xp, 0);
    const board = (await call("/daily")).body;
    assert.equal(board.played, true);
    assert.equal(board.leaderboard.length, 1);
    assert.equal(board.leaderboard[0].replay, undefined);
    assert.deepEqual(board.leaderReplay.shots, shots);
    // Practice re-clears pay bounded XP after the first clear.
    const pocket = { angle: -Math.PI / 2, power: 0.22, side: 0, top: 0 };
    const clear = async () => {
      const t = (
        await call("/practice/start", "POST", {
          challengeId: "pocket",
          tableId: "heritage",
        })
      ).body.ticket;
      return (
        await call("/practice/complete", "POST", { ticket: t, shots: [pocket] })
      ).body;
    };
    assert.equal((await clear()).reward.xp, 100);
    assert.equal((await clear()).reward.xp, 20);
    assert.equal((await clear()).reward.coins, 0);
    // City packs start from the same referee.
    const city = (
      await call("/practice/start", "POST", {
        challengeId: "lagos-1",
        tableId: "heritage",
      })
    ).body;
    assert.equal(city.challenge.city, "heritage");
    const cityShots = solve("lagos-1", [1]);
    const stamped = await call("/practice/complete", "POST", {
      ticket: city.ticket,
      shots: cityShots,
    });
    assert.equal(stamped.status, 200, JSON.stringify(stamped.body));
    assert.equal(stamped.body.reward.coins, 75);
    // CPU wins are only wins once replayed; a claimed win without a record seals nothing.
    const request = {
      venueId: "heritage",
      requestId: randomUUID(),
      mode: "cpu",
    };
    const match = (await call("/local-matches/start", "POST", request)).body
      .match;
    assert.equal(typeof match.seed, "number");
    assert.ok(match.opponent.style);
    const bare = await call(`/local-matches/${match.id}/finish`, "POST", {
      outcome: "won",
    });
    assert.equal(bare.status, 422);
    const forged = await call(`/local-matches/${match.id}/finish`, "POST", {
      outcome: "won",
      actions: [{ t: "break", choice: "accept" }],
    });
    assert.equal(forged.status, 422);
    const unfinished = await call(`/local-matches/${match.id}/finish`, "POST", {
      outcome: "won",
      actions: [{ t: "shot", angle: 0.007, power: 0.9, side: 0, top: 0 }],
    });
    assert.equal(unfinished.status, 200, JSON.stringify(unfinished.body));
    assert.equal(unfinished.body.verified, false);
    assert.equal(unfinished.body.crate, null);
    assert.equal(unfinished.body.match.status, "lost");
  } finally {
    await call("/me", "DELETE", { confirm: "DELETE" });
  }
});
