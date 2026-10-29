// @env HOUSE_WAIT_MS=1200
import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { ROSTER, houseId } from "../src/house";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";

async function guest() {
  const r = await fetch(base + "/auth/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adultConfirmed: true }),
  });
  return (await r.json()) as { token: string; player: any };
}
async function connect(token: string) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/live");
  const inbox: any[] = [];
  const waiting: { type: string; resolve: (m: any) => void }[] = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    const i = waiting.findIndex((w) => w.type === m.t);
    if (i >= 0) waiting.splice(i, 1)[0].resolve(m);
    else inbox.push(m);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const next = (type: string, ms = 8000) => {
    const i = inbox.findIndex((m) => m.t === type);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`No ${type} message within ${ms} ms`)),
        ms,
      );
      waiting.push({
        type,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  };
  const send = (m: any) => ws.send(JSON.stringify(m));
  send({ t: "hello", token });
  await next("welcome");
  return { ws, send, next, inbox };
}

test("with nobody waiting, a house player is seated after the wait and plays its own shots", async () => {
  const mongo = await new MongoClient(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27028",
  ).connect();
  const players = mongo
    .db(process.env.TEST_MONGODB_DB || "cuemaster")
    .collection<any>("players");
  try {
    // The roster exists as ordinary player documents with ids like anyone else's.
    assert.equal(await players.countDocuments({ house: true }), ROSTER.length);
    assert.doesNotMatch(houseId("tunde-b"), /house/);
    const { token, player } = await guest();
    const a = await connect(token);
    const started = Date.now();
    a.send({ t: "queue", venueId: "heritage" });
    await a.next("queued");
    const m = await a.next("match", 6000);
    const waited = Date.now() - started;
    assert.ok(waited >= 1000 && waited < 5000, `seated after ${waited} ms`);
    const opponent = await players.findOne({ _id: m.opponent.id });
    assert.equal(opponent.house, true);
    assert.equal(m.opponent.name, opponent.name);
    assert.ok(!("house" in m.opponent), "nothing in the match says house");
    assert.equal(m.pot, 100);

    // Whoever breaks, the house plays within its clock and lines the shot up first.
    if (m.seat === 1) {
      const act = await a.next("act", 15000);
      assert.equal(act.seat, 0);
      assert.equal(act.auto, false);
      assert.equal(act.action.t, "shot");
    } else {
      a.send({
        t: "act",
        action: { t: "shot", angle: 0.004, power: 1, side: 0, top: 0 },
      });
      const mine = await a.next("act");
      assert.equal(mine.seat, 0);
      // Then the house takes its turn (unless the break handed the table back).
      const turn = mine.state.progress.turn;
      if (turn === 1) {
        const aim = await a.next("aim", 15000);
        assert.ok(Number.isFinite(aim.angle));
        const theirs = await a.next("act", 15000);
        assert.equal(theirs.seat, 1);
        assert.equal(theirs.auto, false);
      }
    }
    // Resigning loses to the house like to anyone; the result goes into the player's form.
    a.send({ t: "resign" });
    const end = await a.next("end");
    assert.equal(end.winner, 1 - m.seat);
    assert.equal(end.trophies, -16);
    const me = await players.findOne({ _id: player.id });
    assert.deepEqual(me.form, [0]);
    const after = await players.findOne({ _id: m.opponent.id });
    assert.equal(after.stats.onlineWins, opponent.stats.onlineWins + 1);
    assert.equal(after.trophies, opponent.trophies + 24);
    assert.ok(after.crates.length === 0, "the house collects no crates");
    a.ws.close();
  } finally {
    await mongo.close();
  }
});

test("a person who arrives during the wait is preferred to the house", async () => {
  const [ta, tb] = [await guest(), await guest()];
  const [a, b] = [await connect(ta.token), await connect(tb.token)];
  a.send({ t: "queue", venueId: "heritage" });
  await a.next("queued");
  b.send({ t: "queue", venueId: "heritage" });
  const [ma, mb] = await Promise.all([a.next("match"), b.next("match")]);
  assert.equal(ma.id, mb.id);
  assert.equal(ma.opponent.id, tb.player.id);
  a.send({ t: "resign" });
  await Promise.all([a.next("end"), b.next("end")]);
  a.ws.close();
  b.ws.close();
});

test("cancelling the search stops the house from arriving", async () => {
  const { token } = await guest();
  const a = await connect(token);
  a.send({ t: "queue", venueId: "heritage" });
  await a.next("queued");
  a.send({ t: "cancel" });
  await a.next("cancelled");
  await new Promise((r) => setTimeout(r, 2000));
  assert.ok(!a.inbox.some((m) => m.t === "match"), "no match after cancel");
  a.ws.close();
});
