import { test } from "node:test";
import assert from "node:assert/strict";
test("coin cue unlock is permanent, atomic and does not charge for equipping", async () => {
  const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
  let token = "";
  const call = async (path: string, body?: unknown, method = "POST") => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  token = (await call("/auth/guest", { adultConfirmed: true })).body.token;
  try {
    const r = await Promise.all([
      call("/me/cue", { cueId: "precision" }),
      call("/me/cue", { cueId: "precision" }),
    ]);
    assert.ok(r.every((x) => x.status === 200));
    const me = await call("/me", undefined, "GET");
    assert.equal(me.body.coins, 600);
    assert.equal(me.body.selectedCue, "precision");
    assert.ok(me.body.ownedCues.includes("precision"));
    assert.equal((await call("/me/cue", { cueId: "master" })).status, 409);
    assert.equal((await call("/me/cue", { cueId: "club" })).body.coins, 600);
    assert.equal(
      (await call("/me/cue", { cueId: "precision" })).body.coins,
      600,
    );
  } finally {
    await call("/me", { confirm: "DELETE" }, "DELETE");
  }
});
