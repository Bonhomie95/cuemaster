import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
// More replays at once than there are referee workers: each waits its turn instead of being
// turned away as "busy", which is what left CPU wins unpaid under load.
test("simultaneous replays queue for the referee instead of being refused", async () => {
  const created = await fetch(base + "/auth/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adultConfirmed: true }),
  }).then((r) => r.json());
  const call = (path: string, body: unknown) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${created.token}`,
      },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const tickets = await Promise.all(
    [0, 1, 2, 3, 4].map(() =>
      call("/practice/start", { tableId: "heritage", challengeId: "pocket" }),
    ),
  );
  const shots = [{ angle: -Math.PI / 2, power: 0.22, side: 0, top: 0 }];
  const results = await Promise.all(
    tickets.map((t) =>
      call("/practice/complete", { ticket: t.body.ticket, shots }),
    ),
  );
  for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body));
});
