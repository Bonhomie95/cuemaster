import { test } from "node:test";
import assert from "node:assert/strict";
import { Session } from "../mobile/src/game/session";
function play(rate: number, skin = 0) {
  const s = new Session();
  s.skin = skin;
  s.power = 0.82;
  s.angle = 0.007;
  s.side = 0.1;
  s.top = 0.3;
  s.shoot();
  for (let n = 0; s.running && n < rate * 50; n++) s.update(1 / rate);
  assert.equal(s.running, false);
  return s;
}
test("render rates 30/60/120 give identical final physics state", () => {
  assert.deepEqual(play(30).world.balls, play(60).world.balls);
  assert.deepEqual(play(60).world.balls, play(120).world.balls);
});
test("material skins never alter simulation", () => {
  assert.deepEqual(play(60, 0).world.balls, play(60, 2).world.balls);
});
test("repeat restores the exact pre-shot state and input", () => {
  const s = play(60),
    end = s.world.balls.map((b) => ({ ...b }));
  s.repeat();
  while (s.running) s.update(1 / 60);
  assert.deepEqual(s.world.balls, end);
});
test("suspension gaps do not launch unbounded catch-up work", () => {
  const s = new Session();
  s.power = 0.8;
  s.shoot();
  s.update(30);
  assert.equal(s.world.time, 0);
  s.update(1 / 60);
  assert.ok(s.world.time > 0);
});
