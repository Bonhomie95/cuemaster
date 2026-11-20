// Plays an online match against the live server exactly as the phone does (same Session, same
// reconcile) and reports every server state that is non-finite or disagrees with the phone.
// Run from mobile/: npx tsx ../tools/online-probe.mts   (makes a guest, queues at heritage, resigns)
import { Session } from "../mobile/src/game/session";
import { planCpuShot, cpuPlacement } from "../mobile/src/game/cpu";
const API = "https://cuemaster-api.onrender.com";
const t0 = Date.now();
const log = (...a: any[]) =>
  console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), ...a);
const r = await fetch(API + "/auth/guest", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ adultConfirmed: true }),
});
const { token } = (await r.json()) as any;
const ws = new WebSocket(API.replace(/^http/, "ws") + "/live");
const send = (m: any) => ws.send(JSON.stringify(m));
const s = new Session();
const finite = (balls: any[]) =>
  balls.every((b) => Number.isFinite(b.x) && Number.isFinite(b.z));
const pock = (balls: any[]) =>
  balls
    .filter((b) => b.pocketed)
    .map((b) => b.id)
    .join(",") || "-";
const orig = s.loadTableState.bind(s);
s.loadTableState = (state: any, mirror = false) => {
  const diffs = s.world.balls
    .filter((b) => {
      const o = state.balls.find((x: any) => x.id === b.id);
      return (
        o &&
        (b.pocketed !== o.pocketed || Math.hypot(b.x - o.x, b.z - o.z) > 1e-3)
      );
    })
    .map((b) => b.id);
  log(
    `  ADOPT server table (mirror=${mirror}) server groups=${JSON.stringify(state.progress.groups)} turn=${state.progress.turn} | local groups=${JSON.stringify(s.progress.groups)} turn=${s.progress.turn} | balls differing: ${diffs.join(",") || "none"} | server finite=${finite(state.balls)}`,
  );
  return orig(state, mirror);
};
let match: any = null,
  acts = 0,
  done = false,
  lastShot = 0;
ws.onopen = () => send({ t: "hello", token });
ws.onmessage = (ev: any) => {
  const m = JSON.parse(String(ev.data));
  switch (m.t) {
    case "welcome":
      log("welcome; queueing at heritage");
      send({ t: "queue", venueId: "heritage" });
      break;
    case "queued":
      log("queued");
      break;
    case "match":
      match = m;
      log(
        `match: seat ${m.seat} vs ${m.opponent?.name} (house=${!!m.opponent?.house}) resume=${m.state !== undefined}`,
      );
      s.cpu = null;
      s.matchRules = true;
      s.reset("break");
      s.remote = { ...m.opponent, seat: 1 - m.seat };
      if (m.state) {
        s.localSeq = m.seq;
        s.loadTableState(m.state, m.seat === 1);
      } else {
        s.progress.turn = m.seat === 0 ? 0 : 1;
        s.localSeq = 0;
      }
      s.onAction = (a: any) => {
        if (a.t !== "timeout") {
          send({ t: "act", action: a });
          log(`  sent ${a.t}`);
        }
      };
      break;
    case "act": {
      acts++;
      const mine = match && m.seat === match.seat && !m.auto;
      const nul = m.state.balls
        .filter(
          (b: any) =>
            b.x == null ||
            b.z == null ||
            !Number.isFinite(b.x) ||
            !Number.isFinite(b.z),
        )
        .map((b: any) => b.id);
      log(
        `act seq=${m.seq} seat=${m.seat}${m.auto ? " auto" : ""} ${m.action.t}${mine ? " (mine)" : ""} | non-finite balls: ${nul.join(",") || "none"} | pocketed=${pock(m.state.balls)} groups=${JSON.stringify(m.state.progress.groups)} turn=${m.state.progress.turn} foul="${m.state.progress.foul}" placement=${m.state.placement}`,
      );
      if (mine) s.confirmed.set(m.seq, m.state);
      else s.inbox.push({ seq: m.seq, action: m.action, state: m.state });
      break;
    }
    case "reject":
      log("REJECT:", m.message);
      s.inbox = s.inbox.filter((x) => x.seq > m.seq);
      s.confirmed.clear();
      s.localSeq = m.seq;
      s.loadTableState(m.state, match?.seat === 1);
      break;
    case "end":
      log("end:", JSON.stringify(m).slice(0, 220));
      done = true;
      break;
    case "error":
      log("ERROR:", m.message);
      break;
    case "aim":
      break;
    default:
      log("msg", m.t, JSON.stringify(m).slice(0, 140));
  }
};
const timer = setInterval(() => {
  if (!match || done) return;
  s.update(0.016);
  const bad = s.world.balls
    .filter((b) => !Number.isFinite(b.x) || !Number.isFinite(b.z))
    .map((b) => b.id);
  if (bad.length) log("LOCAL non-finite balls:", bad.join(","));
  if (
    !s.running &&
    !s.cpuTurn &&
    s.progress.turn === 0 &&
    !s.progress.finished
  ) {
    if (s.progress.breakChoice) {
      s.resolveBreak("accept");
      log("  resolved break choice: accept");
    } else if (s.placement) {
      const p = cpuPlacement(s.world.balls, s.headStringPlacement);
      if (p) {
        s.placeCue(p.x, p.z);
        log("  placed cue ball");
      }
    } else if (!s.inbox.length && Date.now() - lastShot > 2500) {
      const plan = planCpuShot(
        s.world.balls,
        s.progress,
        0.6,
        s.shots === 0,
        Math.random,
        "steady",
      );
      Object.assign(s, {
        angle: plan.angle,
        power: plan.power,
        side: plan.side,
        top: plan.top,
      });
      s.shoot();
      lastShot = Date.now();
      log(
        `  my shot #${s.shots} power=${plan.power.toFixed(2)} | local groups=${JSON.stringify(s.progress.groups)} turn=${s.progress.turn} pocketed=${pock(s.world.balls)}`,
      );
    }
  }
  if (acts >= 12 || done || Date.now() - t0 > 170000) {
    clearInterval(timer);
    log(
      `leaving. local groups=${JSON.stringify(s.progress.groups)} turn=${s.progress.turn} pocketed=${pock(s.world.balls)} shots=${s.shots}`,
    );
    send({ t: "resign" });
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 1500);
  }
}, 16);
setTimeout(() => {
  log("timeout; leaving");
  try {
    send({ t: "resign" });
  } catch {}
  setTimeout(() => process.exit(0), 1000);
}, 185000);
