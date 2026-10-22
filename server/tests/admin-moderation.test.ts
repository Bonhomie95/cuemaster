import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import { passwordHash } from "../src/adminAuth";
// Ban, balance edits, deletion and tournament locks: the moderation tools the console exposes.
test(
  "administrators can ban, edit, delete players and lock open tournaments",
  { skip: !process.env.TEST_MONGODB_DB },
  async () => {
    const dbName = process.env.TEST_MONGODB_DB!;
    assert.match(dbName, /_qa$/);
    const client = await new MongoClient(
        process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27028",
      ).connect(),
      db = client.db(dbName);
    const id = randomUUID(),
      username = `qa-mod-${id}`,
      password = randomUUID() + randomUUID();
    let admin = "",
      playerToken = "",
      playerId = "",
      eventId = "";
    const call = async (
      token: string,
      path: string,
      method = "GET",
      body?: unknown,
    ) => {
      const r = await fetch(
        (process.env.TEST_API_URL || "http://127.0.0.1:4011") + path,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      return {
        status: r.status,
        body: r.status === 204 ? null : await r.json(),
      };
    };
    try {
      await db.collection<any>("administrators").insertOne({
        _id: id,
        username,
        name: "QA moderator",
        role: "owner",
        passwordHash: await passwordHash(password),
        mustChangePassword: false,
      });
      admin = (
        await call("", "/admin/auth/login", "POST", { username, password })
      ).body.token;
      const guest = await call("", "/auth/guest", "POST", {
        adultConfirmed: true,
      });
      playerToken = guest.body.token;
      playerId = guest.body.player.id;
      const reason = "QA moderation check";
      // Ban: access ends at once; unsuspend alone cannot lift it; unban restores it.
      assert.equal(
        (
          await call(admin, `/admin/players/${playerId}`, "PATCH", {
            banned: true,
            reason,
          })
        ).status,
        200,
      );
      assert.equal((await call(playerToken, "/me")).status, 401);
      playerToken = (
        await call("", "/auth/guest", "POST", { adultConfirmed: true })
      ).body.token;
      const banned = await db
        .collection<any>("players")
        .findOne({ _id: playerId });
      assert.equal(banned.banned, true);
      assert.equal(banned.suspended, true);
      assert.equal(
        (
          await call(admin, `/admin/players/${playerId}`, "PATCH", {
            suspended: false,
            reason,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(admin, `/admin/players/${playerId}`, "PATCH", {
            banned: false,
            coins: 4321,
            xp: 250,
            reason,
          })
        ).status,
        200,
      );
      const edited = await db
        .collection<any>("players")
        .findOne({ _id: playerId });
      assert.equal(edited.suspended, false);
      assert.equal(edited.coins, 4321);
      assert.equal(edited.xp, 250);
      // Lock: an open event refuses entries until unlocked, without being closed.
      const data = {
        name: "QA lock competition",
        subtitle: "Lock and unlock",
        description: "Isolated QA tournament lock fixture",
        level: 1,
        currency: "coins",
        reward: 10,
        entry: 0,
        prize: "10 coins on completion",
        rules: ["Pot the target", "One rack"],
        startsAt: new Date(Date.now() - 60000).toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      };
      const created = await call(admin, "/admin/tournaments", "POST", data);
      eventId = created.body.id;
      for (const status of ["announced", "open"]) {
        const r = await call(
          admin,
          `/admin/tournaments/${eventId}/status`,
          "POST",
          {
            status,
            version: (
              await db.collection<any>("tournaments").findOne({ id: eventId })
            ).version,
          },
        );
        assert.equal(r.status, 200, status);
      }
      let version = (
        await db.collection<any>("tournaments").findOne({ id: eventId })
      ).version;
      const locked = await call(
        admin,
        `/admin/tournaments/${eventId}/lock`,
        "POST",
        {
          locked: true,
          version,
          reason,
        },
      );
      assert.equal(locked.status, 200);
      assert.equal(locked.body.locked, true);
      const me = (await call(playerToken, "/me")).body;
      assert.equal(
        (
          await call(playerToken, `/tournaments/${eventId}/enter`, "POST", {
            acceptRules: true,
          })
        ).status,
        409,
        "locked events refuse entries " + me.id,
      );
      version = locked.body.version;
      assert.equal(
        (
          await call(admin, `/admin/tournaments/${eventId}/lock`, "POST", {
            locked: false,
            version,
            reason,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(playerToken, `/tournaments/${eventId}/enter`, "POST", {
            acceptRules: true,
          })
        ).status,
        200,
      );
      // Delete: the account and its session are gone; the audit log keeps the record.
      assert.equal(
        (await call(admin, `/admin/players/${playerId}`, "DELETE", { reason }))
          .status,
        200,
      );
      assert.equal(
        await db.collection("players").countDocuments({ _id: playerId as any }),
        0,
      );
      assert.ok(
        (await call(admin, "/admin/audit")).body.some(
          (r: any) =>
            r.action === "player.deleted" && r.player?.id === playerId,
        ),
      );
    } finally {
      await db.collection<any>("administrators").deleteMany({ _id: id });
      await db.collection("adminSessions").deleteMany({ adminId: id });
      for (const pid of [playerId, (await call(playerToken, "/me")).body?.id])
        if (pid) {
          await db.collection("players").deleteOne({ _id: pid });
          await db.collection("sessions").deleteMany({ playerId: pid });
          await db.collection("entries").deleteMany({ playerId: pid });
        }
      if (eventId) {
        await db.collection("tournaments").deleteOne({ id: eventId });
        await db.collection("entries").deleteMany({ eventId });
        await db.collection("adminAudit").deleteMany({ "player.id": playerId });
      }
      await client.close();
    }
  },
);
