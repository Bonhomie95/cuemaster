import { after, test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { LUCKY, luckyRing, ball } from "../../mobile/src/physics/engine";
import { replayLucky } from "../src/verify";
import { DAILY } from "../src/daily";
import { CRATES, SLOTS } from "../src/rewards";
import { randomUUID } from "node:crypto";

const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
/** Straight at the centre spot from the head spot; only the pace changes. */
const at = (power: number) => ({ angle: 0, power, side: 0, top: 0 });
const BULLSEYE = at(0.085),
  INNER = at(0.08),
  MIDDLE = at(0.07),
  OUTER = at(0.1),
  SHORT = at(0.03);
// Into the near corner pocket.
const SCRATCH = {
  angle: Math.atan2(-0.635, -0.635),
  power: 0.4,
  side: 0,
  top: 0,
};

test("the rings are fixed geometry, every ring is reachable by pace alone, and a scratch wins nothing", () => {
  assert.equal(LUCKY.rings.length, DAILY.lucky.prizes.length);
  LUCKY.rings.forEach((r, i) => assert.ok(i === 0 || r > LUCKY.rings[i - 1]));
  // The city inlay circles the foot spot at 0.2885 m; the outer ring must stay clear of it.
  assert.ok(LUCKY.rings.at(-1)! < 0.635 - 0.2885);
  for (const p of DAILY.lucky.prizes) {
    const r = p.reward;
    assert.ok((r.coins || 0) + (r.rubies || 0) > 0 || r.crate, p.label);
    if (r.crate) assert.ok(CRATES.some((c) => c.tier === r.crate));
  }
  assert.equal(DAILY.lucky.adPerDay, 2);
  // The innermost ring that contains the ball's centre wins, edges included.
  assert.equal(luckyRing(ball(0, LUCKY.rings[0], 0)), 0);
  assert.equal(luckyRing(ball(0, LUCKY.rings[0] + 1e-6, 0)), 1);
  assert.equal(luckyRing(ball(0, 0, -LUCKY.rings[3])), 3);
  assert.equal(luckyRing(ball(0, LUCKY.rings[3] + 1e-6, 0)), -1);
  assert.equal(luckyRing({ ...ball(0, 0, 0), pocketed: true }), -1);
  // A skill shot, not a draw: the same shot lands in the same place every time.
  assert.deepEqual(replayLucky(BULLSEYE), replayLucky({ ...BULLSEYE }));
  assert.deepEqual(
    [BULLSEYE, INNER, MIDDLE, OUTER, SHORT].map((s) => replayLucky(s).ring),
    [0, 1, 2, 3, -1],
  );
  const scratch = replayLucky(SCRATCH);
  assert.equal(scratch.pocketed, true);
  assert.equal(scratch.ring, -1);
  assert.throws(() => replayLucky(at(0)), /Invalid shot/);
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

test(
  "one free Lucky Shot a day pays the ring the referee's replay stops in, once",
  skip,
  async () => {
    const { id, call } = await guest();
    try {
      const board = (await call("/me/today")).body.lucky;
      assert.equal(board.free, 1);
      assert.equal(board.tokens, 0);
      assert.equal(board.adShotsLeft, DAILY.lucky.adPerDay);
      assert.deepEqual(
        board.rings.map((r: any) => [r.radius, r.label]),
        LUCKY.rings.map((r, i) => [r, DAILY.lucky.prizes[i].label]),
      );
      assert.equal(board.rings[1].crate.tier, "silver");

      const hit = await call("/me/lucky", "POST", { shot: BULLSEYE });
      assert.equal(hit.status, 200, JSON.stringify(hit.body));
      assert.equal(hit.body.ring, 0);
      assert.equal(hit.body.prize.label, "Bullseye");
      assert.ok(Math.hypot(hit.body.landing.x, hit.body.landing.z) <= 0.06);
      assert.equal(hit.body.granted.coins, 1000);
      assert.equal(hit.body.granted.rubies, 5);
      assert.equal(hit.body.player.coins, 2000);
      assert.equal(hit.body.player.rubies, 5);
      assert.equal(hit.body.today.lucky.free, 0);

      const again = await call("/me/lucky", "POST", { shot: BULLSEYE });
      assert.equal(again.status, 409);
      assert.match(again.body.error, /video/);
      assert.equal((await call("/me")).body.coins, 2000, "nothing more paid");

      // The client sends the shot, never the result.
      await edit(id, { luckyTokens: 1 });
      for (const body of [
        { shot: BULLSEYE, ring: 0 },
        { shot: { ...BULLSEYE, power: 0 } },
        { shot: { ...BULLSEYE, power: 2 } },
        {},
      ])
        assert.equal((await call("/me/lucky", "POST", body)).status, 400);
      assert.equal((await call("/me/today")).body.lucky.tokens, 1);
    } finally {
      await call("/me", "DELETE", { confirm: "DELETE" });
    }
  },
);

test(
  "video shots: one per video, capped at two a day; misses, scratches and full slots pay honestly",
  skip,
  async () => {
    const { id, call } = await guest();
    const ticket = async () =>
      (await call("/ads/reward-ticket", "POST", { purpose: "lucky" })).body
        .ticket;
    const redeem = async (t: string) =>
      (await call(`/ads/reward-ticket/${t}/redeem`, "POST", {})).status;
    try {
      await edit(id, { luckyDay: new Date().toISOString().slice(0, 10) });
      assert.equal(await redeem(await ticket()), 200);
      let board = (await call("/me/today")).body.lucky;
      assert.equal(board.tokens, 1);
      assert.equal(board.adShotsLeft, 1);

      const miss = await call("/me/lucky", "POST", { shot: SHORT });
      assert.equal(miss.status, 200, JSON.stringify(miss.body));
      assert.equal(miss.body.ring, -1);
      assert.equal(miss.body.prize, null);
      assert.deepEqual(
        [miss.body.granted.coins, miss.body.granted.rubies],
        [0, 0],
      );
      assert.equal(miss.body.player.coins, 1000);
      assert.equal(miss.body.today.lucky.tokens, 0, "the miss still spent it");

      // Two tickets redeemed at once with one video left today: one grants.
      const statuses = await Promise.all(
        [await ticket(), await ticket()].map(redeem),
      );
      assert.deepEqual(statuses.sort(), [200, 409]);
      board = (await call("/me/today")).body.lucky;
      assert.equal(board.tokens, 1);
      assert.equal(board.adShotsLeft, 0);
      assert.equal(
        (await call("/ads/reward-ticket", "POST", { purpose: "lucky" })).status,
        409,
        "a capped day refuses before the advert",
      );

      const scratch = await call("/me/lucky", "POST", { shot: SCRATCH });
      assert.equal(scratch.body.ring, -1);
      assert.equal(scratch.body.landing.pocketed, true);
      assert.equal(scratch.body.player.coins, 1000);

      // Two shots at once with one left: one is played and paid.
      await edit(id, { luckyTokens: 1 });
      const both = await Promise.all([
        call("/me/lucky", "POST", { shot: MIDDLE }),
        call("/me/lucky", "POST", { shot: MIDDLE }),
      ]);
      assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await call("/me")).body.coins, 1200);

      // The inner ring's crate takes a free slot; with every slot full it pays its stated coins.
      await edit(id, { luckyTokens: 2 });
      const crate = await call("/me/lucky", "POST", { shot: INNER });
      assert.equal(crate.body.ring, 1);
      assert.equal(crate.body.granted.crate.tier, "silver");
      assert.equal(crate.body.player.crates, 1);
      await edit(id, {
        crates: Array.from({ length: SLOTS }, () => ({
          id: randomUUID(),
          tier: "practice",
          earnedAt: new Date(),
          hoursOff: 0,
        })),
      });
      const full = await call("/me/lucky", "POST", { shot: INNER });
      assert.equal(full.body.granted.crate, null);
      assert.equal(
        full.body.granted.fallback.coins,
        DAILY.crateFallbackCoins.silver,
      );
      assert.equal(
        full.body.player.coins,
        1200 + DAILY.crateFallbackCoins.silver,
      );
      assert.equal(
        (await call("/me/lucky", "POST", { shot: OUTER })).status,
        409,
      );
    } finally {
      await call("/me", "DELETE", { confirm: "DELETE" });
    }
  },
);
