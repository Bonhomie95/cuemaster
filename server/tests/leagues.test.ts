import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { LEAGUES, LEAGUE_SIZE, leagueOf, outcome, zones } from "../src/leagues";
import { currentWeek } from "../src/season";
import { connect, guestToken, meet, me } from "./liveClient";

const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";

test("a full league moves ten up and ten down, a smaller one a fifth each way, never overlapping", () => {
  assert.deepEqual(zones(50), { promote: 10, relegate: 10 });
  assert.deepEqual(zones(49), { promote: 10, relegate: 9 });
  assert.deepEqual(zones(20), { promote: 4, relegate: 4 });
  assert.deepEqual(zones(3), { promote: 1, relegate: 0 });
  assert.deepEqual(zones(1), { promote: 1, relegate: 0 });
  for (let n = 1; n <= LEAGUE_SIZE; n++) {
    const z = zones(n);
    assert.ok(z.promote + z.relegate <= n, `size ${n}`);
  }
  // Weeks start on Monday at midnight UTC and follow each other with no gap.
  const week = currentWeek(Date.UTC(2026, 9, 29, 12));
  assert.equal(week.startsAt.toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(week.endsAt.toISOString(), "2026-11-02T00:00:00.000Z");
  assert.equal(currentWeek(Date.UTC(2026, 10, 2)).id, week.id + 1);
  assert.equal(currentWeek(Date.UTC(2026, 10, 2) - 1).id, week.id);
});

test("a tier's week is cut into even leagues of up to 50 by trophies, then ranked by coins won", () => {
  const start = Date.UTC(2026, 9, 26);
  const tier = Array.from({ length: 120 }, (_, i) => ({
    playerId: `p${String(i).padStart(3, "0")}`,
    trophies: 2000 - i * 7,
    coins: (i * 37) % 500,
    scoredAt: new Date(start + i * 1000),
  }));
  const top = leagueOf(tier, "p000");
  assert.equal(top.groups, 3);
  assert.equal(top.group, 0);
  assert.deepEqual(
    top.standings.map((e) => e.playerId).sort(),
    tier.slice(0, 40).map((e) => e.playerId),
    "the forty highest trophy counts play together",
  );
  assert.equal(leagueOf(tier, "p119").group, 2);
  for (let i = 1; i < top.standings.length; i++) {
    const [a, b] = [top.standings[i - 1], top.standings[i]];
    assert.ok(
      a.coins > b.coins || (a.coins === b.coins && a.scoredAt <= b.scoredAt),
    );
  }
  assert.equal(leagueOf(tier.slice(0, 50), "p000").groups, 1);
  const split = leagueOf(tier.slice(0, 51), "p000");
  assert.deepEqual([split.groups, split.standings.length], [2, 26]);
  // Level on coins: whoever got there first ranks higher.
  const tie = [
    { playerId: "b", trophies: 0, coins: 100, scoredAt: new Date(2) },
    { playerId: "a", trophies: 0, coins: 100, scoredAt: new Date(3) },
  ];
  assert.deepEqual(
    leagueOf(tie, "a").standings.map((e) => e.playerId),
    ["b", "a"],
  );
});

test("the top zone needs a pot won, the bottom zone drops a tier, and Bronze and Diamond hold their edges", () => {
  assert.deepEqual(
    LEAGUES.map((l) => l.name),
    ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
  );
  const up = { result: "promoted", tier: 2, crate: "silver" };
  assert.deepEqual(outcome(0, 50, 1, 500), up);
  assert.deepEqual(outcome(9, 50, 1, 1), up);
  const stay = { result: "stayed", tier: 1, crate: null };
  assert.deepEqual(outcome(10, 50, 1, 900), stay);
  assert.deepEqual(outcome(0, 50, 1, 0), stay, "no pot won, no promotion");
  assert.deepEqual(outcome(39, 50, 1, 0), stay);
  assert.deepEqual(outcome(40, 50, 1, 0), {
    result: "relegated",
    tier: 0,
    crate: null,
  });
  assert.deepEqual(outcome(49, 50, 0, 0), {
    result: "stayed",
    tier: 0,
    crate: null,
  });
  const top = LEAGUES.length - 1;
  assert.deepEqual(outcome(0, 50, top, 10), {
    result: "promoted",
    tier: top,
    crate: "master",
  });
});

const skip = { skip: !process.env.TEST_MONGODB_DB };
let client: MongoClient | null = null;
async function database() {
  assert.match(process.env.TEST_MONGODB_DB!, /_qa$/);
  client ??= await new MongoClient(
    process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27028",
  ).connect();
  return client.db(process.env.TEST_MONGODB_DB);
}
const players = async () => (await database()).collection<any>("players");
const entries = async () => (await database()).collection<any>("leagueEntries");
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
const remove = (token: string) =>
  call(token, "/me", "DELETE", { confirm: "DELETE" });
/** Last week's league, written as the server would have: players who never open the app here. */
async function lastWeek(tier: number, rows: [string, number][]) {
  const week = currentWeek().id - 1;
  const bots = rows.filter(([id]) => id.startsWith("bot-")).map(([id]) => id);
  await (
    await players()
  ).insertMany(
    bots.map((id) => ({ _id: id, name: id, country: "", coins: 0, xp: 0 })),
  );
  await (
    await entries()
  ).insertMany(
    rows.map(([playerId, coins], i) => ({
      _id: `${week}:${playerId}`,
      week,
      playerId,
      tier,
      trophies: 100,
      coins,
      scoredAt: new Date(Date.now() - 86400000 + i),
      joinedAt: new Date(Date.now() - 86400000),
    })),
  );
  return { week, bots };
}
/** Fire-and-forget league writes land just after the match result; wait for them. */
async function entryOf(playerId: string, coins = 0) {
  for (let i = 0; i < 100; i++) {
    const e = await (
      await entries()
    ).findOne({ _id: `${currentWeek().id}:${playerId}` });
    if (e && e.coins >= coins) return e;
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.fail(`no league entry for ${playerId}`);
}

test(
  "a finished week settles on the player's first request: the top zone goes up with a crate, the bottom down, once",
  skip,
  async () => {
    const [top, low] = [await guestToken(), await guestToken()];
    const [topId, lowId] = [(await me(top)).id, (await me(low)).id];
    // Twelve played Silver last week: three go up, two go down.
    const bots = Array.from(
      { length: 10 },
      (_, i) => `bot-${randomUUID()}-${i}`,
    );
    const { week } = await lastWeek(1, [
      [topId, 5000],
      ...bots.map((id, i): [string, number] => [id, 1000 - i * 100]),
      [lowId, 0],
    ]);
    await (
      await players()
    ).updateMany({ _id: { $in: [topId, lowId] } }, { $set: { leagueTier: 1 } });
    try {
      const both = await Promise.all([
        call(top, "/me/league"),
        call(top, "/me/league"),
      ]);
      for (const r of both) {
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.tier, 2);
        assert.equal(r.body.name, "Gold");
        assert.equal(r.body.league, null, "not in this week's league yet");
        assert.deepEqual(
          [r.body.last.result, r.body.last.rank, r.body.last.size],
          ["promoted", 1, 12],
        );
        assert.deepEqual(
          [r.body.last.name, r.body.last.next],
          ["Silver", "Gold"],
        );
      }
      const doc = await (await players()).findOne({ _id: topId });
      assert.deepEqual(
        doc.crates.map((c: any) => c.tier),
        ["silver"],
        "one crate, from Silver's table, however many requests raced",
      );
      assert.equal(doc.leagueWeek, week);
      const again = await call(top, "/me/league");
      assert.equal(again.body.last.granted.crate.tier, "silver");
      assert.equal((await me(top)).crates, 1, "asking again pays nothing");

      const relegated = (await call(low, "/me/league")).body;
      assert.deepEqual(
        [relegated.last.result, relegated.last.rank, relegated.tier],
        ["relegated", 12, 0],
      );
      assert.equal((await me(low)).crates, 0);
      // The other players' rows are still unsettled; settling is theirs to trigger.
      assert.equal(
        await (
          await entries()
        ).countDocuments({ week, result: { $exists: true } }),
        2,
      );
    } finally {
      await remove(top);
      await remove(low);
      await (await players()).deleteMany({ _id: { $in: bots } });
      await (await entries()).deleteMany({ week, playerId: { $in: bots } });
    }
  },
);

test(
  "matchmade online pots join and score this week's league, private rooms do not, and last week settles first",
  skip,
  async () => {
    const [ta, tb] = [await guestToken(), await guestToken()];
    const [aId, bId] = [(await me(ta)).id, (await me(tb)).id];
    // A won last week's five-player Bronze league outright, and has not opened the app since.
    const bots = Array.from(
      { length: 4 },
      (_, i) => `bot-${randomUUID()}-${i}`,
    );
    const { week } = await lastWeek(0, [
      [aId, 900],
      ...bots.map((id, i): [string, number] => [id, 300 - i * 100]),
    ]);
    const [a, b] = [await connect(ta), await connect(tb)];
    try {
      await meet(a, b);
      b.send({ t: "resign" });
      const [won] = await Promise.all([a.next("end"), b.next("end")]);
      assert.equal(won.pot, 100);
      const [ea, eb] = [await entryOf(aId, 100), await entryOf(bId)];
      assert.deepEqual(
        [ea.tier, ea.coins],
        [1, 100],
        "promoted, then joined Silver",
      );
      assert.deepEqual([eb.tier, eb.coins], [0, 0], "a loss still joins");
      assert.equal(
        (await (await players()).findOne({ _id: aId })).leagueLast.result,
        "promoted",
        "the online result settled last week before this week's entry",
      );

      const view = (await call(ta, "/me/league")).body.league;
      assert.equal(view.name, "Silver");
      assert.equal(view.crate.tier, LEAGUES[1].crate);
      const mine = view.standings.find((s: any) => s.you);
      assert.deepEqual([mine.coins, mine.name], [100, (await me(ta)).name]);
      assert.equal((await call(tb, "/me/league")).body.league.name, "Bronze");

      // A private room pays its pot but never counts here.
      a.send({ t: "room", venueId: "heritage" });
      const room = await a.next("room");
      b.send({ t: "join", code: room.code });
      await Promise.all([a.next("match"), b.next("match")]);
      b.send({ t: "resign" });
      assert.equal((await a.next("end")).pot, 100);
      await b.next("end");
      await new Promise((r) => setTimeout(r, 400));
      assert.equal((await entryOf(aId)).coins, 100);
    } finally {
      a.ws.close();
      b.ws.close();
      await remove(ta);
      await remove(tb);
      assert.equal(
        await (
          await entries()
        ).countDocuments({ playerId: { $in: [aId, bId] } }),
        0,
        "deleting an account deletes its league rows",
      );
      await (await players()).deleteMany({ _id: { $in: bots } });
      await (await entries()).deleteMany({ week, playerId: { $in: bots } });
    }
  },
);
