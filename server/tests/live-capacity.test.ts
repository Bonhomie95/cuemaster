// @env LIVE_TABLES=1 HOUSE_WAIT_MS=300
import { test } from "node:test";
import assert from "node:assert/strict";
import { guestToken as guest, me, connect } from "./liveClient";
import { cpuAllowance } from "../src/live";

test("the CPU allowance is read from the container's limits", () => {
  const files = (m: Record<string, string>) => (f: string) => {
    if (f in m) return m[f];
    throw new Error("no such file");
  };
  // cgroup v2, as on Render's free instance.
  assert.equal(
    cpuAllowance(files({ "/sys/fs/cgroup/cpu.max": "15000 100000\n" })),
    0.15,
  );
  // cgroup v1.
  assert.equal(
    cpuAllowance(
      files({
        "/sys/fs/cgroup/cpu/cpu.cfs_quota_us": "50000",
        "/sys/fs/cgroup/cpu/cpu.cfs_period_us": "100000",
      }),
    ),
    0.5,
  );
  // No limit: every core.
  assert.ok(
    cpuAllowance(files({ "/sys/fs/cgroup/cpu.max": "max 100000" })) >= 1,
  );
});

// The free instance can only referee so many tables at once; past that a search is told so
// before anyone is charged, and the tables already running carry on.
test("a full house of tables turns the next search away without charging it", async () => {
  const [ta, tb] = [await guest(), await guest()];
  const [a, b] = [await connect(ta), await connect(tb)];
  try {
    a.send({ t: "queue", venueId: "heritage" });
    await a.next("match");
    b.send({ t: "queue", venueId: "heritage" });
    const full = await b.next("error");
    assert.match(full.message, /Every online table is taken/);
    assert.equal((await me(tb)).coins, 1000, "nothing was charged");
  } finally {
    a.ws.close();
    b.ws.close();
  }
});
