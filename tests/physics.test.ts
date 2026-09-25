import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World,
  ball,
  rack,
  simulate,
  cloth,
  kinetic,
  P,
  R,
  H,
  W,
  drill,
  throwFriction,
} from "../mobile/src/physics/engine";
const near = (a: number, b: number, e = 1e-6) =>
  assert.ok(Math.abs(a - b) < e, `${a} differs from ${b} (tol ${e})`);
test("rack has 16 distinct legal balls, 8 in centre, opposite corner groups", () => {
  const bs = rack();
  assert.equal(new Set(bs.map((b) => b.id)).size, 16);
  near(bs.find((b) => b.id === 8)!.z, 0, 0.0003);
  const rear = bs.filter(b=>b.x>Math.max(...bs.map(b=>b.x))-R).sort((a,b)=>a.z-b.z);
  assert.notEqual(rear[0].id<8,rear[rear.length-1].id<8);
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++)
      assert.ok(Math.hypot(bs[i].x - bs[j].x, bs[i].z - bs[j].z) >= 2 * R);
});
test("stationary balls remain stationary indefinitely", () => {
  const w = new World([ball(0, 0, 0)]);
  for (let i = 0; i < 2400; i++) w.tick();
  near(w.balls[0].x, 0);
  near(kinetic(w.balls[0]), 0);
});
test("rolling stop distance matches v²/2μg and exact stop time", () => {
  const b = ball(0, 0, 0);
  b.vx = 0.5;
  b.wz = -0.5 / R;
  cloth(b, 10);
  near(b.x, 0.25 / (2 * P.roll * P.g));
  near(b.vx, 0);
  near(b.wz, 0);
});
test("centre strike becomes natural roll at exactly 5/7 initial speed", () => {
  const b = ball(0, 0, 0);
  b.vx = 1;
  cloth(b, 1 / (3.5 * P.slide * P.g));
  near(b.vx, 5 / 7);
  near(b.vx + R * b.wz, 0);
});
test("cloth integration is independent of partitioning", () => {
  const a = ball(0, 0, 0);
  a.vx = 1.3;
  a.vz = 0.2;
  a.wy = 10;
  a.wx = 3;
  a.wz = 4;
  const b = { ...a };
  cloth(a, 2);
  for (let i = 0; i < 480; i++) cloth(b, 1 / 240);
  for (const k of ["x", "z", "vx", "vz", "wx", "wy", "wz"] as const)
    near(a[k], b[k], 1e-8);
});
test("head-on collision conserves linear momentum and loses energy", () => {
  const a = ball(0, 0, 0),
    b = ball(1, 2 * R - 0.00001, 0);
  a.vx = 2;
  const w = new World([a, b]);
  w.collide(w.balls[0], w.balls[1]);
  near(w.balls[0].vx + w.balls[1].vx, 2);
  assert.ok(w.balls[1].vx > 1.9);
  assert.ok(w.balls.reduce((v, b) => v + kinetic(b), 0) <= kinetic(a));
});
test("oblique spinning contact never adds kinetic energy", () => {
  for (let n = 0; n < 100; n++) {
    const a = ball(0, 0, 0),
      b = ball(1, R * 1.4, R * 1.4);
    a.vx = n * 0.05 + 0.1;
    a.vz = 0.3;
    a.wy = n - 50;
    b.wy = 10;
    const energy = kinetic(a) + kinetic(b),
      w = new World([a, b]);
    w.collide(w.balls[0], w.balls[1]);
    assert.ok(w.balls.reduce((s, b) => s + kinetic(b), 0) <= energy + 1e-9);
  }
});
test("maximum-speed ball cannot pass through another ball", () => {
  const w = new World([ball(0, -0.4, 0), ball(1, 0, 0)]);
  w.strike(0, 1);
  for (let i = 0; i < 12; i++) w.tick();
  assert.ok(w.events.some((e) => e.type === "ball"));
  assert.ok(w.balls[1].vx > 5);
});
test("rail reverses normal velocity without adding energy", () => {
  const b = ball(0, H - R + 0.0001, 0);
  b.vx = 4;
  b.wy = 15;
  const e = kinetic(b),
    w = new World([b]);
  w.cushions(w.balls[0]);
  assert.ok(w.balls[0].vx < 0);
  assert.ok(kinetic(w.balls[0]) < e);
});
test("sidespin changes the rail exit direction", () => {
  const a = ball(0, H - R + 0.0001, 0);
  a.vx = 2;
  const b = { ...a, wy: 40 };
  const wa = new World([a]),
    wb = new World([b]);
  wa.cushions(wa.balls[0]);
  wb.cushions(wb.balls[0]);
  assert.ok(Math.abs(wa.balls[0].vz - wb.balls[0].vz) > 0.1);
});
test("a side pocket takes a centred ball, no early magnetic capture", () => {
  const w = new World([ball(0, 0, W - 0.08)]);
  w.balls[0].vz = 0.5;
  w.capture(w.balls[0]);
  assert.equal(w.balls[0].pocketed, false);
  simulate(w);
  assert.equal(w.balls[0].pocketed, true);
});
test("corner pocket takes a diagonally centred ball", () => {
  const w = new World([ball(0, H - 0.13, W - 0.13)]);
  w.balls[0].vx = w.balls[0].vz = 0.7;
  simulate(w);
  assert.equal(w.balls[0].pocketed, true);
});
test("pocket jaw rejects a badly aligned side shot", () => {
  const w = new World([ball(0, 0.082, W - 0.12)]);
  w.balls[0].vz = 0.8;
  simulate(w);
  assert.ok(w.events.some((e) => e.type === "rail"));
  assert.equal(w.balls[0].pocketed, false);
});
test("draw reverses cue ball after a nearby full contact, follow continues", () => {
  const draw = new World(drill("spin")),
    follow = new World(drill("spin"));
  draw.strike(0, 0.55, 0, -1);
  follow.strike(0, 0.55, 0, 1);
  for (let i = 0; i < 100; i++) {
    draw.tick();
    follow.tick();
  }
  assert.ok(draw.balls[0].vx < -0.1);
  assert.ok(follow.balls[0].vx > 0.1);
});
test("invalid input cannot corrupt simulation", () => {
  const w = new World();
  assert.equal(w.strike(NaN, 0.5), false);
  assert.equal(w.strike(0, Infinity), false);
  assert.equal(w.placeCue(NaN, 0), false);
  assert.ok(w.balls.every((b) => Number.isFinite(b.x)));
});
test("cannot place cue inside a ball, cushion, or off table", () => {
  const w = new World();
  assert.equal(w.placeCue(H, 0), false);
  assert.equal(w.placeCue(H / 2, 0), false);
  assert.equal(w.placeCue(-0.4, 0.2), true);
});
test("shot replay produces identical terminal state and events", () => {
  const a = new World(rack(99)),
    b = new World(rack(99));
  a.strike(0.003, 0.95, 0.1, 0.2);
  b.strike(0.003, 0.95, 0.1, 0.2);
  simulate(a);
  simulate(b);
  assert.deepEqual(a.balls, b.balls);
  assert.deepEqual(a.events, b.events);
});
test("seeded break stress: finite states, eventual rest, no escaped balls", () => {
  for (let n = 1; n <= 40; n++) {
    const w = new World(rack(n));
    w.strike(
      (n - 20) * 0.002,
      0.4 + (n % 7) * 0.1,
      ((n % 3) - 1) * 0.6,
      ((n % 5) - 2) * 0.3,
    );
    simulate(w, 40);
    assert.equal(w.active, false, `rack ${n} failed to settle`);
    for (const b of w.balls) {
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.z));
      assert.ok(
        b.pocketed || (Math.abs(b.x) < H + 0.09 && Math.abs(b.z) < W + 0.09),
        `rack ${n}, ball ${b.id} escaped: ${b.x},${b.z}`,
      );
    }
  }
});
test("contact prediction keeps maximum break penetration below 0.05 mm", () => {
  const w = new World();
  w.strike(0.005, 1, 0.2, 0.2);
  simulate(w);
  assert.ok(w.maxOverlap < 0.00005, `penetration ${w.maxOverlap * 1000} mm`);
});
test('right cue-tip offset applies the correct torque and opposite squirt',()=>{const w=new World([ball(0,0,0)]);w.strike(0,.5,1,0);assert.ok(w.balls[0].wy>0);assert.ok(w.balls[0].vz<0);});

test("cushion contact never adds energy for any spin or approach", () => {
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let n = 0; n < 500; n++) {
    const b = ball(0, H - R + 0.0001, 0);
    b.vx = 0.1 + Math.abs(rnd()) * 6;
    b.vz = rnd() * 4;
    b.wx = rnd() * 200;
    b.wy = rnd() * 200;
    b.wz = rnd() * 200;
    const e = kinetic(b),
      w = new World([b]);
    w.cushions(w.balls[0]);
    assert.ok(kinetic(w.balls[0]) <= e + 1e-9, `case ${n}`);
  }
});
test("a rolling ball keeps over half its speed off a rail (nose friction turns its roll)", () => {
  const b = ball(0, H - 0.3, 0);
  b.vx = 2;
  b.wz = -2 / R;
  const w = new World([b]);
  let rebounded = false;
  for (let i = 0; i < 1200; i++) {
    w.tick();
    const c = w.balls[0];
    if (c.vx < 0) rebounded = true;
    if (rebounded && Math.abs(c.vx + R * c.wz) < 1e-4) break;
  }
  const v = w.balls[0].vx;
  assert.ok(v < -0.9 && v > -1.6, `rolling exit ${v}`);
});
test("throw friction falls with slip speed (TP A.14) and stun cuts throw more than rolling cuts", () => {
  assert.ok(throwFriction(0.2) > throwFriction(1) && throwFriction(1) > throwFriction(4));
  const cut = (roll: boolean) => {
    const a = ball(0, 0, 0),
      b = ball(1, 2 * R * Math.cos(0.5) - 1e-6, 2 * R * Math.sin(0.5));
    a.vx = 1;
    if (roll) a.wz = -1 / R;
    const w = new World([a, b]);
    w.collide(w.balls[0], w.balls[1]);
    const o = w.balls[1];
    return Math.abs(Math.atan2(o.vz, o.vx) - 0.5);
  };
  assert.ok(cut(false) > cut(true), `stun ${cut(false)} rolling ${cut(true)}`);
  assert.ok(cut(false) > 0.01);
});
