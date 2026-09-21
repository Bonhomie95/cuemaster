import { test } from "node:test";
import assert from "node:assert/strict";
import { Progress } from "../mobile/src/game/progress";
import { localWinner } from "../mobile/src/game/localMatch";
test("local rack has no winner until finished; early eight loses", () => {
  const p = new Progress();
  assert.equal(localWinner(p), null);
  p.pocket(8);
  p.finish(false);
  assert.equal(localWinner(p), 1);
});
test("clearing the assigned group then eight wins unless scratched", () => {
  const p = new Progress();
  p.groups = ["solids", "stripes"];
  p.returned = [1, 2, 3, 4, 5, 6, 7];
  p.begin();
  p.pocket(8);
  p.finish(false);
  assert.equal(localWinner(p), 0);
  p.scratch = true;
  assert.equal(localWinner(p), 1);
});
