// @env HOUSE_WAIT_MS=1500
import { test } from "node:test";
import assert from "node:assert/strict";
import { Session, perform } from "../../mobile/src/game/session";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";

async function guest() {
  const r = await fetch(base + "/auth/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adultConfirmed: true }),
  });
  assert.equal(r.status, 201);
  return (await r.json()).token as string;
}
async function me(token: string) {
  const r = await fetch(base + "/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.json();
}
/** A socket with an inbox, so a test can wait for the next message of a given type. */
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
  return { ws, send, next };
}

test("two players are matched, the server referees every shot, and the winner takes the pot", async () => {
  const [ta, tb] = [await guest(), await guest()];
  const [a, b] = [await connect(ta), await connect(tb)];
  a.send({ t: "queue", venueId: "heritage" });
  await a.next("queued");
  b.send({ t: "queue", venueId: "heritage" });
  const [ma, mb] = await Promise.all([a.next("match"), b.next("match")]);
  assert.equal(ma.id, mb.id);
  assert.equal(ma.pot, 100);
  assert.notEqual(ma.seat, mb.seat);
  assert.equal(ma.opponent.id, (await me(tb)).id);
  assert.equal((await me(ta)).coins, 950, "entry charged once");
  assert.equal((await me(tb)).coins, 950);

  const breaker = ma.seat === 0 ? a : b,
    waiter = ma.seat === 0 ? b : a;
  // Only the player holding the table may act.
  waiter.send({
    t: "act",
    action: { t: "shot", angle: 0, power: 0.9, side: 0, top: 0 },
  });
  const reject = await waiter.next("reject");
  assert.match(reject.message, /not your turn/);
  assert.equal(reject.seq, 0);

  const breakShot = { t: "shot", angle: 0, power: 1, side: 0, top: 0 };
  breaker.send({ t: "act", action: breakShot });
  const [ua, ub] = await Promise.all([a.next("act"), b.next("act")]);
  assert.equal(ua.seq, 1);
  assert.deepEqual(ua.state, ub.state, "both players get the same table");
  // The server ran the same engine a phone runs: replaying the break here gives its table.
  const local = new Session();
  local.matchRules = true;
  local.now = () => 0;
  local.reset("break");
  perform(local, breakShot as any);
  while (local.running) local.update(0.1);
  assert.ok(local.matches(ua.state), "a phone reaches the server's table");

  // Whoever holds the table now resigns; the other player wins both entries.
  const holder = ua.state.progress.turn === ma.seat ? a : b;
  const other = holder === a ? b : a;
  holder.send({ t: "resign" });
  const [endHolder, endOther] = await Promise.all([
    holder.next("end"),
    other.next("end"),
  ]);
  assert.equal(endOther.pot, 100);
  assert.equal(endHolder.pot, 0);
  assert.equal(endOther.trophies, 24);
  assert.ok(endOther.crate, "an online win seals a crate");
  const [holderToken, otherToken] = holder === a ? [ta, tb] : [tb, ta];
  assert.equal((await me(otherToken)).coins, 1050);
  assert.equal((await me(otherToken)).trophies, 24);
  assert.equal((await me(holderToken)).coins, 950);
  assert.equal((await me(holderToken)).stats.onlineLosses, 1);

  // A rematch needs both players and charges both again.
  a.send({ t: "rematch" });
  await b.next("rematch");
  b.send({ t: "rematch" });
  const [ra, rb] = await Promise.all([a.next("match"), b.next("match")]);
  assert.equal(ra.id, rb.id);
  assert.notEqual(ra.id, ma.id);
  assert.equal((await me(otherToken)).coins, 1000);

  // A dropped player can come back to the same table.
  b.ws.close();
  const away = await a.next("opponent");
  assert.equal(away.status, "away");
  const b2 = await connect(tb);
  const resumed = await b2.next("match");
  assert.equal(resumed.id, ra.id);
  assert.equal(resumed.seq, 0);
  assert.ok(resumed.state.balls.length === 16);
  assert.equal((await a.next("opponent")).status, "back");
  b2.send({ t: "resign" });
  await Promise.all([a.next("end"), b2.next("end")]);
  a.ws.close();
  b2.ws.close();
});

test("a private room pairs friends by code and checks the entry", async () => {
  const [ta, tb] = [await guest(), await guest()];
  const [a, b] = [await connect(ta), await connect(tb)];
  a.send({ t: "room", venueId: "heritage" });
  const room = await a.next("room");
  assert.match(room.code, /^[A-Z2-9]{5}$/);
  b.send({ t: "join", code: "ZZZZZ" });
  assert.match((await b.next("error")).message, /expired/);
  // A venue above the player's level is refused before anyone is charged.
  b.send({ t: "room", venueId: "champion" });
  assert.match((await b.next("error")).message, /level 7/);
  b.send({ t: "join", code: room.code });
  const [ma, mb] = await Promise.all([a.next("match"), b.next("match")]);
  assert.equal(ma.private, true);
  assert.equal(mb.id, ma.id);
  a.send({ t: "resign" });
  await Promise.all([a.next("end"), b.next("end")]);
  a.ws.close();
  b.ws.close();
});

test("the socket refuses strangers and junk", async () => {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/live");
  const first = new Promise<any>((resolve) => {
    ws.onmessage = (e) => resolve(JSON.parse(String(e.data)));
  });
  await new Promise((resolve) => (ws.onopen = resolve));
  ws.send(JSON.stringify({ t: "hello", token: "not-a-real-session-token" }));
  assert.equal((await first).t, "error");
  ws.close();
});
