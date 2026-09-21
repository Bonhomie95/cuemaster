import { test } from "node:test";
import assert from "node:assert/strict";
import { Session } from "../mobile/src/game/session";
import { cueElevation } from "../mobile/src/render/cuePose";
import { R, H, W } from "../mobile/src/physics/engine";
test("cue elevation clears rail near side and corner with low spin", () => {
  for (const [x, z, a] of [
    [H - R, 0, Math.PI],
    [-H + R, 0, 0],
    [0, W - R, -Math.PI / 2],
    [H - R, W - R, (-Math.PI * 3) / 4],
  ]) {
    const h = R * 0.5;
    const pitch = cueElevation(x, z, a, h);
    assert.ok(pitch > 0 && pitch < Math.PI / 2);
    const dx = -Math.cos(a),
      dz = -Math.sin(a);
    const d =
      Math.min(
        dx > 0 ? (H - x) / dx : dx < 0 ? (-H - x) / dx : Infinity,
        dz > 0 ? (W - z) / dz : dz < 0 ? (-W - z) / dz : Infinity,
      ) -
      R -
      0.018;
    assert.ok(h + Math.max(0.008, d) * Math.tan(pitch) >= 0.095 - 1e-8);
  }
});
test("cue clock uses per-player stats and timeout grants hand without firing", () => {
  const s = new Session();
  s.matchRules = true;
  s.cueIds = ["master", "club"];
  s.reset();
  s.updateClock(1000);
  assert.equal(s.secondsLeft, 45);
  s.updateClock(45000);
  assert.equal(s.secondsLeft, 1);
  s.power = 1;
  s.updateClock(46000);
  assert.equal(s.progress.turn, 1);
  assert.equal(s.placement, true);
  assert.equal(s.headStringPlacement, true);
  assert.equal(s.power, 0);
  assert.equal(s.secondsLeft, 25);
  assert.equal(s.running, false);
});
test("shot clock pauses while balls move and break decisions wait; practice is untimed", () => {
  const s = new Session();
  s.matchRules = true;
  s.reset();
  s.updateClock(1000);
  s.running = true;
  s.updateClock(50000);
  assert.equal(s.progress.turn, 0);
  assert.equal(s.turnDeadline, 0);
  s.running = false;
  s.progress.breakChoice = "eight";
  s.updateClock(90000);
  assert.equal(s.progress.turn, 0);
  s.progress.breakChoice = null;
  s.updateClock(100000);
  assert.equal(s.secondsLeft, 25);
  const free = new Session();
  free.updateClock(1000);
  free.updateClock(999999);
  assert.equal(free.progress.turn, 0);
});
