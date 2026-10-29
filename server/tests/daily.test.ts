import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { dailyKey } from "../src/catalog";
import { currentSeason } from "../src/season";
import { CRATES, SLOTS } from "../src/rewards";
import {
  DAILY,
  nextStreakDay,
  pickMissions,
  rollWheel,
  tierOf,
  type Reward,
} from "../src/daily";
import { winVerifiedRack } from "./playCpu";

const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
// The straight pot the other suites use: it clears the "pocket" drill.
const POT = [{ angle: -Math.PI / 2, power: 0.22, side: 0, top: 0 }];
const shift = (days: number) =>
  dailyKey(new Date(Date.now() + days * 86400000));

/** Something the server can actually pay: whole amounts and a crate tier that exists. */
function assertPayable(r: Reward) {
  assert.ok((r.coins || 0) + (r.rubies || 0) > 0 || r.crate, JSON.stringify(r));
  for (const n of [r.coins || 0, r.rubies || 0])
    assert.ok(Number.isInteger(n) && n >= 0, JSON.stringify(r));
  if (r.crate)
    assert.ok(
      CRATES.some((c) => c.tier === r.crate),
      `unknown crate ${r.crate}`,
    );
}

test("the streak advances on consecutive days, wraps after day seven and resets after a gap", () => {
  const today = "2026-10-29";
  assert.equal(nextStreakDay(undefined, today), 1, "a first claim is day one");
  assert.equal(nextStreakDay({ day: 3, date: "2026-10-28" }, today), 4);
  assert.equal(nextStreakDay({ day: 7, date: "2026-10-28" }, today), 1);
  assert.equal(nextStreakDay({ day: 5, date: "2026-10-27" }, today), 1);
  assert.equal(nextStreakDay({ day: 6, date: "2026-09-01" }, today), 1);
  assert.equal(nextStreakDay({ day: 2, date: today }, today), null);
  // Calendar days in UTC, across month, year and leap-day boundaries.
  assert.equal(nextStreakDay({ day: 1, date: "2026-12-31" }, "2027-01-01"), 2);
  assert.equal(nextStreakDay({ day: 4, date: "2028-02-28" }, "2028-02-29"), 5);
  assert.equal(DAILY.streak.length, 7);
  DAILY.streak.forEach(assertPayable);
});

test("missions are distinct, stable for a player and a day, and always include an easy one", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const id = randomUUID(),
      date = shift(i % 40);
    const picks = pickMissions(id, date);
    assert.deepEqual(
      picks.map((m) => m.id),
      pickMissions(id, date).map((m) => m.id),
      "the board is derived, not stored, so the same inputs must pick the same set",
    );
    assert.equal(picks.length, DAILY.missions.perDay);
    assert.equal(new Set(picks.map((m) => m.id)).size, picks.length);
    assert.ok(
      picks.some((m) => m.easy),
      "every board has an easy mission",
    );
    picks.forEach((m) => seen.add(m.id));
  }
  assert.equal(seen.size, DAILY.missions.pool.length, "the whole pool is used");
  const player = randomUUID();
  const boards = new Set(
    Array.from({ length: 30 }, (_, i) =>
      pickMissions(player, shift(i))
        .map((m) => m.id)
        .join(),
    ),
  );
  assert.ok(boards.size > 5, "a player's board changes from day to day");
  for (const m of DAILY.missions.pool) {
    // Ids and events become Mongo field names, so they must stay plain words.
    assert.match(m.id, /^[a-z0-9]+$/);
    assert.match(m.event, /^[a-z_]+$/);
    assert.ok(m.goal >= 1 && m.passXp > 0);
    assertPayable(m.reward);
  }
});

test("the wheel's weights total 100 and every prize is something the server can pay", () => {
  assert.equal(DAILY.wheel.length, 8);
  assert.equal(
    DAILY.wheel.reduce((sum, w) => sum + w.weight, 0),
    100,
  );
  for (const w of DAILY.wheel) {
    assert.ok(w.weight > 0 && w.label);
    assertPayable(w.reward);
  }
  const hits = new Array(DAILY.wheel.length).fill(0);
  const rolls = 20000;
  for (let i = 0; i < rolls; i++) hits[rollWheel()]++;
  hits.forEach((n, i) =>
    assert.ok(
      Math.abs(n / rolls - DAILY.wheel[i].weight / 100) < 0.02,
      `segment ${i} came up ${n} times`,
    ),
  );
});

test("pass tiers are 250 XP apart and premium is worth far more than free", () => {
  assert.equal(DAILY.pass.free.length, 30);
  assert.equal(DAILY.pass.premium.length, 30);
  assert.equal(DAILY.pass.xpPerTier, 250);
  assert.equal(tierOf(0), 0);
  assert.equal(tierOf(249), 0);
  assert.equal(tierOf(250), 1);
  assert.equal(tierOf(7499), 29);
  assert.equal(tierOf(7500), 30);
  assert.equal(tierOf(1e9), 30, "the last tier is the cap");
  const sum = (rows: Reward[]) => ({
    coins: rows.reduce((t, r) => t + (r.coins || 0), 0),
    rubies: rows.reduce((t, r) => t + (r.rubies || 0), 0),
    crates: rows.filter((r) => r.crate).length,
  });
  const free = sum(DAILY.pass.free),
    premium = sum(DAILY.pass.premium);
  assert.ok(premium.coins >= 2 * free.coins);
  assert.ok(premium.rubies >= 5 * free.rubies);
  assert.ok(premium.crates >= 2 * free.crates);
  assert.deepEqual(DAILY.pass.premium[29], { crate: "master", rubies: 50 });
  [...DAILY.pass.free, ...DAILY.pass.premium].forEach(assertPayable);
  // A full rack of slots must never beat opening them: a fallback pays at most the crate's floor.
  for (const crate of CRATES) {
    const fallback = (DAILY.crateFallbackCoins as Record<string, number>)[
      crate.tier
    ];
    assert.ok(fallback > 0 && fallback <= crate.coins[0], crate.tier);
  }
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
after(() => client?.close());

async function guest() {
  const created = await fetch(base + "/auth/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adultConfirmed: true }),
  }).then((r) => r.json());
  const call = (path: string, method = "GET", body?: unknown) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${created.token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (r) => ({
      status: r.status,
      body: r.status === 204 ? null : await r.json(),
    }));
  return { id: created.player.id as string, call };
}
const edit = async (id: string, fields: object) =>
  (await players()).updateOne({ _id: id }, { $set: fields });
/** Mission tracking is fire-and-forget, so wait for its write rather than racing it. */
async function progress(id: string, event: string, atLeast: number) {
  for (let i = 0; i < 100; i++) {
    const n =
      (await (await players()).findOne({ _id: id }))?.missions?.progress?.[
        event
      ] || 0;
    if (n >= atLeast) return n;
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.fail(`${event} never reached ${atLeast}`);
}

test(
  "the login streak pays once a day, advances on consecutive days and resets after a gap",
  skip,
  async () => {
    const { id, call } = await guest();
    try {
      const first = await call("/me/streak/claim", "POST", {});
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.equal(first.body.day, 1);
      assert.equal(first.body.granted.coins, 100);
      assert.equal(first.body.player.coins, 1100);
      assert.equal(first.body.today.streak.claimedToday, true);
      assert.equal(first.body.today.pass.xp, DAILY.passXp.streakClaim);
      const again = await call("/me/streak/claim", "POST", {});
      assert.equal(again.status, 409);
      assert.equal(again.body.today.streak.day, 1);
      assert.equal(
        (await call("/me")).body.coins,
        1100,
        "the second tap paid nothing",
      );

      // Claimed yesterday: today is the next day.
      await edit(id, { loginStreak: { day: 1, date: shift(-1) } });
      assert.equal((await call("/me/today")).body.streak.day, 2);
      const second = await call("/me/streak/claim", "POST", {});
      assert.equal(second.body.day, 2);
      assert.equal(second.body.player.coins, 1250);
      // Day seven wraps round to day one.
      await edit(id, { loginStreak: { day: 7, date: shift(-1) } });
      assert.equal((await call("/me/streak/claim", "POST", {})).body.day, 1);
      // Any missed day starts again from day one.
      await edit(id, { loginStreak: { day: 4, date: shift(-2) } });
      assert.equal((await call("/me/streak/claim", "POST", {})).body.day, 1);

      // Two taps at once: the stored date is compare-and-swapped, so only one pays.
      await edit(id, { loginStreak: { day: 2, date: shift(-1) } });
      const before = (await call("/me")).body;
      const both = await Promise.all([
        call("/me/streak/claim", "POST", {}),
        call("/me/streak/claim", "POST", {}),
      ]);
      assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
      const after = (await call("/me")).body;
      assert.equal(
        after.rubies,
        before.rubies + 2,
        "day three pays two rubies, once",
      );
      assert.equal(after.coins, before.coins);
      assert.equal(
        (await call("/me/streak/claim", "POST", { day: 7 })).status,
        400,
        "the client cannot choose its day",
      );
    } finally {
      await call("/me", "DELETE", { confirm: "DELETE" });
    }
  },
);

test(
  "a crate reward with every slot full pays its stated coins instead",
  skip,
  async () => {
    const { id, call } = await guest();
    try {
      const full = Array.from({ length: SLOTS }, () => ({
        id: randomUUID(),
        tier: "practice",
        earnedAt: new Date(),
        hoursOff: 0,
      }));
      await edit(id, {
        crates: full,
        loginStreak: { day: 4, date: shift(-1) },
      });
      const board = (await call("/me/today")).body;
      assert.equal(
        board.streak.rewards[4].crate.fallbackCoins,
        DAILY.crateFallbackCoins.club,
        "the fallback is stated before the claim",
      );
      assert.deepEqual(board.slots, { held: SLOTS, max: SLOTS });
      const club = await call("/me/streak/claim", "POST", {});
      assert.equal(club.body.day, 5);
      assert.equal(club.body.granted.crate, null);
      assert.deepEqual(club.body.granted.fallback, {
        tier: "club",
        name: "Club crate",
        coins: DAILY.crateFallbackCoins.club,
      });
      assert.equal(
        club.body.player.coins,
        1000 + DAILY.crateFallbackCoins.club,
      );
      assert.equal(club.body.player.crates, SLOTS);

      // With a slot free, the same kind of reward is a real crate.
      await edit(id, {
        crates: full.slice(1),
        loginStreak: { day: 6, date: shift(-1) },
      });
      const big = await call("/me/streak/claim", "POST", {});
      assert.equal(big.body.day, 7);
      assert.deepEqual(big.body.granted.crate, {
        tier: "silver",
        name: "Silver crate",
      });
      assert.equal(big.body.granted.fallback, null);
      assert.equal(big.body.granted.rubies, 5);
      assert.equal(big.body.player.crates, SLOTS);
      assert.equal(big.body.player.rubies, 5);
    } finally {
      await call("/me", "DELETE", { confirm: "DELETE" });
    }
  },
);

test("the free gift cools down between claims", skip, async () => {
  const { id, call } = await guest();
  try {
    const first = await call("/me/gift/claim", "POST", {});
    assert.equal(first.status, 200);
    assert.equal(first.body.granted.coins, DAILY.gift.coins);
    assert.equal(first.body.player.coins, 1000 + DAILY.gift.coins);
    const readyAt = Date.parse(first.body.today.gift.readyAt);
    assert.ok(
      Math.abs(readyAt - (Date.now() + DAILY.gift.hours * 3600000)) < 60000,
    );
    const early = await call("/me/gift/claim", "POST", {});
    assert.equal(early.status, 409);
    assert.equal(Date.parse(early.body.readyAt), readyAt);
    assert.equal((await call("/me")).body.coins, 1000 + DAILY.gift.coins);
    await edit(id, {
      giftAt: new Date(Date.now() - DAILY.gift.hours * 3600000 - 1000),
    });
    assert.equal((await call("/me/today")).body.gift.readyAt, null);
    assert.equal((await call("/me/gift/claim", "POST", {})).status, 200);
    assert.equal((await call("/me")).body.coins, 1000 + 2 * DAILY.gift.coins);
  } finally {
    await call("/me", "DELETE", { confirm: "DELETE" });
  }
});

test(
  "one free spin a day, one more per rewarded video, and the video cap holds under a race",
  skip,
  async () => {
    const { id, call } = await guest();
    /** The spin pays exactly its segment, and the balance moves by exactly what it reports. */
    const spin = async () => {
      const before = (await call("/me")).body;
      const r = await call("/me/spin", "POST", {});
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const segment = DAILY.wheel[r.body.index];
      assert.ok(segment, "the index is a real segment");
      assert.equal(r.body.prize.label, segment.label);
      const g = r.body.granted;
      assert.equal(g.rubies, segment.reward.rubies || 0);
      assert.equal(
        g.coins,
        (segment.reward.coins || 0) + (g.fallback ? g.fallback.coins : 0),
      );
      assert.equal((g.crate || g.fallback)?.tier, segment.reward.crate);
      assert.equal(r.body.player.coins, before.coins + g.coins);
      assert.equal(r.body.player.rubies, before.rubies + g.rubies);
      return r.body;
    };
    const ticket = async () =>
      (await call("/ads/reward-ticket", "POST", { purpose: "spin" })).body
        .ticket;
    const redeem = async (t: string) =>
      (await call(`/ads/reward-ticket/${t}/redeem`, "POST", {})).status;
    try {
      const first = await spin();
      assert.equal(first.today.spin.free, 0);
      assert.equal(first.today.spin.tokens, 0);
      const none = await call("/me/spin", "POST", {});
      assert.equal(none.status, 409);
      assert.match(none.body.error, /video/);

      // One rewarded video grants exactly one more spin.
      assert.equal(await redeem(await ticket()), 200);
      const board = (await call("/me/today")).body.spin;
      assert.equal(board.tokens, 1);
      assert.equal(board.adSpinsLeft, DAILY.spins.adPerDay - 1);
      assert.equal((await spin()).today.spin.tokens, 0);
      assert.equal((await call("/me/spin", "POST", {})).status, 409);

      // Three more tickets redeemed at once: only the two the daily cap still allows grant.
      const racing = [await ticket(), await ticket(), await ticket()];
      const statuses = await Promise.all(racing.map(redeem));
      assert.deepEqual(statuses.sort(), [200, 200, 409]);
      const capped = (await call("/me/today")).body.spin;
      assert.equal(capped.tokens, 2);
      assert.equal(capped.adSpinsLeft, 0);
      assert.equal(
        (await call("/ads/reward-ticket", "POST", { purpose: "spin" })).status,
        409,
        "a capped day refuses before the advert is shown",
      );
      assert.equal(
        (
          await call("/ads/reward-ticket", "POST", {
            purpose: "spin",
            crateId: randomUUID(),
          })
        ).status,
        400,
        "a ticket pays for one thing",
      );
      await spin();
      await spin();
      assert.equal((await call("/me/spin", "POST", {})).status, 409);
      // Every spin was counted toward the "spin the wheel" mission inside its own write.
      assert.equal(
        (await (await players()).findOne({ _id: id })).missions.progress
          .wheel_spun,
        4,
      );
    } finally {
      await call("/me", "DELETE", { confirm: "DELETE" });
    }
  },
);

test(
  "verified practice advances a mission, claims pay once, the bonus needs all three, and the pass pays per tier",
  skip,
  async () => {
    const created = await guest();
    const { call } = created;
    // The board is picked from the player id. Move this guest to an id whose board includes the
    // drills mission, so the test exercises the real practice route without depending on luck.
    const date = dailyKey();
    let id = randomUUID();
    while (!pickMissions(id, date).some((m) => m.id === "drills2"))
      id = randomUUID();
    const col = await players();
    const doc = await col.findOne({ _id: created.id });
    await col.insertOne({ ...doc, _id: id });
    await col.deleteOne({ _id: created.id });
    await (
      await database()
    )
      .collection("sessions")
      .updateMany({ playerId: created.id }, { $set: { playerId: id } });
    const clear = async () => {
      const start = await call("/practice/start", "POST", {
        tableId: "heritage",
        challengeId: "pocket",
      });
      const body = { ticket: start.body.ticket, shots: POT };
      const done = await call("/practice/complete", "POST", body);
      assert.equal(done.status, 200, JSON.stringify(done.body));
      return body;
    };
    try {
      const board = pickMissions(id, date);
      const first = await clear();
      await progress(id, "practice_clear", 1);
      assert.equal(
        (await call("/me/missions/drills2/claim", "POST", {})).status,
        409,
        "one clear of two is not complete",
      );
      // A retried submission of the same run is the same clear.
      assert.equal(
        (await call("/practice/complete", "POST", first)).status,
        200,
      );
      await clear();
      await progress(id, "practice_clear", 2);
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(await progress(id, "practice_clear", 0), 2);

      const coins = (await call("/me")).body.coins;
      const claims = await Promise.all([
        call("/me/missions/drills2/claim", "POST", {}),
        call("/me/missions/drills2/claim", "POST", {}),
      ]);
      assert.deepEqual(claims.map((r) => r.status).sort(), [200, 409]);
      const paid = claims.find((r) => r.status === 200)!.body;
      assert.equal(paid.granted.coins, 150);
      assert.equal(paid.granted.passXp, 100);
      assert.equal((await call("/me")).body.coins, coins + 150);
      assert.equal(
        paid.today.missions.list.find((m: any) => m.id === "drills2").claimed,
        true,
      );
      assert.equal((await call("/me/missions/bonus", "POST", {})).status, 409);
      const off = DAILY.missions.pool.find(
        (m) => !board.some((b) => b.id === m.id),
      )!;
      assert.equal(
        (await call(`/me/missions/${off.id}/claim`, "POST", {})).status,
        404,
        "only today's board can be claimed",
      );

      // The other two need gameplay this suite does not drive, so complete them in storage.
      const others = board.filter((m) => m.id !== "drills2");
      const goals: Record<string, number> = {};
      for (const m of others)
        goals[`missions.progress.${m.event}`] = Math.max(
          goals[`missions.progress.${m.event}`] || 0,
          m.goal,
        );
      await edit(id, goals);
      for (const m of others)
        assert.equal(
          (await call(`/me/missions/${m.id}/claim`, "POST", {})).status,
          200,
        );
      const bonus = await call("/me/missions/bonus", "POST", {});
      assert.equal(bonus.status, 200, JSON.stringify(bonus.body));
      assert.equal(bonus.body.granted.crate.tier, "silver");
      assert.equal(bonus.body.granted.passXp, DAILY.missions.bonus.passXp);
      assert.equal(bonus.body.today.missions.bonus.claimed, true);
      assert.equal((await call("/me/missions/bonus", "POST", {})).status, 409);

      // Pass XP: each mission's share plus the bonus.
      const xp =
        board.reduce((sum, m) => sum + m.passXp, 0) +
        DAILY.missions.bonus.passXp;
      const pass = bonus.body.today.pass;
      assert.equal(pass.xp, xp);
      assert.equal(pass.tier, Math.floor(xp / 250));
      assert.ok(pass.tier >= 1);
      assert.equal(pass.season, currentSeason().id);
      assert.equal(pass.rewards.length, 30);
      assert.equal(pass.premium, false);

      const tier1 = await Promise.all([
        call("/me/pass/claim", "POST", { tier: 1, track: "free" }),
        call("/me/pass/claim", "POST", { tier: 1, track: "free" }),
      ]);
      assert.deepEqual(tier1.map((r) => r.status).sort(), [200, 409]);
      const freePaid = tier1.find((r) => r.status === 200)!.body;
      assert.equal(freePaid.granted.coins, DAILY.pass.free[0].coins);
      assert.deepEqual(freePaid.today.pass.claimed.free, [1]);
      assert.equal(
        (await call("/me/pass/claim", "POST", { tier: 30, track: "free" }))
          .status,
        409,
        "an unreached tier pays nothing",
      );
      assert.equal(
        (await call("/me/pass/claim", "POST", { tier: 31, track: "free" }))
          .status,
        400,
      );
      const locked = await call("/me/pass/claim", "POST", {
        tier: 1,
        track: "premium",
      });
      assert.equal(locked.status, 403, "premium is refused until it is owned");

      // Billing sets this for the season it sells; last season's purchase is not this one's.
      await edit(id, { passPremiumSeason: currentSeason().id - 1 });
      assert.equal(
        (await call("/me/pass/claim", "POST", { tier: 1, track: "premium" }))
          .status,
        403,
      );
      await edit(id, { passPremiumSeason: currentSeason().id });
      const premium = await call("/me/pass/claim", "POST", {
        tier: 1,
        track: "premium",
      });
      assert.equal(premium.status, 200, JSON.stringify(premium.body));
      assert.equal(premium.body.granted.rubies, DAILY.pass.premium[0].rubies);
      assert.equal(premium.body.today.pass.premium, true);
      assert.equal(
        (await call("/me/pass/claim", "POST", { tier: 1, track: "premium" }))
          .status,
        409,
      );

      // A new season starts a fresh track: last season's progress reads as zero and pays nothing.
      await edit(id, { "pass.season": currentSeason().id - 1 });
      const fresh = (await call("/me/today")).body.pass;
      assert.equal(fresh.xp, 0);
      assert.deepEqual(fresh.claimed, { free: [], premium: [] });
      assert.equal(
        (await call("/me/pass/claim", "POST", { tier: 1, track: "free" }))
          .status,
        409,
      );
    } finally {
      await call("/me", "DELETE", { confirm: "DELETE" });
    }
  },
);

test(
  "refereed CPU results count toward missions and the pass; only a verified win is a win",
  skip,
  async () => {
    const { id, call } = await guest();
    try {
      const won = await winVerifiedRack(call);
      // Match stats are written by the finish itself; tracking follows it, fire-and-forget.
      const played = (await (await players()).findOne({ _id: id })).stats
        .cpuMatches;
      assert.ok(played >= 1);
      assert.equal(await progress(id, "match_played", played), played);
      assert.equal(await progress(id, "match_won", 1), 1);
      const xp = played * DAILY.passXp.cpuMatch + DAILY.passXp.verifiedWin;
      let doc: any = null;
      for (let i = 0; i < 100 && doc?.pass?.xp !== xp; i++) {
        if (doc) await new Promise((r) => setTimeout(r, 30));
        doc = await (await players()).findOne({ _id: id });
      }
      assert.equal(doc.pass.xp, xp);

      // Finishing the same match again changes nothing.
      await call(`/local-matches/${won.body.match.id}/finish`, "POST", {
        outcome: "won",
        actions: [],
      });
      // A claimed win the referee cannot confirm counts as a match played, never as a win.
      const start = await call("/local-matches/start", "POST", {
        venueId: "heritage",
        requestId: randomUUID(),
        mode: "cpu",
      });
      const forged = await call(
        `/local-matches/${start.body.match.id}/finish`,
        "POST",
        { outcome: "won", actions: [] },
      );
      assert.equal(forged.body.verified, false);
      await progress(id, "match_played", played + 1);
      await new Promise((r) => setTimeout(r, 200));
      doc = await (await players()).findOne({ _id: id });
      assert.equal(doc.missions.progress.match_played, played + 1);
      assert.equal(doc.missions.progress.match_won, 1);
      assert.equal(
        doc.pass.xp,
        (played + 1) * DAILY.passXp.cpuMatch + DAILY.passXp.verifiedWin,
      );
    } finally {
      await call("/me", "DELETE", { confirm: "DELETE" });
    }
  },
);

test("a video tops up coins, three times a day", async () => {
  const r = await fetch(base + "/auth/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adultConfirmed: true }),
  });
  const { token, player } = await r.json();
  const call = async (path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  for (let i = 0; i < 3; i++) {
    const t = await call("/ads/reward-ticket", { purpose: "coins" });
    assert.equal(t.status, 201);
    assert.equal(
      (await call(`/ads/reward-ticket/${t.body.ticket}/redeem`)).status,
      200,
    );
  }
  assert.equal(
    (await call("/ads/reward-ticket", { purpose: "coins" })).status,
    409,
  );
  const me = await fetch(base + "/me", {
    headers: { Authorization: `Bearer ${token}` },
  }).then((res) => res.json());
  assert.equal(me.coins, player.coins + 450);
});
