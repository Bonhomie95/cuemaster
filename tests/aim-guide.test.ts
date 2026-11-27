import { test } from "node:test";
import assert from "node:assert/strict";
import { aimGuide } from "../mobile/src/render/aimGuide";
import { H, W, R, rack, World, ball } from "../mobile/src/physics/engine";
import { Session } from "../mobile/src/game/session";

test("both renderers stop their aim guide at the closest ball, ignoring pocketed balls", () => {
  const balls = rack(1).slice(0, 3);
  Object.assign(balls[0], { x: 0, z: 0 });
  Object.assign(balls[1], { x: 0.5, z: 0 });
  Object.assign(balls[2], { x: 0.3, z: 0 });
  assert.equal(aimGuide(balls, 0).hit?.id, balls[2].id);
  assert.ok(Math.abs(aimGuide(balls, 0).distance - (0.3 - 2 * R)) < 1e-10);
  balls[2].pocketed = true;
  assert.equal(aimGuide(balls, 0).hit?.id, balls[1].id);
});
test("aim guide ends at a cushion and never points behind the cue ball", () => {
  const balls = rack(1).slice(0, 1);
  Object.assign(balls[0], { x: 0, z: 0 });
  assert.equal(aimGuide(balls, 0).distance, H - R);
  assert.ok(Math.abs(aimGuide(balls, Math.PI / 2).distance - (W - R)) < 1e-10);
  assert.equal(aimGuide(balls, Math.PI).distance, H - R);
  balls[0].pocketed = true;
  assert.equal(aimGuide(balls, 0).distance, 0);
});

test("the default aim skips a legal ball that an opponent's ball blocks", () => {
  const s = new Session();
  s.reset("open");
  s.matchRules = true;
  // Stripes to shoot. The nearest stripe (10) sits straight behind a solid (2); the 12 is clear.
  s.world = new World([
    ball(0, 0, 0),
    ball(2, 0.2, 0),
    ball(10, 0.4, 0),
    ball(12, 0, 0.6),
  ]);
  s.shots = 3;
  s.progress.groups = ["stripes", "solids"];
  s.progress.turn = 0;
  s.aimAtTarget();
  assert.ok(Math.abs(s.angle - Math.PI / 2) < 1e-9, `aimed at ${s.angle}`);
  // With every legal ball blocked it still falls back to the nearest one.
  s.world = new World([ball(0, 0, 0), ball(2, 0.2, 0), ball(10, 0.4, 0)]);
  s.aimAtTarget();
  assert.ok(Math.abs(s.angle) < 1e-9);
});
test("a rack that ends on the 8 says why, from the phone's own side", async () => {
  const { eightBallNote } = await import("../mobile/src/game/localMatch");
  const { Progress } = await import("../mobile/src/game/progress");
  const p = new Progress();
  p.finished = true;
  p.returned = [1, 2, 3, 4, 5, 6, 7, 8];
  p.groupClearBeforeShot = true;
  p.turn = 0;
  assert.equal(eightBallNote(p, "Ada"), "You sank the 8.");
  p.turn = 1;
  assert.equal(eightBallNote(p, "Ada"), "Ada sank the 8.");
  p.groupClearBeforeShot = false;
  assert.equal(eightBallNote(p, "Ada"), "Ada potted the 8 too early.");
  p.scratch = true;
  p.turn = 0;
  assert.equal(eightBallNote(p, "Ada"), "You scratched on the 8.");
  p.scratch = false;
  p.foul = "Wrong ball contacted first";
  assert.equal(eightBallNote(p, "Ada"), "You fouled on the 8.");
  p.returned = [1];
  assert.equal(eightBallNote(p, "Ada"), "");
});
