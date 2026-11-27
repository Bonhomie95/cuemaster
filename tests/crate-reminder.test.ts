import { test } from "node:test";
import assert from "node:assert/strict";
import { crateReminder } from "../mobile/src/app/crateReminder";

test("the crate reminder follows the crate: moved by a video, gone once it can open", () => {
  const now = Date.parse("2026-11-27T12:00:00Z");
  const crate = (readyAt: string | null, unlocking = true) => ({
    name: "Club crate",
    unlocking,
    readyAt,
  });
  const later = crateReminder(
    [crate(null, false), crate("2026-11-27T14:00:00Z")],
    now,
  );
  assert.equal(later?.at.toISOString(), "2026-11-27T14:00:00.000Z");
  assert.equal(later?.title, "Club crate unlocked");
  // A video took the last hour off: the crate is ready now, so nothing is left to remind about.
  assert.equal(crateReminder([crate("2026-11-27T12:00:00Z")], now), null);
  // Opened: no crate is unlocking.
  assert.equal(crateReminder([crate(null, false)], now), null);
  assert.equal(crateReminder(undefined, now), null);
});
