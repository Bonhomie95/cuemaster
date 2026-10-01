import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import { passwordHash } from "../src/adminAuth";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test(
  "series events: join deadline, player cap, seeded rival, frame ledger, auto close, cancel refunds",
  { skip: !process.env.TEST_MONGODB_DB },
  async () => {
    const dbName = process.env.TEST_MONGODB_DB!;
    assert.match(dbName, /_qa$/);
    const client = await new MongoClient(
      process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27028",
    ).connect();
    const db = client.db(dbName);
    const adminId = randomUUID(),
      username = `qa-series-${adminId}`,
      password = randomUUID() + randomUUID();
    const eventIds: string[] = [],
      players: string[] = [];
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
        name: "QA series",
        role: "owner",
        passwordHash: await passwordHash(password),
      });
      const login = await fetch(base + "/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const admin = as((await login.json()).token);
      const draft = (over: Record<string, unknown>) => ({
        name: "QA best of three",
        subtitle: "Two seats, one rival each",
        description: "Best-of-three frames against a seeded club rival.",
        level: 1,
        currency: "coins",
        format: "series",
        bestOf: 3,
        maxPlayers: 2,
        minPlayers: 2,
        reward: 0,
        entry: 100,
        placements: [{ position: 1, amount: 150 }],
        countries: [],
        prize: "150 coins",
        rules: ["Best of three.", "Abandoned frames are forfeits."],
        ...over,
      });
      // Validation: the join deadline cannot come after the start, and a placement cannot
      // exceed the number of seats.
      const bad = await admin(
        "/admin/tournaments",
        "POST",
        draft({
          registrationClosesAt: new Date(Date.now() + 5000).toISOString(),
          startsAt: new Date(Date.now() + 1000).toISOString(),
          endsAt: new Date(Date.now() + 9000).toISOString(),
        }),
      );
      assert.equal(bad.status, 400);
      assert.match(bad.body.error, /deadline/i);
      assert.equal(
        (
          await admin(
            "/admin/tournaments",
            "POST",
            draft({
              placements: [{ position: 3, amount: 10 }],
              startsAt: new Date(Date.now() + 1000).toISOString(),
              endsAt: new Date(Date.now() + 9000).toISOString(),
            }),
          )
        ).status,
        400,
      );

      const wait = 1400,
        play = 2600;
      const created = await admin(
        "/admin/tournaments",
        "POST",
        draft({
          startsAt: new Date(Date.now() + wait).toISOString(),
          endsAt: new Date(Date.now() + wait + play).toISOString(),
        }),
      );
      assert.equal(created.status, 201);
      const id = created.body.id;
      eventIds.push(id);
      assert.equal(created.body.format, "series");
      assert.equal(created.body.joinDeadline, created.body.startsAt);
      assert.equal(
        (
          await admin(`/admin/tournaments/${id}/status`, "POST", {
            status: "open",
            version: 1,
          })
        ).status,
        200,
      );

      const a = await guest(),
        b = await guest(),
        c = await guest();
      const joinedA = await a(`/tournaments/${id}/enter`, "POST", {
        acceptRules: true,
      });
      assert.equal(joinedA.status, 200);
      assert.equal(joinedA.body.player.coins, 900);
      assert.equal(joinedA.body.phase, "registration");
      assert.equal(
        (await b(`/tournaments/${id}/enter`, "POST", { acceptRules: true }))
          .status,
        200,
      );
      // The third player is turned away before any coins move.
      const full = await c(`/tournaments/${id}/enter`, "POST", {
        acceptRules: true,
      });
      assert.equal(full.status, 409);
      assert.match(full.body.error, /places are taken/);
      assert.equal((await c("/me")).body.coins, 1000);
      // Frames cannot start before play opens, and the rival is already fixed.
      const early = await a(`/tournaments/${id}/frames/start`, "POST", {});
      assert.equal(early.status, 409);
      const detail = await a(`/tournaments/${id}`);
      assert.equal(detail.body.phase, "registration");
      assert.equal(detail.body.entrants, 2);
      assert.equal(detail.body.series.bestOf, 3);
      assert.equal(detail.body.series.opponent.kind, "cpu");

      await sleep(wait + 100);
      // The scheduler is off in tests; the console's "run now" endpoint stands in for it.
      await admin("/admin/tournaments/lifecycle", "POST");
      assert.equal(
        (await admin("/admin/tournaments")).body.find((e: any) => e.id === id)
          .status,
        "open",
        "an event with enough entrants is not cancelled at the start",
      );
      // Late entry is refused now the deadline has passed.
      assert.equal(
        (await c(`/tournaments/${id}/enter`, "POST", { acceptRules: true }))
          .status,
        409,
      );
      const f1 = await a(`/tournaments/${id}/frames/start`, "POST", {});
      assert.equal(f1.status, 201);
      assert.equal(f1.body.number, 1);
      assert.ok(Number.isInteger(f1.body.frame.seed));
      // Only one frame is live at a time.
      assert.equal(
        (await a(`/tournaments/${id}/frames/start`, "POST", {})).status,
        409,
      );
      // A win claimed faster than a frame can be played is recorded as a loss.
      const fast = await a(
        `/tournaments/${id}/frames/${f1.body.frame.id}/finish`,
        "POST",
        {
          outcome: "won",
        },
      );
      assert.equal(fast.status, 200);
      assert.equal(fast.body.recorded, "lost");
      assert.equal(fast.body.flag, "fast");
      assert.equal(fast.body.series.losses, 1);
      // The same frame cannot be recorded twice.
      assert.equal(
        (
          await a(
            `/tournaments/${id}/frames/${f1.body.frame.id}/finish`,
            "POST",
            {
              outcome: "won",
            },
          )
        ).status,
        404,
      );
      for (const n of [2, 3]) {
        const f = await a(`/tournaments/${id}/frames/start`, "POST", {});
        assert.equal(f.status, 201);
        assert.equal(f.body.number, n);
        await sleep(450);
        const r = await a(
          `/tournaments/${id}/frames/${f.body.frame.id}/finish`,
          "POST",
          {
            outcome: "won",
          },
        );
        assert.equal(r.body.recorded, "won");
      }
      const doneA = await a(`/tournaments/${id}`);
      assert.equal(doneA.body.series.done, true);
      assert.equal(doneA.body.series.wins, 2);
      assert.equal(
        (await a(`/tournaments/${id}/frames/start`, "POST", {})).status,
        409,
        "a decided series takes no more frames",
      );
      // B forfeits one frame and loses another: 0-2, ranked below A's 2-1.
      const fb = await b(`/tournaments/${id}/frames/start`, "POST", {});
      await b(`/tournaments/${id}/frames/${fb.body.frame.id}/finish`, "POST", {
        outcome: "forfeit",
      });
      const fb2 = await b(`/tournaments/${id}/frames/start`, "POST", {});
      await b(`/tournaments/${id}/frames/${fb2.body.frame.id}/finish`, "POST", {
        outcome: "lost",
      });
      const board = (await a(`/tournaments/${id}`)).body.leaderboard;
      assert.equal(board.length, 2);
      assert.equal(board[0].wins, 2);
      assert.equal(board[1].wins, 0);

      // The close arrives; the scheduler closes and pays without anyone clicking.
      const untilClose = Date.parse(created.body.endsAt) - Date.now() + 100;
      if (untilClose > 0) await sleep(untilClose);
      const acted = await admin("/admin/tournaments/lifecycle", "POST");
      assert.ok(
        acted.body.acted.some((x: any) => x.id === id && x.action === "closed"),
      );
      const closed = (await admin("/admin/tournaments")).body.find(
        (e: any) => e.id === id,
      );
      assert.equal(closed.status, "closed");
      assert.equal(closed.payouts.length, 1);
      assert.equal((await a("/me")).body.coins, 900 + 150);
      assert.equal((await b("/me")).body.coins, 900);
      // Re-settling pays nothing more; frames no longer count after the close.
      assert.equal(
        (await admin(`/admin/tournaments/${id}/settle`, "POST")).body.paid
          .length,
        0,
      );
      assert.equal(
        (await b(`/tournaments/${id}/frames/start`, "POST", {})).status,
        409,
      );

      // Too few entrants at the start: cancelled by the scheduler, fee refunded once.
      const lonely = await admin(
        "/admin/tournaments",
        "POST",
        draft({
          name: "QA lonely series",
          minPlayers: 2,
          startsAt: new Date(Date.now() + 700).toISOString(),
          endsAt: new Date(Date.now() + 60000).toISOString(),
        }),
      );
      eventIds.push(lonely.body.id);
      await admin(`/admin/tournaments/${lonely.body.id}/status`, "POST", {
        status: "open",
        version: 1,
      });
      assert.equal(
        (
          await c(`/tournaments/${lonely.body.id}/enter`, "POST", {
            acceptRules: true,
          })
        ).body.player.coins,
        900,
      );
      await sleep(800);
      await admin("/admin/tournaments/lifecycle", "POST");
      await admin("/admin/tournaments/lifecycle", "POST");
      const cancelled = (await admin("/admin/tournaments")).body.find(
        (e: any) => e.id === lonely.body.id,
      );
      assert.equal(cancelled.status, "cancelled");
      assert.equal(
        (await c("/me")).body.coins,
        1000,
        "entry fee refunded once",
      );
      assert.equal(
        (await c(`/tournaments/${lonely.body.id}`)).body.phase,
        "cancelled",
      );

      // A manual cancellation of a live event also refunds, and needs a reason.
      const manual = await admin(
        "/admin/tournaments",
        "POST",
        draft({
          name: "QA manual cancel",
          minPlayers: 1,
          startsAt: new Date(Date.now() + 60000).toISOString(),
          endsAt: new Date(Date.now() + 120000).toISOString(),
        }),
      );
      eventIds.push(manual.body.id);
      await admin(`/admin/tournaments/${manual.body.id}/status`, "POST", {
        status: "open",
        version: 1,
      });
      await c(`/tournaments/${manual.body.id}/enter`, "POST", {
        acceptRules: true,
      });
      assert.equal((await c("/me")).body.coins, 900);
      assert.equal(
        (
          await admin(`/admin/tournaments/${manual.body.id}/status`, "POST", {
            status: "cancelled",
            version: 2,
          })
        ).status,
        400,
      );
      const refunded = await admin(
        `/admin/tournaments/${manual.body.id}/status`,
        "POST",
        {
          status: "cancelled",
          version: 2,
          reason: "QA: venue change",
        },
      );
      assert.equal(refunded.status, 200);
      assert.equal(refunded.body.settlement.refunded.length, 1);
      assert.equal((await c("/me")).body.coins, 1000);
    } finally {
      await db.collection("administrators").deleteOne({ _id: adminId } as any);
      await db.collection("adminSessions").deleteMany({ adminId });
      await db.collection("tournaments").deleteMany({ id: { $in: eventIds } });
      await db.collection("entries").deleteMany({ eventId: { $in: eventIds } });
      await db
        .collection("adminAudit")
        .deleteMany({ "event.id": { $in: eventIds } });
      await db
        .collection("players")
        .deleteMany({ _id: { $in: players } as any });
      await client.close();
    }
  },
);
