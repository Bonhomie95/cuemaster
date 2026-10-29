import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { PIGGY, PRODUCTS } from "../src/store";
import { connect, guestToken, meet, me } from "./liveClient";
import { winVerifiedRack } from "./playCpu";

const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";

test("breaking a full piggy bank beats every coin pack per dollar, and it is a repeatable product", () => {
  const piggy = PRODUCTS.find((p) => p.id === "piggy.break")!;
  assert.equal(piggy.kind, "piggy");
  assert.deepEqual(piggy.grants, { piggy: true });
  assert.ok(
    !piggy.oneTime,
    "a consumable the player can buy every time it fills",
  );
  const best = Math.max(
    ...PRODUCTS.filter((p) => p.kind === "coins").map(
      (p) => p.grants.coins! / p.usd,
    ),
  );
  assert.ok(PIGGY.cap / piggy.usd > best);
  assert.equal(PIGGY.cap, 5000);
  assert.ok(0 < PIGGY.lost && PIGGY.lost < PIGGY.won);
  assert.ok(PIGGY.minimum < PIGGY.cap);
});

const skip = { skip: !process.env.TEST_MONGODB_DB };
let client: MongoClient | null = null;
async function players() {
  assert.match(process.env.TEST_MONGODB_DB!, /_qa$/);
  client ??= await new MongoClient(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27028",
  ).connect();
  return client.db(process.env.TEST_MONGODB_DB).collection<any>("players");
}
after(() => client?.close());
const call = (token: string, path: string, method = "GET", body?: unknown) =>
  fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({
    status: r.status,
    body: r.status === 204 ? null : await r.json(),
  }));
const bank = async (token: string) =>
  (await call(token, "/store")).body.piggy.coins;

test(
  "finished computer matches fill the bank, forfeits and pass-and-play do not, and it stops at the cap",
  skip,
  async () => {
    const token = await guestToken();
    const id = (await me(token)).id;
    const match = async (
      mode: "cpu" | "local",
      outcome: string,
      actions?: unknown[],
    ) => {
      const started = await call(token, "/local-matches/start", "POST", {
        venueId: "heritage",
        requestId: randomUUID(),
        mode,
      });
      assert.equal(started.status, 201, JSON.stringify(started.body));
      const done = await call(
        token,
        `/local-matches/${started.body.match.id}/finish`,
        "POST",
        { outcome, actions },
      );
      assert.equal(done.status, 200, JSON.stringify(done.body));
      return done.body;
    };
    const breakable = async () =>
      (await call(token, "/store")).body.products.find(
        (p: any) => p.id === "piggy.break",
      ).available;
    try {
      const store = (await call(token, "/store")).body;
      assert.deepEqual(store.piggy, { coins: 0, ...PIGGY });
      assert.equal(await breakable(), false);

      await match("cpu", "lost");
      assert.equal(await bank(token), PIGGY.lost);
      await match("cpu", "forfeit");
      assert.equal(await bank(token), PIGGY.lost, "a forfeit is not finished");
      await match("local", "won");
      assert.equal(
        await bank(token),
        PIGGY.lost,
        "pass and play is not a computer match",
      );
      // A win the referee cannot confirm is a loss, and fills like one.
      assert.equal((await match("cpu", "won", [])).verified, false);
      assert.equal(await bank(token), 2 * PIGGY.lost);

      const before = (await me(token)).stats;
      await winVerifiedRack((path, method, body) =>
        call(token, path, method, body),
      );
      const after = (await me(token)).stats;
      assert.equal(
        await bank(token),
        2 * PIGGY.lost +
          PIGGY.won * (after.cpuWins - (before.cpuWins || 0)) +
          PIGGY.lost * (after.cpuLosses - before.cpuLosses),
      );

      await (
        await players()
      ).updateOne({ _id: id }, { $set: { piggy: PIGGY.cap - 20 } });
      await match("cpu", "lost");
      assert.equal(await bank(token), PIGGY.cap, "topped up to the cap");
      await match("cpu", "lost");
      assert.equal(await bank(token), PIGGY.cap, "and no further");

      // The shop offers the break from the minimum up.
      await (
        await players()
      ).updateOne({ _id: id }, { $set: { piggy: PIGGY.minimum - 1 } });
      assert.equal(await breakable(), false);
      await (
        await players()
      ).updateOne({ _id: id }, { $set: { piggy: PIGGY.minimum } });
      assert.equal(await breakable(), true);
    } finally {
      await call(token, "/me", "DELETE", { confirm: "DELETE" });
    }
  },
);

test(
  "finished online matches fill both players' banks, matchmade or private, in the result's own write",
  skip,
  async () => {
    const [ta, tb] = [await guestToken(), await guestToken()];
    const [a, b] = [await connect(ta), await connect(tb)];
    try {
      await meet(a, b);
      b.send({ t: "resign" });
      await Promise.all([a.next("end"), b.next("end")]);
      // Read straight after the result arrives: the deposit landed with it.
      assert.deepEqual(
        [await bank(ta), await bank(tb)],
        [PIGGY.won, PIGGY.lost],
      );
      a.send({ t: "room", venueId: "heritage" });
      const room = await a.next("room");
      b.send({ t: "join", code: room.code });
      await Promise.all([a.next("match"), b.next("match")]);
      a.send({ t: "resign" });
      await Promise.all([a.next("end"), b.next("end")]);
      assert.deepEqual(
        [await bank(ta), await bank(tb)],
        [PIGGY.won + PIGGY.lost, PIGGY.lost + PIGGY.won],
      );
    } finally {
      a.ws.close();
      b.ws.close();
      await call(ta, "/me", "DELETE", { confirm: "DELETE" });
      await call(tb, "/me", "DELETE", { confirm: "DELETE" });
    }
  },
);
