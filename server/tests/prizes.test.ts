import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import { passwordHash } from "../src/adminAuth";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
// A winning straight-pot shot, the same one the API integration test uses.
const POT = [{ angle: -Math.PI / 2, power: 0.22, side: 0, top: 0 }];

test(
  "coin entry fees are charged once and ranked coin prizes are paid exactly once",
  { skip: !process.env.TEST_MONGODB_DB },
  async () => {
    const dbName = process.env.TEST_MONGODB_DB!;
    assert.match(dbName, /_qa$/);
    const client = await new MongoClient(
      process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27028",
    ).connect();
    const db = client.db(dbName);
    const adminId = randomUUID(),
      username = `qa-prizes-${adminId}`,
      password = randomUUID() + randomUUID();
    let staffToken = "",
      eventId = "";
    const players: string[] = [];
    const as =
      (token: string) =>
      async (path: string, method = "GET", body?: unknown) => {
        const r = await fetch(base + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return {
          status: r.status,
          body: r.status === 204 ? null : await r.json(),
        };
      };
    const guest = async () => {
      const r = await fetch(base + "/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adultConfirmed: true }),
      });
      const created = await r.json();
      players.push(created.player.id);
      return as(created.token);
    };
    try {
      await db.collection<any>("administrators").insertOne({
        _id: adminId,
        username,
        name: "QA prizes",
        role: "owner",
        passwordHash: await passwordHash(password),
      });
      const login = await fetch(base + "/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      staffToken = (await login.json()).token;
      const admin = as(staffToken);
      const created = await admin("/admin/tournaments", "POST", {
        name: "QA coin ladder",
        subtitle: "Paid in coins",
        description: "Entry costs coins and the top two finishers are paid.",
        level: 1,
        currency: "coins",
        reward: 0,
        entry: 200,
        placements: [
          { position: 1, amount: 900 },
          { position: 2, amount: 300 },
        ],
        countries: [],
        prize: "900 and 300 coins",
        rules: ["Coin entry, coin prizes.", "Fewest shots wins."],
        startsAt: new Date(Date.now() - 60000).toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      });
      assert.equal(created.status, 201);
      eventId = created.body.id;
      // A coin competition with an entry fee and ranked coin prizes is allowed to open.
      assert.equal(
        (
          await admin(`/admin/tournaments/${eventId}/status`, "POST", {
            status: "open",
            version: 1,
          })
        ).status,
        200,
      );

      const first = await guest();
      const second = await guest();
      const entered = await first(`/tournaments/${eventId}/enter`, "POST", {
        acceptRules: true,
      });
      assert.equal(entered.status, 200);
      assert.equal(entered.body.player.coins, 800, "entry fee charged once");
      // Entering again must not take a second fee.
      await first(`/tournaments/${eventId}/enter`, "POST", {
        acceptRules: true,
      });
      assert.equal((await first("/me")).body.coins, 800);
      assert.equal(
        (
          await second(`/tournaments/${eventId}/enter`, "POST", {
            acceptRules: true,
          })
        ).body.player.coins,
        800,
      );

      assert.equal(
        (await first(`/tournaments/${eventId}/submit`, "POST", { shots: POT }))
          .status,
        200,
      );
      assert.equal(
        (await second(`/tournaments/${eventId}/submit`, "POST", { shots: POT }))
          .status,
        200,
      );

      const closed = await admin(
        `/admin/tournaments/${eventId}/status`,
        "POST",
        {
          status: "closed",
          version: 2,
        },
      );
      assert.equal(closed.status, 200);
      assert.equal(closed.body.settlement.paid.length, 2);
      const firstCoins = (await first("/me")).body.coins;
      const secondCoins = (await second("/me")).body.coins;
      assert.deepEqual(
        [firstCoins - 800, secondCoins - 800].sort((a, b) => b - a),
        [900, 300],
        "first and second place are paid their placement coins",
      );

      // Re-running settlement must pay nothing further.
      const again = await admin(`/admin/tournaments/${eventId}/settle`, "POST");
      assert.equal(again.status, 200);
      assert.equal(again.body.paid.length, 0);
      assert.equal((await first("/me")).body.coins, firstCoins);
      assert.equal((await second("/me")).body.coins, secondCoins);

      // A USDC competition still cannot be opened.
      const crypto = await admin("/admin/tournaments", "POST", {
        name: "QA USDC ladder",
        subtitle: "Must stay shut",
        description: "Real-currency prizes need eligibility work.",
        level: 1,
        currency: "USDC",
        reward: 0,
        entry: 0,
        placements: [{ position: 1, amount: 10 }],
        countries: [],
        prize: "10 USDC",
        rules: ["Eligibility required.", "Base USDC only."],
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      });
      assert.equal(
        (
          await admin(`/admin/tournaments/${crypto.body.id}/status`, "POST", {
            status: "open",
            version: 1,
          })
        ).status,
        409,
      );
      await db.collection("tournaments").deleteOne({ id: crypto.body.id });
    } finally {
      await db.collection("administrators").deleteOne({ _id: adminId } as any);
      await db.collection("adminSessions").deleteMany({ adminId });
      if (eventId) {
        await db.collection("tournaments").deleteOne({ id: eventId });
        await db.collection("entries").deleteMany({ eventId });
        await db.collection("adminAudit").deleteMany({ "event.id": eventId });
      }
      await db
        .collection("players")
        .deleteMany({ _id: { $in: players } as any });
      await client.close();
    }
  },
);
