import { test } from "node:test";
import assert from "node:assert/strict";
import { aimGuide } from "../mobile/src/render/aimGuide";
import { H, W, R, rack } from "../mobile/src/physics/engine";

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
