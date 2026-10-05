import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Session,
  replayMatch,
  seededRandom,
  encodeReplay,
  decodeReplay,
} from "../mobile/src/game/session";
import { makeCpu } from "../mobile/src/game/cpu";
import { drill, cityDrillNames } from "../mobile/src/physics/engine";

test("replay codes round-trip exact floats and reject junk", () => {
  const shots = [
    { angle: -1.5707963267948966, power: 0.2200000001, side: 0.1, top: -0.3 },
    { angle: 0.123456789012345, power: 1, side: 0, top: 0 },
  ];
  assert.deepEqual(decodeReplay(encodeReplay("pocket", shots)), {
    drill: "pocket",
    shots,
  });
  assert.equal(decodeReplay("hello"), null);
  assert.equal(decodeReplay("CM1:pocket:1,2,x,0"), null);
});

test("daily layouts are deterministic per date and differ between dates", () => {
  assert.deepEqual(drill("daily:2026-10-05"), drill("daily:2026-10-05"));
  assert.notDeepEqual(drill("daily:2026-10-05"), drill("daily:2026-10-06"));
  for (const name of cityDrillNames)
    assert.ok(
      drill(name).some((b) => b.id === 1),
      name + " has a 1 ball",
    );
});

test("a CPU match replays to the same table from the recorded actions and seed", () => {
  const cpu = makeCpu({}, 3),
    seed = 99;
  const live = new Session();
  live.cpu = cpu;
  live.matchRules = true;
  live.rng = seededRandom(seed);
  live.now = () => 0;
  live.reset("break");
  // Player breaks, then plays two shots; the rival answers in between from the seed.
  const step = () => {
    let n = 0;
    while ((live.running || live.cpuTurn) && n++ < 20000) live.update(0.1);
  };
  live.angle = 0.007;
  live.power = 0.9;
  live.shoot();
  step();
  for (let i = 0; i < 2 && !live.progress.finished; i++) {
    if (live.progress.breakChoice) live.resolveBreak("accept");
    if (live.placement) live.placeCue(-0.9, 0.1);
    live.angle = 0.3 * i;
    live.power = 0.4;
    live.shoot();
    step();
  }
  const replayed = new Session();
  replayed.cpu = cpu;
  replayed.matchRules = true;
  replayed.rng = seededRandom(seed);
  replayed.now = () => 0;
  replayed.reset("break");
  for (const a of live.actions) {
    let n = 0;
    while ((replayed.running || replayed.cpuTurn) && n++ < 20000)
      replayed.update(0.1);
    if (a.t === "shot") {
      Object.assign(replayed, {
        angle: a.angle,
        power: a.power,
        side: a.side,
        top: a.top,
      });
      replayed.shoot();
    } else if (a.t === "place") replayed.placeCue(a.x, a.z);
    else if (a.t === "break") replayed.resolveBreak(a.choice);
  }
  let n = 0;
  while ((replayed.running || replayed.cpuTurn) && n++ < 20000)
    replayed.update(0.1);
  assert.ok(live.actions.some((a) => a.t === "shot"));
  assert.deepEqual(replayed.world.balls, live.world.balls);
  // A different seed makes the rival play differently, so forged logs stop lining up.
  const other = replayMatch(cpu, seed + 1, live.actions);
  assert.equal(typeof other.finished, "boolean");
  assert.throws(() =>
    replayMatch(cpu, seed, [{ t: "break", choice: "accept" }]),
  );
});

test("the coach explains a miss from the engine's contact record", () => {
  const s = new Session();
  s.reset("pocket");
  s.angle = -Math.PI / 2 + 0.2;
  s.power = 0.25;
  s.shoot();
  while (s.running) s.update(1 / 60);
  assert.ok(s.coach, "coach note set on a miss");
  assert.match(s.coach!, /1 ball|cue ball/);
  s.reset("pocket");
  s.angle = -Math.PI / 2;
  s.power = 0.22;
  s.shoot();
  while (s.running) s.update(1 / 60);
  assert.equal(s.coach, null, "no coaching after a pot");
});

test("a ghost table follows the player's shot count and a loaded code never scores", () => {
  const s = new Session();
  s.reset("pocket");
  s.setGhost([{ angle: -Math.PI / 2, power: 0.22, side: 0, top: 0 }]);
  s.angle = 0;
  s.power = 0.1;
  s.shoot();
  while (s.running) s.update(1 / 60);
  assert.ok(s.ghost!.world.balls.find((b) => b.id === 1)!.pocketed);
  assert.ok(!s.world.balls.find((b) => b.id === 1)!.pocketed);
  assert.ok(
    s.playCode(
      encodeReplay("pocket", [
        { angle: -Math.PI / 2, power: 0.22, side: 0, top: 0 },
      ]),
    ),
  );
  assert.ok(s.imported);
  for (let n = 0; n < 2000 && (s.queue.length || s.running); n++) s.update(0.1);
  assert.ok(s.world.balls.find((b) => b.id === 1)!.pocketed);
});
