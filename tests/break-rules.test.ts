import { test } from "node:test";
import assert from "node:assert/strict";
import { Progress } from "../mobile/src/game/progress";
import { Session } from "../mobile/src/game/session";
import { R, H } from "../mobile/src/physics/engine";
import { localWinner } from "../mobile/src/game/localMatch";
const legalContact = (p: Progress, id = 1) =>
  p.contact({ type: "ball", a: 0, b: id, speed: 1, time: 0 });
test("eight on legal break belongs to breaker: no loss and no group assignment", () => {
  const p = new Progress();
  p.strict = true;
  p.begin();
  legalContact(p);
  p.pocket(8);
  p.finish(true);
  assert.equal(p.finished, false);
  assert.equal(localWinner(p), null);
  assert.equal(p.breakChoice, "eight");
  assert.equal(p.turn, 0);
  assert.deepEqual(p.groups, [null, null]);
});
test("eight plus scratch gives choice to opponent, never ends rack", () => {
  const p = new Progress();
  p.begin();
  p.pocket(8);
  p.pocket(0);
  p.finish(true);
  assert.equal(p.turn, 1);
  assert.equal(p.breakChoice, "eight");
  assert.equal(p.finished, false);
});
test("spotting avoids occupied foot spot and clears eight from pot ledger", () => {
  const s = new Session();
  s.reset();
  s.world.balls.find((b) => b.id === 8)!.pocketed = true;
  s.progress.pocket(8);
  s.progress.finish(true);
  s.resolveBreak("spot");
  const eight = s.world.balls.find((b) => b.id === 8)!;
  assert.equal(eight.pocketed, false);
  assert.equal(s.progress.breakChoice, null);
  assert.ok(!s.progress.returned.includes(8));
  for (const b of s.world.balls)
    if (b.id !== 8 && !b.pocketed)
      assert.ok(Math.hypot(eight.x - b.x, eight.z - b.z) >= R * 2);
});
test("foul-break spot restricts cue placement to head string side", () => {
  const s = new Session();
  s.matchRules = true;
  s.reset();
  s.progress.pocket(8);
  s.progress.pocket(0);
  s.progress.finish(true);
  s.world.balls.find((b) => b.id === 8)!.pocketed = true;
  s.world.balls.find((b) => b.id === 0)!.pocketed = true;
  s.resolveBreak("spot");
  assert.equal(s.progress.turn, 1);
  assert.equal(s.placement, true);
  assert.equal(s.placeCue(0, 0.3), false);
  assert.equal(s.placeCue(-H * 0.8, 0.3), true);
  assert.equal(s.placement, false);
});
test("rerack preserves choice of breaker and enables another real break", () => {
  const s = new Session();
  s.matchRules = true;
  s.reset();
  s.progress.pocket(8);
  s.progress.pocket(0);
  s.progress.finish(true);
  s.resolveBreak("rerack");
  assert.equal(s.progress.turn, 1);
  assert.equal(s.shots, 0);
  assert.equal(s.world.balls.filter((b) => !b.pocketed).length, 16);
  assert.equal(s.progress.strict, true);
});
test("illegal break offers incoming player choice; four distinct rail balls makes it legal", () => {
  const p = new Progress();
  p.strict = true;
  p.begin();
  legalContact(p);
  p.finish(true);
  assert.equal(p.breakChoice, "illegal");
  assert.equal(p.turn, 1);
  const q = new Progress();
  q.strict = true;
  q.begin();
  legalContact(q);
  for (const a of [1, 2, 3, 4])
    q.contact({ type: "rail", a, speed: 1, time: 1 });
  q.finish(true);
  assert.equal(q.breakChoice, null);
  assert.equal(q.turn, 1);
});
test("wrong first contact and no rail are fouls; legal rail miss only changes turn", () => {
  const p = new Progress();
  p.strict = true;
  p.groups = ["solids", "stripes"];
  p.begin();
  legalContact(p, 9);
  p.pocket(1);
  p.finish(false);
  assert.match(p.foul, /Wrong/);
  assert.equal(p.turn, 1);
  const q = new Progress();
  q.strict = true;
  q.begin();
  legalContact(q);
  q.finish(false);
  assert.match(q.foul, /No rail/);
  const r = new Progress();
  r.strict = true;
  r.begin();
  legalContact(r);
  r.contact({ type: "rail", a: 0, speed: 1, time: 1 });
  r.finish(false);
  assert.equal(r.foul, "");
  assert.equal(r.turn, 1);
});
test("last group ball and eight on same stroke cannot win", () => {
  const p = new Progress();
  p.groups = ["solids", "stripes"];
  p.returned = [1, 2, 3, 4, 5, 6];
  p.begin();
  p.pocket(7);
  p.pocket(8);
  p.finish(false);
  assert.equal(localWinner(p), 1);
});
