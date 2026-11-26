// @env LIVE_TABLES=1 HOUSE_WAIT_MS=300
import { test } from "node:test";
import assert from "node:assert/strict";
import { guestToken as guest, me, connect } from "./liveClient";

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
