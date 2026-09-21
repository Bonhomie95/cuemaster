import { test } from "node:test";
import assert from "node:assert/strict";
import { Session } from "../mobile/src/game/session";
import { H, W, R } from "../mobile/src/physics/engine";

test("break placement follows a drag, accepts the line, and commits only on release", () => {
  const s = new Session();
  s.reset("break");
  s.placement = s.headStringPlacement = true;
  for (const [x,z] of [[-H+.15,-W+.15],[-H+.15,W-.15],[-H/2,0.35]]) {
    assert.equal(s.placeCue(x,z,false),true);
    assert.equal(s.placement,true);
    assert.equal(s.headStringPlacement,true);
    assert.equal(s.world.balls[0].x,x);
    assert.equal(s.world.balls[0].z,z);
  }
  assert.equal(s.placeCue(-H/2+.01,0,false),false);
  assert.equal(s.world.balls[0].z,.35);
  assert.equal(s.placeCue(-H/2,.35),true);
  assert.equal(s.placement,false);
  assert.equal(s.headStringPlacement,false);
});
test("placement still rejects cushions, occupied positions and nonfinite inputs", () => {
  const s = new Session();
  s.reset("break");
  s.placement = true;
  assert.equal(s.placeCue(-H+R/2,0,false),false);
  assert.equal(s.placeCue(H/2,0,false),false);
  assert.equal(s.placeCue(NaN,0,false),false);
  assert.equal(s.placement,true);
});
