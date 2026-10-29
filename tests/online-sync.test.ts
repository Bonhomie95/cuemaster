import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Session,
  perform,
  replayMatch,
  seededRandom,
} from "../mobile/src/game/session";
import { makeCpu, planCpuShot, cpuPlacement } from "../mobile/src/game/cpu";
import { localWinner } from "../mobile/src/game/localMatch";
import { H } from "../mobile/src/physics/engine";

const headless = () => {
  const s = new Session();
  s.matchRules = true;
  s.now = () => 0;
  s.reset("break");
  return s;
};
const settle = (s: Session) => {
  let n = 0;
  while (s.running && n++ < 20000) s.update(0.1);
};

test("a table state round-trips, and mirroring swaps the seats", () => {
  const s = headless();
  perform(s, { t: "shot", angle: 0, power: 1, side: 0, top: 0 });
  settle(s);
  s.progress.groups = ["solids", "stripes"];
  const state = s.tableState();
  const copy = headless();
  copy.loadTableState(state);
  assert.ok(copy.matches(state));
  const mirrored = headless();
  mirrored.loadTableState(state, true);
  assert.equal(mirrored.progress.turn, 1 - s.progress.turn);
  assert.deepEqual(mirrored.progress.groups, ["stripes", "solids"]);
  assert.ok(mirrored.matches(state, true));
  assert.ok(!mirrored.matches(state, false));
});

test("an opponent's move from the inbox plays out and lands on the server's table", () => {
  // The "server": seat 0 breaks.
  const server = headless();
  perform(server, { t: "shot", angle: 0.01, power: 0.95, side: 0, top: 0 });
  settle(server);
  // The phone in seat 1 sees itself as player 0, so the breaker is its player 1.
  const phone = headless();
  phone.remote = {
    seat: 0,
    name: "Ada",
    avatar: 1,
    country: "NG",
    level: 3,
    trophies: 48,
  };
  phone.progress.turn = 1;
  assert.ok(
    phone.cpuTurn,
    "input is locked while the opponent holds the table",
  );
  phone.inbox.push({
    seq: 1,
    action: { t: "shot", angle: 0.01, power: 0.95, side: 0, top: 0 },
    state: server.tableState(),
  });
  phone.update(1 / 60);
  assert.equal(phone.localSeq, 1);
  assert.ok(phone.running, "the shot animates instead of jumping");
  for (let i = 0; i < 4000 && phone.running; i++) phone.update(1 / 60);
  phone.update(1 / 60);
  assert.ok(phone.matches(server.tableState(), true));
  // A table that drifted is replaced by the server's.
  phone.world.balls[3].x += 0.01;
  phone.confirmed.set(1, server.tableState());
  phone.update(1 / 60);
  assert.ok(phone.matches(server.tableState(), true));
  assert.equal(phone.confirmed.size, 0);
});

test("the player's own moves are sent once, and timeouts never are", () => {
  const s = headless();
  s.remote = {
    seat: 1,
    name: "Bo",
    avatar: 0,
    country: "",
    level: 1,
    trophies: 0,
  };
  const sent: string[] = [];
  s.onAction = (a) => sent.push(a.t);
  s.placement = s.headStringPlacement = true;
  assert.ok(s.placeCue(-H / 2 - 0.05, 0.1));
  s.power = 0.8;
  s.shoot();
  assert.deepEqual(sent, ["place", "shot"]);
  assert.equal(s.localSeq, 2);
  settle(s);
  // The clock runs out on the phone, but only the server may call time online.
  s.progress.turn = 0;
  s.turnDeadline = 1;
  s.now = () => 10_000_000;
  s.updateClock();
  assert.equal(s.progress.turn, 0);
  assert.deepEqual(sent, ["place", "shot"]);
});

test("moving the cue ball before the break no longer voids a verified CPU win", () => {
  for (let seed = 1; seed < 40; seed++) {
    const opponent = makeCpu({}, seed);
    const s = new Session();
    s.cpu = opponent;
    s.matchRules = true;
    s.rng = seededRandom(seed);
    s.now = () => 0;
    s.reset("break");
    s.placement = s.headStringPlacement = true;
    assert.ok(s.placeCue(-H / 2 - 0.02, 0.05));
    s.angle = 0.007;
    s.power = 0.9;
    s.shoot();
    const run = () => {
      let n = 0;
      while ((s.running || s.cpuTurn) && n++ < 20000) s.update(0.1);
    };
    run();
    for (let turn = 0; turn < 80 && !s.progress.finished; turn++) {
      if (s.progress.breakChoice) s.resolveBreak("accept");
      if (s.placement) {
        const pos = cpuPlacement(s.world.balls, s.headStringPlacement);
        if (!pos || !s.placeCue(pos.x, pos.z)) break;
      }
      Object.assign(
        s,
        planCpuShot(s.world.balls, s.progress, 0.98, false, () => 0.5),
      );
      s.shoot();
      run();
    }
    if (localWinner(s.progress) !== 0) continue;
    assert.equal(s.actions[0].t, "place");
    const verdict = replayMatch(opponent, seed, s.actions);
    assert.equal(verdict.winner, 0, "the referee accepts the moved break");
    return;
  }
  assert.fail("no won rack to check in 40 seeds");
});
