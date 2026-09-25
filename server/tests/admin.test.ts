import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import { passwordHash } from "../src/adminAuth";
// Administrator tests only seed an explicitly selected isolated QA database.
test(
  "administrator sessions, draft isolation, edit conflicts and cash-event activation guard",
  { skip: !process.env.TEST_MONGODB_DB },
  async () => {
    const dbName = process.env.TEST_MONGODB_DB!;
    assert.match(dbName, /_qa$/);
    const client = await new MongoClient(
        process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27028",
      ).connect(),
      db = client.db(dbName);
    const id = randomUUID(),
      username = `qa-${id}`,
      password = randomUUID() + randomUUID();
    let token = "",
      eventId = "",
      staffId = "";
    const call = async (path: string, method = "GET", body?: unknown) => {
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
        name: "QA owner",
        role: "owner",
        passwordHash: await passwordHash(password),
        mustChangePassword: true,
      });
      token = (await call("/admin/auth/login", "POST", { username, password }))
        .body.token;
      assert.equal((await call("/admin/overview")).status, 403);
      const nextPassword = randomUUID() + randomUUID();
      assert.equal(
        (
          await call("/admin/auth/password", "POST", {
            currentPassword: password,
            newPassword: nextPassword,
          })
        ).status,
        204,
      );
      assert.equal((await call("/admin/overview")).status, 401);
      token = (
        await call("/admin/auth/login", "POST", {
          username,
          password: nextPassword,
        })
      ).body.token;
      assert.equal((await call("/admin/overview")).status, 200);
      assert.equal((await call("/me")).status, 401);
      const staff = await call("/admin/staff", "POST", {
        username: `staff-${id}`,
        name: "QA staff",
        email: "qa@example.invalid",
      });
      assert.equal(staff.status, 201);
      staffId = staff.body.id;
      const ownerToken = token;
      token = (
        await call("/admin/auth/login", "POST", {
          username: `staff-${id}`,
          password: staff.body.temporaryPassword,
        })
      ).body.token;
      assert.equal((await call("/admin/overview")).status, 403);
      const staffPassword = randomUUID() + randomUUID();
      assert.equal(
        (
          await call("/admin/auth/password", "POST", {
            currentPassword: staff.body.temporaryPassword,
            newPassword: staffPassword,
          })
        ).status,
        204,
      );
      token = (
        await call("/admin/auth/login", "POST", {
          username: `staff-${id}`,
          password: staffPassword,
        })
      ).body.token;
      assert.equal((await call("/admin/overview")).status, 200);
      assert.equal((await call("/admin/staff")).status, 403);
      assert.equal(
        (
          await call("/admin/staff", "POST", {
            username: "forbidden-staff",
            name: "Forbidden",
            email: "qa@example.invalid",
          })
        ).status,
        403,
      );
      const staffToken = token;
      token = ownerToken;
      assert.equal(
        (
          await call(`/admin/staff/${id}`, "PATCH", {
            disabled: true,
            reason: "Protect owner account",
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await call(`/admin/staff/${staffId}`, "PATCH", {
            disabled: true,
            reason: "End QA staff access",
          })
        ).status,
        200,
      );
      token = staffToken;
      assert.equal((await call("/admin/overview")).status, 401);
      token = ownerToken;
      const data = {
        name: "QA prize competition",
        subtitle: "A draft only",
        description: "Isolated QA tournament test fixture",
        level: 5,
        currency: "USDC",
        reward: 0,
        entry: 250,
        placements: [
          { position: 1, amount: 25 },
          { position: 3, amount: 5 },
        ],
        countries: ["US"],
        prize: "25 USDC first place",
        rules: ["Eligibility required", "Base USDC only"],
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
      };
      const created = await call("/admin/tournaments", "POST", data);
      assert.equal(created.status, 201);
      eventId = created.body.id;
      assert.ok(
        !(await call("/catalog")).body.tournaments.some(
          (e: any) => e.id === eventId,
        ),
      );
      assert.equal(
        (
          await call(`/admin/tournaments/${eventId}`, "PATCH", {
            version: 1,
            data: { ...data, entry: 500 },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(`/admin/tournaments/${eventId}`, "PATCH", {
            version: 1,
            data,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(`/admin/tournaments/${eventId}/status`, "POST", {
            version: 2,
            status: "open",
          })
        ).status,
        409,
      );
      assert.equal(
        (await call(`/admin/tournaments/${eventId}/audit`)).body.length,
        2,
      );
      // Deleting a tournament: stale version refused, entered events protected,
      // draft removed, and the removal permanently recorded in the audit log.
      assert.equal(
        (
          await call(`/admin/tournaments/${eventId}`, "DELETE", {
            version: 1,
            reason: "Stale version must be refused",
          })
        ).status,
        409,
      );
      await db.collection<any>("entries").insertOne({
        _id: randomUUID(),
        playerId: `qa-player-${id}`,
        eventId,
        joinedAt: new Date(),
      });
      assert.equal(
        (
          await call(`/admin/tournaments/${eventId}`, "DELETE", {
            version: 2,
            reason: "Entered events must be protected",
          })
        ).status,
        409,
      );
      await db.collection("entries").deleteMany({ eventId });
      assert.equal(
        (
          await call(`/admin/tournaments/${eventId}`, "DELETE", {
            version: 2,
            reason: "Remove the QA draft",
          })
        ).status,
        200,
      );
      assert.equal(
        (await call(`/admin/tournaments/${eventId}/audit`)).status,
        404,
      );
      const log = await call("/admin/audit");
      assert.ok(
        log.body.some(
          (r: any) =>
            r.event?.id === eventId && r.action === "tournament.deleted",
        ),
      );
      assert.equal((await call("/admin/auth/logout", "POST")).status, 204);
      assert.equal((await call("/admin/overview")).status, 401);
    } finally {
      await db
        .collection<any>("administrators")
        .deleteMany({ _id: { $in: [id, staffId] } });
      await db
        .collection("adminSessions")
        .deleteMany({ adminId: { $in: [id, staffId] } });
      if (eventId) {
        await db.collection("tournaments").deleteOne({ id: eventId });
        await db.collection("adminAudit").deleteMany({ "event.id": eventId });
        await db.collection("entries").deleteMany({ eventId });
      }
      await client.close();
    }
  },
);
