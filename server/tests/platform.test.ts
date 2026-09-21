import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import { eventInput, eventIsOpen } from "../src/platform";
const base = process.env.TEST_API_URL || "http://127.0.0.1:4000";
const draft = {
  name: "QA tournament",
  subtitle: "Verified challenge",
  description: "A server verified test competition.",
  level: 1,
  currency: "USDC",
  reward: 0,
  entry: 100,
  placements: [{ position: 1, amount: 25 }],
  countries: ["US"],
  prize: "25 USDC to first place",
  rules: ["Adults only", "Eligibility required"],
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 86400000).toISOString(),
};
test("tournament schema rejects duplicate ranks, invalid money precision and reversed dates", () => {
  assert.ok(eventInput.safeParse(draft).success);
  assert.equal(
    eventInput.safeParse({
      ...draft,
      placements: [
        { position: 1, amount: 1 },
        { position: 1, amount: 2 },
      ],
    }).success,
    false,
  );
  assert.equal(
    eventInput.safeParse({
      ...draft,
      placements: [{ position: 1, amount: 0.1234567 }],
    }).success,
    false,
  );
  assert.equal(
    eventInput.safeParse({
      ...draft,
      currency: "coins",
      placements: [{ position: 1, amount: 1.5 }],
    }).success,
    false,
  );
  assert.equal(
    eventInput.safeParse({ ...draft, endsAt: draft.startsAt }).success,
    false,
  );
  assert.equal(eventIsOpen({ ...draft, status: "open" }), false);
  assert.equal(
    eventIsOpen({ ...draft, status: "open", currency: "coins" }),
    false,
  );
  assert.equal(
    eventIsOpen({
      ...draft,
      status: "open",
      currency: "coins",
      entry: 0,
      placements: [],
      countries: [],
    }),
    true,
  );
});
test("wallet ownership proof is account bound, single use, network constrained; players cannot administer", async () => {
  let token = "";
  const call = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  token = (await call("/auth/guest", "POST", { adultConfirmed: true })).body
    .token;
  try {
    assert.equal((await call("/admin/overview")).status, 401);
    assert.equal((await call("/admin/tournaments", "POST", draft)).status, 401);
    assert.equal((await call("/me/usdc")).body.payoutsEnabled, false);
    assert.equal(
      (
        await call("/me/usdc", "PUT", {
          network: "tron",
          address: "Tinvalid",
          acknowledgeNetwork: true,
        })
      ).status,
      400,
    );
    const wallet = Wallet.createRandom(),
      other = Wallet.createRandom();
    assert.equal(
      (
        await call("/me/usdc", "PUT", {
          network: "base",
          address: wallet.address,
          acknowledgeNetwork: true,
        })
      ).status,
      200,
    );
    const challenge = (await call("/me/usdc/challenge", "POST")).body;
    assert.equal(
      (
        await call("/me/usdc/verify", "POST", {
          id: challenge.id,
          signature: await other.signMessage(challenge.message),
        })
      ).status,
      400,
    );
    const proof = {
      id: challenge.id,
      signature: await wallet.signMessage(challenge.message),
    };
    assert.equal((await call("/me/usdc/verify", "POST", proof)).status, 200);
    assert.equal((await call("/me/usdc")).body.wallet.verified, true);
    assert.equal((await call("/me/usdc/verify", "POST", proof)).status, 400);
    await call("/me/usdc", "PUT", {
      network: "base",
      address: other.address,
      acknowledgeNetwork: true,
    });
    assert.equal((await call("/me/usdc")).body.wallet.verified, false);
    assert.equal((await call("/me/usdc", "DELETE")).status, 204);
    assert.equal((await call("/me/usdc")).body.wallet, null);
  } finally {
    await call("/me", "DELETE", { confirm: "DELETE" });
  }
});
test("blocking removes another player from ranking and can be undone", async () => {
  const request = async (
    token: string,
    path: string,
    method = "GET",
    body?: unknown,
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  const a = (await request("", "/auth/guest", "POST", { adultConfirmed: true }))
    .body;
  const b = (await request("", "/auth/guest", "POST", { adultConfirmed: true }))
    .body;
  try {
    const id = b.player.id;
    assert.equal(
      (await request(a.token, `/players/${id}/block`, "POST")).status,
      200,
    );
    assert.ok(
      !(await request(a.token, "/leaderboard")).body.players.some(
        (p: any) => p.id === id,
      ),
    );
    assert.ok(
      (await request(a.token, "/me/blocked")).body.players.some(
        (p: any) => p.id === id,
      ),
    );
    assert.equal(
      (
        await request(a.token, `/players/${id}/report`, "POST", {
          reason: "name",
          details: "Test report",
        })
      ).status,
      201,
    );
    assert.equal(
      (await request(a.token, `/players/${id}/block`, "DELETE")).status,
      204,
    );
    assert.equal(
      (await request(a.token, "/me/blocked")).body.players.length,
      0,
    );
  } finally {
    await request(a.token, "/me", "DELETE", { confirm: "DELETE" });
    await request(b.token, "/me", "DELETE", { confirm: "DELETE" });
  }
});
