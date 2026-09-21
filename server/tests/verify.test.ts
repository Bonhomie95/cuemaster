import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyReplay } from "../src/verify";
test("server recomputes success rather than accepting client score", () => {
  assert.deepEqual(
    verifyReplay(
      "pocket",
      [{ angle: -Math.PI / 2, power: 0.22, side: 0, top: 0 }],
      [1],
    ).potted,
    [1],
  );
  assert.throws(() =>
    verifyReplay("pocket", [{ angle: 0, power: 0.1, side: 0, top: 0 }], [1]),
  );
});
test("invalid shots and missing targets cannot earn rewards", () => {
  assert.throws(() => verifyReplay("pocket", [], [1]));
  assert.throws(() =>
    verifyReplay("pocket", [{ angle: 0, power: 1.1, side: 0, top: 0 }], [1]),
  );
  assert.throws(() =>
    verifyReplay("pocket", [{ angle: NaN, power: 0.1, side: 0, top: 0 }], [1]),
  );
});
