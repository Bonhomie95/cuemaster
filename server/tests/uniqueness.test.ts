import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { World, drill } from "../../mobile/src/physics/engine";
import { planCpuShot } from "../../mobile/src/game/cpu";
import { Progress } from "../../mobile/src/game/progress";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
/** Run `shots` on a fresh layout and return the settled table. */
function run(
  name: string,
  shots: { angle: number; power: number; side: number; top: number }[],
) {
  const w = new World(drill(name));
  for (const s of shots) {
    w.strike(s.angle, s.power, s.side, s.top);
    let n = 0;
    while (w.active && n++ < 14400) {
      w.tick();
      w.events.length = 0;
    }
  }
  return w;
}
/**
 * Let the planner solve a layout so the test does not hard-code shots that drift with physics.
 * The referee ends a challenge on a scratch and the daily layout changes with the date, so
 * around the planner's idea we try spins, powers and small aim changes, and keep the first
 * shot that leaves the cue ball on the table (preferring one that also pots a target). Spin
 * stays inside the unit circle the referee enforces.
 */
function solve(name: string, targets: number[]) {
  type Shot = { angle: number; power: number; side: number; top: number };
  const p = new Progress(),
    shots: Shot[] = [];
  for (let i = 0; i < 8; i++) {
    const w = run(name, shots);
    const left = targets.filter(
      (id) => !w.balls.find((b) => b.id === id)!.pocketed,
    );
    if (!left.length) break;
    const view = w.balls.map((b) =>
      b.id && b.id !== 8 && !left.includes(b.id) ? { ...b, pocketed: true } : b,
    );
    const plan = planCpuShot(view, p, 0.98, false, () => 0.5);
    const ideas: Shot[] = [];
    for (const top of [0, -0.6, 0.6, -0.8])
      for (const side of [0, 0.5, -0.5])
        for (const scale of [1, 0.75, 0.55, 1.3])
          for (const da of [0, 0.012, -0.012, 0.03, -0.03])
            ideas.push({
              angle: plan.angle + da,
              power: Math.min(1, plan.power * scale),
              side,
              top,
            });
    let safe: Shot | undefined;
    const pots = ideas.find((shot) => {
      const after = run(name, [...shots, shot]);
      if (after.balls.find((b) => b.id === 0)!.pocketed) return false;
      safe ??= shot;
      return left.some((id) => after.balls.find((b) => b.id === id)!.pocketed);
    });
    shots.push(pots ?? safe ?? ideas[0]);
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
    assert.equal(catalog.cityChallenges.length, 2 * catalog.venues.length);
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
