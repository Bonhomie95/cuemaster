import { test } from "node:test";
import assert from "node:assert/strict";
import { clockUrgent } from "../mobile/src/game/shotClock";
import { Session } from "../mobile/src/game/session";
test("countdown starts at the final third of each cue and silences stopped clocks", () => {
  for (const [total, first] of [
    [25, 8],
    [35, 11],
    [45, 15],
  ]) {
    assert.equal(clockUrgent(first + 1, total, true), false);
    assert.equal(clockUrgent(first, total, true), true);
    assert.equal(clockUrgent(1, total, true), true);
    assert.equal(clockUrgent(0, total, true), false);
    assert.equal(clockUrgent(first, total, false), false);
  }
});
test("ordinary post-break timeout allows placement beyond the permanent head string", () => {
  const s = new Session();
  s.matchRules = true;
  s.reset();
  s.shots = 1;
  s.updateClock(1000);
  s.updateClock(27000);
  assert.equal(s.placement, true);
  assert.equal(s.headStringPlacement, false);
  assert.equal(s.placeCue(0, 0.3), true);
});
