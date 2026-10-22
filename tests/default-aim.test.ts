import { test } from "node:test";
import assert from "node:assert/strict";
import { Session } from "../mobile/src/game/session";
test("a human turn starts aimed at the nearest ball the rules allow", () => {
  const s = new Session();
  s.matchRules = true;
  s.now = () => 0;
  s.reset("break");
  assert.equal(s.angle, 0, "the break keeps its rack aim");
  s.angle = 0.007;
  s.power = 0.9;
  s.shoot();
  let n = 0;
  while (s.running && n++ < 20000) s.update(0.1);
  if (s.progress.breakChoice) s.resolveBreak("accept");
  if (s.placement) {
    s.placeCue(-0.6, 0);
  }
  const cue = s.world.balls.find((b) => b.id === 0)!;
  const rack = s.world.balls.map((b) => b.id);
  const legal = s.world.balls.filter(
    (b) => b.id && !b.pocketed && !s.progress.targetWarning(b.id, false, rack),
  );
  const nearest = legal.reduce((a, b) =>
    Math.hypot(a.x - cue.x, a.z - cue.z) <= Math.hypot(b.x - cue.x, b.z - cue.z)
      ? a
      : b,
  );
  assert.equal(
    s.angle,
    Math.atan2(nearest.z - cue.z, nearest.x - cue.x),
    "aim follows the nearest legal ball",
  );
});
