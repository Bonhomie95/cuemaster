import { test } from "node:test";
import assert from "node:assert/strict";
import { Session, seededRandom } from "../mobile/src/game/session";
import { makeCpu, planCpuShot, cpuPlacement } from "../mobile/src/game/cpu";

/** A seeded house match, as the club opens it. */
const seat = (seed: number) => {
  const s = new Session();
  s.cpu = makeCpu({}, seed);
  s.matchRules = true;
  s.rng = seededRandom(seed);
  s.now = () => 0;
  s.reset("break");
  return s;
};
const settle = (s: Session) => {
  let n = 0;
  while ((s.running || s.cpuTurn) && n++ < 20000) s.update(0.1);
};
/** One player turn, deterministic on both tables. */
const playerTurn = (s: Session) => {
  if (s.progress.breakChoice) s.resolveBreak("accept");
  if (s.placement) {
    const pos = cpuPlacement(s.world.balls, s.headStringPlacement);
    if (pos) s.placeCue(pos.x, pos.z);
  }
  Object.assign(
    s,
    planCpuShot(s.world.balls, s.progress, 0.9, false, () => 0.5),
  );
  s.shoot();
  settle(s);
};

test("an open rack rebuilt from its shot record is the same table, and play goes on identically", () => {
  const seed = 7;
  const a = seat(seed);
  a.angle = 0.007;
  a.power = 0.9;
  a.shoot();
  settle(a);
  for (let turn = 0; turn < 3 && !a.progress.finished; turn++) playerTurn(a);
  assert.ok(!a.progress.finished, "the rack is still open");
  assert.ok(a.actions.length >= 2, "there is a record to restore from");
  const record = JSON.parse(JSON.stringify(a.actions));

  const b = seat(seed);
  b.restore(record);
  assert.ok(b.matches(a.tableState()), "same balls, same rules state");
  assert.deepEqual(b.actions, a.actions, "the record comes out unchanged");
  assert.equal(b.turnDeadline, 0, "the clock starts fresh");

  // The rival's dice are in the same place on both tables, so the next turns agree too.
  for (let turn = 0; turn < 2 && !a.progress.finished; turn++) {
    playerTurn(a);
    playerTurn(b);
    assert.ok(
      b.matches(a.tableState()),
      `turn ${turn} after the restore matches`,
    );
  }
});

test("restoring an empty record is just a fresh rack", () => {
  const b = seat(3);
  b.restore([]);
  assert.equal(b.shots, 0);
  assert.deepEqual(b.actions, []);
  assert.ok(!b.running && !b.cpuTurn);
});
