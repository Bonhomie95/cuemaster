import { CpuOpponent, CpuShot, planCpuShot, cpuPlacement } from "./cpu";
import { cueById } from "./cues";
import { World, drill, P, Ball, ball, R, H, W } from "../physics/engine";
import { Progress } from "./progress";
import { localWinner } from "./localMatch";
import { aimGuide } from "../render/aimGuide";
export type Shot = { angle: number; power: number; side: number; top: number };
/** A table at rest: everything needed to rebuild it on another device. */
export type TableState = {
  balls: Ball[];
  progress: Record<string, any>;
  placement: boolean;
  headStringPlacement: boolean;
  shots: number;
};
/** An online opponent. Their actions arrive from the server instead of being planned here. */
export type RemoteOpponent = {
  seat: number;
  name: string;
  avatar: number;
  country: string;
  level: number;
  trophies: number;
};
/** Everything the player decided in a match; the server replays these with the same CPU seed. */
export type Action =
  | ({ t: "shot" } & Shot)
  | { t: "place"; x: number; z: number }
  | {
      t: "break";
      choice: "spot" | "rerack" | "opponent-break" | "accept" | "hand";
    }
  | { t: "timeout" };
/** Same LCG as the rack jitter: tiny, deterministic, identical on device and server. */
export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** A replay is a drill plus the shots; floats are written in full so the physics re-run exactly. */
export function encodeReplay(drill: string, shots: Shot[]) {
  return `CM1:${drill}:${shots
    .map((s) => [s.angle, s.power, s.side, s.top].join(","))
    .join(";")}`;
}
export function decodeReplay(code: string) {
  const m = code.trim().match(/^CM1:([a-z0-9:-]+):(.+)$/i);
  if (!m) return null;
  const shots = m[2].split(";").map((p) => {
    const [angle, power, side, top] = p.split(",").map(Number);
    return { angle, power, side, top };
  });
  if (
    !shots.length ||
    shots.length > 12 ||
    shots.some((s) => !Object.values(s).every(Number.isFinite))
  )
    return null;
  return { drill: m[1], shots };
}
const pocketNames = [
  [-H, -W, "top-left corner"],
  [0, -W, "top middle"],
  [H, -W, "top-right corner"],
  [-H, W, "bottom-left corner"],
  [0, W, "bottom middle"],
  [H, W, "bottom-right corner"],
] as [number, number, string][];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export type Skin = {
  id: string;
  name: string;
  subtitle: string;
  cloth: string;
  cushion: string;
  /** The rails: wood, lacquer or stone. */
  wood: string;
  /** Pocket caps and rail bindings. */
  metal: string;
  /** The landmark on the cloth and the rail sights. */
  inlay: string;
  swatch: string;
};
/**
 * One table per city, coloured from the place itself (flag, landmark, street colours). Every
 * cloth keeps all fifteen balls readable: its worst colour difference from any ball is at
 * least 25 (CIE76).
 */
const skin = (
  id: string,
  name: string,
  subtitle: string,
  cloth: string,
  cushion: string,
  wood: string,
  metal: string,
  inlay: string,
): Skin => ({
  id,
  name,
  subtitle,
  cloth,
  cushion,
  wood,
  metal,
  inlay,
  swatch: cloth,
});
export const skins: Skin[] = [
  // Green-white-green, iroko rails, the Lekki bridge lit white.
  skin(
    "heritage",
    "Lagos",
    "IROKO · NAIJA GREEN · WHITE",
    "#1a9a58",
    "#0e5c36",
    "#3a2418",
    "#e3e7e9",
    "#f2f4ef",
  ),
  // Black cab rails, bus-red caps, Big Ben gold.
  skin(
    "riviera",
    "London",
    "BLACK CAB · BUS RED · THAMES BLUE",
    "#087fab",
    "#0d4d68",
    "#141619",
    "#c8202d",
    "#e7c46a",
  ),
  // La vie en rose: Eiffel iron, gilded bridges, Haussmann cream.
  skin(
    "oxblood",
    "Paris",
    "EIFFEL IRON · GILDED GOLD · ROSE",
    "#b8456e",
    "#6a2340",
    "#3b3633",
    "#d9b25a",
    "#f3e6c9",
  ),
  // Cherry blossom cloth, urushi black lacquer, torii vermilion.
  skin(
    "midnight",
    "Tokyo",
    "BLACK LACQUER · TORII RED · SAKURA",
    "#b86a8c",
    "#6d3a52",
    "#121215",
    "#e0482e",
    "#fbe3ea",
  ),
  // Desert dune, black marble, the gold souk, Burj glass.
  skin(
    "jade",
    "Dubai",
    "BLACK MARBLE · GOLD · DESERT DUNE",
    "#b08548",
    "#6b4f28",
    "#17191c",
    "#e9c76b",
    "#e8eef4",
  ),
  // Manhattan steel, black rails, taxi yellow.
  skin(
    "champion",
    "New York",
    "TAXI YELLOW · MANHATTAN STEEL",
    "#3f5a72",
    "#24384a",
    "#121314",
    "#f2b705",
    "#dde3e8",
  ),
  // Fynbos sage, Table Mountain sandstone, protea pink.
  skin(
    "capetown",
    "Cape Town",
    "TABLE MOUNTAIN · PROTEA · FYNBOS",
    "#6f9580",
    "#3f5a4b",
    "#6f6252",
    "#d8578f",
    "#f6f1ec",
  ),
  // Brazil green, canarinho yellow, the flag's blue globe.
  skin(
    "rio",
    "Rio de Janeiro",
    "CANARINHO YELLOW · BRAZIL GREEN",
    "#3a9a3e",
    "#1f5e24",
    "#d6a42a",
    "#22408f",
    "#f7f8f4",
  ),
  // Pyramid limestone, Tutankhamun's lapis and gold, faience turquoise.
  skin(
    "cairo",
    "Cairo",
    "LAPIS · PHARAOH GOLD · LIMESTONE",
    "#9c8f78",
    "#5e5444",
    "#1f3a7a",
    "#e3b84f",
    "#4fc3c0",
  ),
  // Peacock teal, rosewood, saffron and marigold.
  skin(
    "mumbai",
    "Mumbai",
    "ROSEWOOD · SAFFRON · PEACOCK TEAL",
    "#0e8a8f",
    "#08494c",
    "#3a1c1c",
    "#f08a1f",
    "#ffbe3b",
  ),
  // Colosseum travertine, terracotta roofs, olive groves.
  skin(
    "rome",
    "Rome",
    "TRAVERTINE · TERRACOTTA · OLIVE",
    "#5f7a32",
    "#34441b",
    "#c2b394",
    "#c4643a",
    "#e8c983",
  ),
  // Harbour blue, sandstone, Opera House sails.
  skin(
    "sydney",
    "Sydney",
    "HARBOUR BLUE · SANDSTONE · SAIL WHITE",
    "#2f86e0",
    "#1a4f8a",
    "#c9b38a",
    "#f1f4f7",
    "#f4f8fb",
  ),
  // Red and white flag, orchid lavender.
  skin(
    "singapore",
    "Singapore",
    "WHITE LACQUER · FLAG RED · ORCHID",
    "#8f78d0",
    "#4e3f80",
    "#e6e3e8",
    "#e1373f",
    "#fff3f6",
  ),
  // Riva-boat mahogany, Monaco red, casino gold.
  skin(
    "monaco",
    "Monaco",
    "RIVA MAHOGANY · MONACO RED · PLATINUM",
    "#6b7380",
    "#3d434c",
    "#5b2618",
    "#d82b3a",
    "#f0d27a",
  ),
];
export class Session {
  /** Injected so a headless replay on the server makes the same CPU decisions. */
  rng: () => number = Math.random;
  now: () => number = Date.now;
  actions: Action[] = [];
  /** A shared replay queued for playback; cleared by reset. */
  queue: Shot[] = [];
  queueWait = 0;
  imported = false;
  /** The leader's verified shots, run on a parallel table and drawn as a ghost cue ball. */
  ghost: { shots: Shot[]; world: World } | null = null;
  coach: string | null = null;
  contact: { id: number; x: number; z: number; vx: number; vz: number } | null =
    null;
  cpu: CpuOpponent | null = null;
  cpuWait = 0;
  cpuPlan: CpuShot | null = null;
  cpuSerial = -1;
  remote: RemoteOpponent | null = null;
  /** Every action the local player makes, so an online match can send it to the server. */
  onAction: ((a: Action) => void) | null = null;
  /**
   * Online sync. `localSeq` counts actions applied on this device (the player's own are applied
   * at once, before the server confirms them). The server numbers every action it accepts and
   * sends the table it computed; once this device has played the same action out, it adopts
   * that table if its own result differs, so float drift between phones can never split a game.
   */
  localSeq = 0;
  inbox: { seq: number; action: Action; state: TableState }[] = [];
  confirmed = new Map<number, TableState>();
  remoteAim: Shot | null = null;
  applyingInbox = false;
  /** True whenever the opponent, computer or online, holds the table. Input is locked then. */
  get cpuTurn() {
    return (
      (!!this.cpu || !!this.remote) &&
      this.progress.turn === 1 &&
      !this.progress.finished
    );
  }
  get opponentName() {
    return this.cpu?.name || this.remote?.name || "Player 2";
  }
  record(a: Action) {
    this.actions.push(a);
    if (this.applyingInbox) return;
    // Timeouts are decided by the server in an online match and arrive through the inbox.
    if (this.remote && a.t !== "timeout") this.localSeq++;
    this.onAction?.(a);
  }
  /**
   * Rebuild an unfinished rack from its recorded actions: the same deterministic replay the
   * referee runs, on this table, so a match survives the app being closed. The clock stands
   * still while catching up, and the action log comes out identical to the one recorded.
   */
  restore(actions: Action[]) {
    const now = this.now,
      onAction = this.onAction;
    this.now = () => 0;
    this.onAction = null;
    this.actions = [];
    const settle = () => {
      let n = 0;
      while ((this.running || this.cpuTurn) && n++ < 20000) this.update(0.1);
    };
    try {
      for (const a of actions) {
        settle();
        if (this.progress.finished) break;
        perform(this, a);
      }
      settle();
    } finally {
      this.now = now;
      this.onAction = onAction;
      this.snapDrops = true;
      this.resetTurnClock();
      this.notify();
    }
  }
  /** Leave online mode; called when a match ends or the player leaves the table. */
  endOnline() {
    this.remote = null;
    this.onAction = null;
    this.inbox = [];
    this.confirmed.clear();
    this.localSeq = 0;
    this.remoteAim = null;
  }
  tableState(): TableState {
    return {
      balls: this.world.balls.map((b) => ({ ...b })),
      progress: JSON.parse(JSON.stringify(this.progress)),
      placement: this.placement,
      headStringPlacement: this.headStringPlacement,
      shots: this.shots,
    };
  }
  /** Adopt a table from the server. `mirror` swaps the seats: this device is always player 0. */
  loadTableState(state: TableState, mirror = false) {
    const p = Object.assign(new Progress(), state.progress);
    p.groups = [...state.progress.groups] as Progress["groups"];
    p.returned = [...state.progress.returned];
    p.shotPots = [...state.progress.shotPots];
    p.rails = [...state.progress.rails];
    if (mirror) {
      p.turn = 1 - p.turn;
      p.breakShooter = 1 - p.breakShooter;
      p.groups = [p.groups[1], p.groups[0]];
    }
    this.progress = p;
    this.world = new World(state.balls);
    this.previous = this.world.balls.map((b) => ({ ...b }));
    this.placement = state.placement;
    this.headStringPlacement = state.headStringPlacement;
    this.shots = state.shots;
    this.potted = p.returned.length;
    this.running = false;
    this.accumulator = 0;
    this.alpha = 1;
    this.snapDrops = true;
    this.notify();
  }
  /** Same table to within a tenth of a millimetre, and the same rules state. */
  matches(state: TableState, mirror = false) {
    const mine = this.tableState();
    const turn = mirror ? 1 - state.progress.turn : state.progress.turn;
    const groups = mirror
      ? [state.progress.groups[1], state.progress.groups[0]]
      : state.progress.groups;
    return (
      mine.progress.turn === turn &&
      mine.progress.finished === state.progress.finished &&
      mine.progress.breakChoice === state.progress.breakChoice &&
      mine.progress.foul === state.progress.foul &&
      mine.placement === state.placement &&
      JSON.stringify(mine.progress.groups) === JSON.stringify(groups) &&
      JSON.stringify([...mine.progress.returned].sort()) ===
        JSON.stringify([...state.progress.returned].sort()) &&
      state.balls.every((b) => {
        const a = mine.balls.find((m) => m.id === b.id);
        return (
          !!a &&
          a.pocketed === b.pocketed &&
          (b.pocketed ||
            (Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.z - b.z) < 1e-4))
        );
      })
    );
  }
  /** Apply confirmed opponent actions in order and reconcile with the server's tables. */
  updateRemote(dt: number) {
    if (!this.remote || this.running) return;
    const mirror = this.remote.seat === 0;
    const state = this.confirmed.get(this.localSeq);
    if (state) {
      if (!this.matches(state, mirror)) {
        devAdopt(this, state, mirror, "reconcile");
        this.loadTableState(state, mirror);
        this.aimAtTarget();
      }
      for (const seq of this.confirmed.keys())
        if (seq <= this.localSeq) this.confirmed.delete(seq);
    }
    const next = this.inbox[0];
    if (next && next.seq <= this.localSeq) this.inbox.shift();
    else if (next && next.seq === this.localSeq + 1) {
      this.inbox.shift();
      this.applyingInbox = true;
      try {
        perform(this, next.action);
      } catch {
        // The server's table is the truth; a rule disagreement here just adopts it.
      } finally {
        this.applyingInbox = false;
      }
      this.localSeq = next.seq;
      this.confirmed.set(next.seq, next.state);
      if (!this.running) this.updateRemote(0);
      return;
    }
    // The opponent's cue follows their aim as it arrives.
    if (this.cpuTurn && this.remoteAim && !this.placement) {
      const a = this.remoteAim;
      const difference = Math.atan2(
        Math.sin(a.angle - this.angle),
        Math.cos(a.angle - this.angle),
      );
      this.angle += difference * Math.min(1, Math.max(0, dt) * 12);
      this.power = a.power;
      this.side = a.side;
      this.top = a.top;
    }
  }
  updateCpu(dt: number) {
    if (!this.cpu) return;
    if (!this.cpuTurn || this.running) {
      this.cpuWait = 0;
      this.cpuPlan = null;
      return;
    }
    if (this.cpuSerial !== this.turnSerial) {
      this.cpuSerial = this.turnSerial;
      this.cpuWait = 0;
      this.cpuPlan = null;
    }
    this.cpuWait += Math.min(0.1, Math.max(0, dt));
    if (this.cpuWait < 1.2) return;
    if (this.progress.breakChoice) {
      this.resolveBreak(
        this.progress.breakChoice === "eight" ? "spot" : "hand",
      );
      this.cpuWait = 0;
      return;
    }
    if (this.placement) {
      const pos = cpuPlacement(this.world.balls, this.headStringPlacement);
      if (pos) this.placeCue(pos.x, pos.z);
      else return;
    }
    if (!this.cpuPlan) {
      this.cpuPlan = planCpuShot(
        this.world.balls,
        this.progress,
        this.cpu!.skill,
        this.shots === 0,
        this.rng,
        this.cpu!.style,
      );
      this.side = this.cpuPlan.side;
      this.top = this.cpuPlan.top;
      this.notify();
    }
    const difference = Math.atan2(
      Math.sin(this.cpuPlan.angle - this.angle),
      Math.cos(this.cpuPlan.angle - this.angle),
    );
    this.angle += difference * Math.min(1, Math.max(0, dt) * 8);
    if (this.cpuWait > 2.2) {
      Object.assign(this, this.cpuPlan);
      this.cpuPlan = null;
      this.cpuWait = 0;
      this.shoot();
    }
  }

  replayShots: { angle: number; power: number; side: number; top: number }[] =
    [];
  savedReplay: typeof this.replayShots = [];
  usedPlacement = false;
  cueIds: [string, string] = ["club", "club"];
  turnDeadline = 0;
  secondsLeft = 25;
  turnSerial = 0;
  get activeCue() {
    return cueById(this.cueIds[this.progress.turn]);
  }
  resetTurnClock() {
    this.turnDeadline = 0;
    this.secondsLeft = this.activeCue.seconds;
    this.turnSerial++;
  }
  expireTurn() {
    this.power = this.side = this.top = 0;
    if (this.progress.turn === 0) this.record({ t: "timeout" });
    this.progress.turn = 1 - this.progress.turn;
    this.progress.foul = "Time expired";
    this.placement = true;
    this.headStringPlacement = this.shots === 0;
    this.resetTurnClock();
    this.notify();
  }
  updateClock(now = this.now()) {
    if (
      !this.matchRules ||
      this.running ||
      this.progress.finished ||
      this.progress.breakChoice
    ) {
      this.turnDeadline = 0;
      return;
    }
    if (!this.turnDeadline)
      this.turnDeadline = now + this.activeCue.seconds * 1000;
    const left = Math.max(0, Math.ceil((this.turnDeadline - now) / 1000));
    // Online, the server owns the clock and sends the timeout itself. The house never times
    // out: the referee's replay has no clock, and an unrecorded rival timeout split the tables.
    if (left === 0 && !this.remote && !this.cpuTurn) this.expireTurn();
    else if (left !== this.secondsLeft) {
      this.secondsLeft = left;
      this.notify();
    }
  }
  matchRules = false;
  headStringPlacement = false;
  progress = new Progress();
  savedProgress: Progress | null = null;
  savedShots = 0;
  shotStartTime = 0;
  world = new World(drill("break"));
  angle = 0;
  power = 0;
  side = 0;
  top = 0;
  skin = 0;
  camera: "table" | "aim" = "table";
  /** Screen-edge bands the HUD occupies, in logical pixels; the table camera frames around them. */
  hud = { top: 52, bottom: 50, left: 46, right: 56 };
  placement = false;
  shots = 0;
  potted = 0;
  running = false;
  drill = "break";
  message = "Make your opening statement.";
  sound = true;
  revision = 0;
  previous: Ball[] = this.world.balls.map((b) => ({ ...b }));
  accumulator = 0;
  alpha = 0;
  frameTimes: number[] = [];
  fps = 0;
  p95 = 0;
  slowFrames = 0;
  shotFrames: number[] = [];
  lastPerformance: {
    fps: number;
    p95: number;
    over20ms: number;
    frames: number;
  } | null = null;
  saved: Ball[] | null = null;
  lastShot: { angle: number; power: number; side: number; top: number } | null =
    null;
  listeners = new Set<() => void>();
  onEvent: ((e: any) => void) | null = null;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.revision;
  notify() {
    this.revision++;
    this.listeners.forEach((f) => f());
  }
  reset(name = this.drill) {
    if (this.replaying) this.endReplay();
    this.cpuWait = 0;
    this.cpuPlan = null;
    this.cpuSerial = -1;
    this.replayShots = [];
    this.savedReplay = [];
    this.usedPlacement = false;
    this.actions = [];
    this.queue = [];
    this.queueWait = 0;
    this.imported = false;
    this.ghost = null;
    this.coach = null;
    this.contact = null;
    this.progress = new Progress();
    this.progress.strict = this.matchRules;
    this.headStringPlacement = false;
    this.savedProgress = null;
    this.world = new World(drill(name));
    this.previous = this.world.balls.map((b) => ({ ...b }));
    this.drill = name;
    this.running = false;
    this.accumulator = 0;
    this.alpha = 0;
    this.shots = 0;
    this.potted = 0;
    this.angle = name === "pocket" || name === "finish" ? -Math.PI / 2 : 0;
    this.power = 0;
    this.side = 0;
    this.top = 0;
    this.camera = "table";
    this.placement = false;
    this.lastPerformance = null;
    this.saved = null;
    this.lastShot = null;
    this.message =
      name === "spin"
        ? "Explore draw, follow, and sidespin."
        : name === "lucky"
          ? "Stop the cue ball inside the rings."
          : "Make your opening statement.";
    this.resetTurnClock();
    this.notify();
  }
  resolveBreak(
    choice: "spot" | "rerack" | "opponent-break" | "accept" | "hand",
  ) {
    if (!this.progress.breakChoice || this.running) return;
    if (this.progress.turn === 0) this.record({ t: "break", choice });
    const owner = this.progress.turn;
    const breaker = this.progress.breakShooter;
    if (choice === "rerack" || choice === "opponent-break") {
      this.reset("break");
      this.progress.turn = choice === "opponent-break" ? breaker : owner;
      this.resetTurnClock();
      this.notify();
      return;
    }
    if (this.progress.breakChoice === "eight") {
      // Foot spot, then towards the foot rail; scan back only if that line is blocked.
      const clear = (x: number) =>
        this.world.balls.every(
          (b) =>
            b.id === 8 ||
            b.pocketed ||
            Math.hypot(b.x - x, b.z) >= 2 * R + 0.001,
        );
      let x = H / 2;
      if (!clear(x)) {
        const candidates = [];
        for (let p = x; p <= H - R; p += 0.001) candidates.push(p);
        for (let p = x - 0.001; p >= -H + R; p -= 0.001) candidates.push(p);
        const available = candidates.find(clear);
        if (available === undefined) {
          this.message = "No clear spot. Choose to break again.";
          this.notify();
          return;
        }
        x = available;
      }
      Object.assign(
        this.world.balls.find((b) => b.id === 8)!,
        ball(8, x, 0),
      );
      this.progress.returned = this.progress.returned.filter((id) => id !== 8);
      this.progress.shotPots = this.progress.shotPots.filter((id) => id !== 8);
      this.potted = this.progress.returned.length;
    }
    this.placement =
      choice === "hand" || (!!this.progress.foul && choice !== "accept");
    // A scratched cue ball cannot be accepted in a pocket.
    if (this.world.balls.find((b) => b.id === 0)?.pocketed)
      this.placement = true;
    this.headStringPlacement = this.placement;
    this.progress.breakChoice = null;
    this.resetTurnClock();
    this.previous = this.world.balls.map((b) => ({ ...b }));
    this.message = this.placement
      ? "Place the cue ball behind the head string."
      : "Table open. Continue play.";
    this.notify();
  }
  /**
   * Point the cue at the nearest ball the rules allow as first contact, so a turn never starts
   * aimed at empty cloth. The break keeps its rack aim; CPU turns plan their own.
   */
  aimAtTarget() {
    if (this.cpuTurn || this.progress.finished || this.placement) return;
    if (this.drill === "break" && this.shots === 0) return;
    const cue = this.world.balls.find((b) => b.id === 0)!,
      rack = this.world.balls.map((b) => b.id);
    // The nearest legal ball the cue ball reaches first; a straight line through an opponent's
    // ball (the nearest legal one, blocked) is a foul waiting for anyone who shoots as aimed.
    let best: { d: number; a: number } | null = null,
      clear: { d: number; a: number } | null = null;
    for (const b of this.world.balls) {
      if (!b.id || b.pocketed || this.progress.targetWarning(b.id, false, rack))
        continue;
      const d = Math.hypot(b.x - cue.x, b.z - cue.z),
        a = Math.atan2(b.z - cue.z, b.x - cue.x);
      if (!best || d < best.d) best = { d, a };
      if (
        (!clear || d < clear.d) &&
        aimGuide(this.world.balls, a).hit?.id === b.id
      )
        clear = { d, a };
    }
    const pick = clear || best;
    if (pick) this.angle = pick.a;
  }
  /**
   * Where a cue ball in hand is drawn until the player places it: the head spot, or the nearest
   * free point along the head string. Drawn only; the table itself keeps the ball off the cloth.
   */
  inHandSpot() {
    for (let i = 0; i < 12; i++) {
      const z = i ? (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2.2 * R : 0;
      if (
        this.world.balls.every(
          (b) =>
            b.id === 0 ||
            b.pocketed ||
            Math.hypot(b.x + H / 2, b.z - z) > 2.2 * R,
        )
      )
        return { x: -H / 2, z };
    }
    return { x: -H / 2, z: 0 };
  }
  /** The player holds a scratched cue ball: nothing is on the cloth until they tap to place it. */
  get cueInHand() {
    return (
      this.placement &&
      !this.cpuTurn &&
      !!this.world.balls.find((b) => b.id === 0)?.pocketed
    );
  }
  placeCue(x: number, z: number, commit = true) {
    if (this.progress.finished) return false;
    if (this.headStringPlacement && x > -H / 2 + 1e-9) {
      this.message = "Place on or behind the head string, on the left side.";
      this.notify();
      return false;
    }
    if (!this.world.placeCue(x, z)) return false;
    if (commit) {
      this.placement = false;
      this.headStringPlacement = false;
      this.usedPlacement = !this.matchRules;
      if (!this.cpuTurn) this.record({ t: "place", x, z });
      this.aimAtTarget();
    }
    this.previous = this.world.balls.map((b) => ({ ...b }));
    this.notify();
    return true;
  }
  shoot() {
    if (
      this.running ||
      this.placement ||
      this.progress.finished ||
      this.progress.breakChoice
    )
      return;
    this.updateClock();
    if (this.placement) return;
    const state = this.world.balls.map((b) => ({ ...b }));
    if (this.world.strike(this.angle, this.power, this.side, this.top)) {
      this.savedProgress = this.progress.copy();
      this.savedShots = this.shots;
      this.savedReplay = this.replayShots.map((s) => ({ ...s }));
      this.replayShots.push({
        angle: this.angle,
        power: this.power,
        side: this.side,
        top: this.top,
      });
      if (!this.cpuTurn)
        this.record({
          t: "shot",
          angle: this.angle,
          power: this.power,
          side: this.side,
          top: this.top,
        });
      this.coach = null;
      this.contact = null;
      const ghostShot = this.ghost?.shots[this.shots];
      if (ghostShot && this.ghost)
        this.ghost.world.strike(
          ghostShot.angle,
          ghostShot.power,
          ghostShot.side,
          ghostShot.top,
        );
      this.progress.begin();
      this.shotStartTime = this.world.time;
      this.saved = state;
      this.lastShot = {
        angle: this.angle,
        power: this.power,
        side: this.side,
        top: this.top,
      };
      this.shots++;
      this.shotFrames = [];
      this.camera = "table";
      this.running = true;
      this.turnDeadline = 0;
      this.accumulator = 0;
      this.previous = state;
      this.message = "Let the table do the talking.";
      this.power = 0;
      this.notify();
    }
  }
  /** Slow-motion re-run of the last shot from its saved start state; the live table is untouched. */
  replaying = false;
  snapDrops = false;
  live: { world: World; previous: Ball[]; shotStartTime: number } | null = null;
  get canReplay() {
    return !this.running && !this.matchRules && !!this.saved && !!this.lastShot;
  }
  startReplay() {
    if (!this.canReplay) return;
    const shot = this.lastShot!;
    this.live = {
      world: this.world,
      previous: this.previous,
      shotStartTime: this.shotStartTime,
    };
    this.world = new World(this.saved!);
    this.world.strike(shot.angle, shot.power, shot.side, shot.top);
    this.previous = this.world.balls.map((b) => ({ ...b }));
    this.shotStartTime = 0;
    this.replaying = true;
    this.running = true;
    this.accumulator = 0;
    this.camera = "table";
    this.notify();
  }
  endReplay() {
    if (!this.live) return;
    this.world = this.live.world;
    this.previous = this.live.previous;
    this.shotStartTime = this.live.shotStartTime;
    this.live = null;
    this.replaying = false;
    this.running = false;
    this.alpha = 1;
    this.snapDrops = true;
    this.notify();
  }
  repeat() {
    if (this.running || !this.saved || !this.lastShot) return;
    this.progress = this.savedProgress?.copy() || new Progress();
    this.shots = this.savedShots;
    this.replayShots = this.savedReplay.map((s) => ({ ...s }));
    this.world = new World(this.saved);
    this.previous = this.saved.map((b) => ({ ...b }));
    Object.assign(this, this.lastShot);
    this.potted = this.world.balls.filter(
      (b) => b.id !== 0 && b.pocketed,
    ).length;
    this.shoot();
  }
  /** Play a shared replay code on this table. Never counts towards a challenge. */
  playCode(code: string) {
    const replay = decodeReplay(code);
    if (!replay || this.matchRules) return false;
    this.reset(replay.drill);
    this.queue = replay.shots;
    this.imported = true;
    this.message = "Watching a shared replay.";
    this.notify();
    return true;
  }
  setGhost(shots: Shot[]) {
    this.ghost = shots.length
      ? { shots, world: new World(drill(this.drill)) }
      : null;
    this.notify();
  }
  /** What the engine saw on a missed shot, in plain words. */
  coachNote(): string | null {
    const c = this.contact,
      shot = this.lastShot;
    if (!shot) return null;
    if (!c)
      return "The cue ball found nothing. Check the aim line before you pull back.";
    if (c.id === 8 && !this.progress.groups[this.progress.turn])
      return "You struck the 8 first. Pick an object ball.";
    if (Math.hypot(c.vx, c.vz) < 0.05)
      return `Barely touched the ${c.id} ball. Hit it fuller.`;
    const actual = Math.atan2(c.vz, c.vx);
    let best = pocketNames[0],
      err = Infinity,
      ideal = 0;
    for (const p of pocketNames) {
      const d = Math.atan2(p[1] - c.z, p[0] - c.x),
        e = Math.abs(wrap(actual - d));
      if (e < err) {
        err = e;
        best = p;
        ideal = d;
      }
    }
    const deg = (err * 180) / Math.PI;
    if (deg < 0.8)
      return `The ${c.id} ball was on line for the ${best[2]} but ran out of pace. Add power.`;
    if (deg > 25)
      return `The ${c.id} ball left ${deg.toFixed(0)}° wide of every pocket. Choose a different pocket.`;
    const cutActual = Math.abs(wrap(actual - shot.angle)),
      cutNeeded = Math.abs(wrap(ideal - shot.angle));
    return `The ${c.id} ball ran ${deg.toFixed(1)}° off the ${best[2]}. ${
      cutActual > cutNeeded ? "Aim fuller." : "Aim thinner."
    }`;
  }
  update(dt: number) {
    devTick(this, dt);
    this.updateClock();
    this.updateCpu(dt);
    this.updateRemote(dt);
    if (
      this.queue.length &&
      !this.running &&
      !this.placement &&
      !this.progress.finished &&
      !this.progress.breakChoice
    ) {
      this.queueWait += Math.min(0.1, Math.max(0, dt));
      if (this.queueWait > 1.2) {
        this.queueWait = 0;
        Object.assign(this, this.queue.shift());
        this.shoot();
      }
    }
    // Ignore suspension gaps; never advance minutes of simulation on resume.
    if (dt > 1) {
      this.accumulator = 0;
      return;
    }
    if (this.replaying) {
      this.accumulator = Math.min(0.1, this.accumulator + dt * 0.4);
      let steps = 0;
      while (this.accumulator >= P.tick && steps < 24) {
        this.previous = this.world.balls.map((b) => ({ ...b }));
        this.world.tick();
        this.accumulator -= P.tick;
        steps++;
        for (const e of this.world.events) this.onEvent?.(e);
        this.world.events.length = 0;
        if (!this.world.active) {
          this.endReplay();
          return;
        }
      }
      this.alpha = Math.min(1, this.accumulator / P.tick);
      return;
    }
    if (dt > 0) {
      this.frameTimes.push(dt * 1000);
      if (dt > 0.02) this.slowFrames++;
    }
    if (this.frameTimes.length >= 120) {
      const sorted = [...this.frameTimes].sort((a, b) => a - b);
      this.fps = Math.round(
        1000 /
          (this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length),
      );
      this.p95 = sorted[Math.floor(sorted.length * 0.95)];
      this.frameTimes = [];
    }
    if (!this.running) {
      this.alpha = 1;
      return;
    }
    this.shotFrames.push(dt * 1000);
    this.accumulator = Math.min(0.1, this.accumulator + dt);
    let steps = 0;
    while (this.accumulator >= P.tick && steps < 24) {
      this.previous = this.world.balls.map((b) => ({ ...b }));
      this.world.tick();
      if (this.ghost?.world.active) {
        this.ghost.world.tick();
        this.ghost.world.events.length = 0;
      }
      this.accumulator -= P.tick;
      steps++;
      for (const e of this.world.events) {
        this.onEvent?.(e);
        this.progress.contact(e);
        if (e.type === "ball" && !this.contact && (e.a === 0 || e.b === 0)) {
          const o = this.world.balls.find((b) => b.id === (e.a || e.b))!;
          this.contact = { id: o.id, x: o.x, z: o.z, vx: o.vx, vz: o.vz };
        }
        if (e.type === "pocket") {
          this.progress.pocket(e.a);
          if (e.a !== 0) {
            this.potted++;
            this.message = `${e.a} ball pocketed. Beautifully played.`;
          } else this.message = "Cue ball pocketed. Place it to continue.";
          this.notify();
        }
      }
      this.world.events.length = 0;
      if (!this.world.active) {
        const fs = this.shotFrames,
          sorted = [...fs].sort((a, b) => a - b);
        this.lastPerformance = {
          fps: 1000 / (fs.reduce((a, b) => a + b, 0) / fs.length),
          p95: sorted[Math.floor(sorted.length * 0.95)],
          over20ms: fs.filter((t) => t > 20).length,
          frames: fs.length,
        };
        const shooter = this.progress.turn;
        this.progress.finish(this.drill === "break" && this.shots === 1);
        // Practice has no second player: a miss used to pass the table to a "Player 2".
        if (!this.matchRules && !this.cpu && !this.remote)
          this.progress.turn = 0;
        // Spin belongs to the shooter; the opponent's must not ride into this player's shot.
        if (this.progress.turn !== shooter) this.side = this.top = 0;
        if (this.world.balls.filter((b) => b.id !== 0).every((b) => b.pocketed))
          this.progress.finished = true;
        this.running = false;
        this.resetTurnClock();
        // The Lucky Shot has nothing to pot, so a coach note about the pocket would mislead.
        if (
          !this.matchRules &&
          !this.progress.shotPots.length &&
          !this.cpu &&
          this.drill !== "lucky"
        )
          this.coach = this.coachNote();
        this.placement =
          !this.progress.finished &&
          !this.progress.breakChoice &&
          (!!this.world.balls.find((b) => b.id === 0)?.pocketed ||
            (this.matchRules && !!this.progress.foul));
        this.message = this.placement
          ? "Tap the cloth to place the cue ball."
          : this.potted === this.world.balls.length - 1
            ? "Table cleared. A fine finish."
            : "Your table. Your next shot.";
        this.aimAtTarget();
        this.notify();
        devDigest(this, "settled");
        break;
      }
    }
    this.alpha = Math.min(1, this.accumulator / P.tick);
  }
}
const devOn = () => (globalThis as any).__DEV__ === true;
const devTag = () => (globalThis as any).__cmTag ?? "";
let devLast = "",
  devClock = 0;
/** Development only: a state line whenever turn, rules or the resting aim changes; frame rate every 10 s. */
function devTick(s: Session, dt: number) {
  if (!devOn()) return;
  const p = s.progress,
    cue = s.world.balls.find((b) => b.id === 0),
    key = JSON.stringify({
      drill: s.drill,
      online: !!s.remote,
      cpu: !!s.cpu,
      seq: s.localSeq,
      shots: s.shots,
      turn: p.turn,
      cpuTurn: s.cpuTurn,
      groups: p.groups,
      potted: p.returned,
      running: s.running,
      placement: s.placement,
      head: s.headStringPlacement,
      breakChoice: p.breakChoice,
      finished: p.finished,
      foul: p.foul,
      msg: s.message,
      aim: s.running ? null : Math.round(s.angle * 10) / 10,
      spin: s.running ? null : `${s.side.toFixed(2)},${s.top.toFixed(2)}`,
      cue:
        s.running || !cue
          ? null
          : `${cue.x.toFixed(2)},${cue.z.toFixed(2)}${cue.pocketed ? "P" : ""}`,
    });
  devClock += dt;
  if (key !== devLast) {
    devLast = key;
    console.info("CueMaster state", devTag(), key);
  }
  if (devClock > 10) {
    devClock = 0;
    console.info(
      "CueMaster fps",
      devTag(),
      s.fps,
      Math.round(s.p95 || 0),
      s.turnDeadline ? Math.round((s.turnDeadline - Date.now()) / 1000) : 0,
    );
  }
}
/** Development only: one line per settled shot, so two devices can be compared seq by seq. */
function devDigest(s: Session, where: string) {
  if (!devOn()) return;
  const nonFinite = s.world.balls
    .filter((b) =>
      Object.values(b).some(
        (v) => typeof v === "number" && !Number.isFinite(v),
      ),
    )
    .map((b) => b.id);
  console.info(
    "CueMaster digest",
    devTag(),
    where,
    JSON.stringify({
      seq: s.localSeq,
      shots: s.shots,
      turn: s.progress.turn,
      groups: s.progress.groups,
      potted: [...s.progress.returned].sort((a, b) => a - b),
      foul: s.progress.foul,
      finished: s.progress.finished,
      breakChoice: s.progress.breakChoice,
      placement: s.placement,
      online: !!s.remote,
      nonFinite,
      pos: s.world.balls
        .filter((b) => !b.pocketed)
        .map((b) => `${b.id}:${b.x.toFixed(3)},${b.z.toFixed(3)}`)
        .join(" "),
    }),
  );
}
/** Development only: what differed when the phone adopted the server's table. */
export function devAdopt(
  s: Session,
  state: TableState,
  mirror: boolean,
  why: string,
) {
  if (!devOn()) return;
  const turn = mirror ? 1 - state.progress.turn : state.progress.turn;
  const groups = mirror
    ? [state.progress.groups[1], state.progress.groups[0]]
    : state.progress.groups;
  const at = (b: { pocketed: boolean; x: number; z: number }) =>
    `${b.pocketed ? "P" : ""}${b.x.toFixed(3)},${b.z.toFixed(3)}`;
  const moved = state.balls
    .map((b) => {
      const a = s.world.balls.find((m) => m.id === b.id);
      if (
        a &&
        a.pocketed === b.pocketed &&
        (b.pocketed || Math.hypot(a.x - b.x, a.z - b.z) <= 1e-4)
      )
        return "";
      return `${b.id}:${a ? at(a) : "none"}->${at(b)}`;
    })
    .filter(Boolean);
  console.info(
    "CueMaster adopt",
    devTag(),
    why,
    JSON.stringify({
      seq: s.localSeq,
      mirror,
      turn: [s.progress.turn, turn],
      groups: [s.progress.groups, groups],
      potted: [s.progress.returned, state.progress.returned],
      foul: [s.progress.foul, state.progress.foul],
      placement: [s.placement, state.placement],
      moved,
    }),
  );
}
export const session = new Session();
/**
 * Re-run a CPU match from the player's recorded actions. The rival's shots are regenerated from
 * the match seed, so a device cannot invent a rival that misses. Throws on any action the rules
 * would not have allowed.
 */
export function replayMatch(
  opponent: CpuOpponent,
  seed: number,
  actions: Action[],
) {
  const s = new Session();
  s.cpu = opponent;
  s.matchRules = true;
  s.rng = seededRandom(seed);
  s.now = () => 0;
  s.reset("break");
  const settle = () => {
    let n = 0;
    while ((s.running || s.cpuTurn) && n++ < 20000) s.update(0.1);
    if (s.running || s.cpuTurn) throw new Error("Match did not settle.");
  };
  for (const a of actions) {
    settle();
    // The result is fixed the moment the rack ends; anything a device recorded after that
    // (a stray tap on the cloth, say) cannot change it and must not void a real win.
    if (s.progress.finished) break;
    if (a.t === "timeout" && s.progress.turn !== 0)
      throw new Error("Only the player can time out.");
    perform(s, a);
  }
  settle();
  return { finished: s.progress.finished, winner: localWinner(s.progress) };
}
/**
 * Apply one recorded action, or throw if the rules would not have allowed it. Shared by the
 * referee's match replay, the online match server and the device applying an opponent's move,
 * so all three agree on what is legal.
 */
export function perform(s: Session, a: Action) {
  if (a.t === "shot") {
    Object.assign(s, {
      angle: a.angle,
      power: a.power,
      side: a.side,
      top: a.top,
    });
    s.shoot();
    if (!s.running) throw new Error("A recorded shot could not be played.");
  } else if (a.t === "place") {
    // Before the opening break the breaker may move the cue ball anywhere behind the head
    // string. The device records that as a placement; without this the referee refused it and
    // a player who adjusted the break could never have a win verified.
    if (
      !s.placement &&
      s.drill === "break" &&
      s.shots === 0 &&
      !s.progress.breakChoice
    )
      s.placement = s.headStringPlacement = true;
    if (!s.placement || !s.placeCue(a.x, a.z))
      throw new Error("A recorded placement was not allowed.");
  } else if (a.t === "break") {
    if (!s.progress.breakChoice) throw new Error("No break decision was due.");
    s.resolveBreak(a.choice);
  } else if (a.t === "timeout") {
    s.expireTurn();
  }
}
// Dev-only handle for inspecting and scripting shots from a browser console.
if ((globalThis as any).__DEV__) (globalThis as any).__cm = session;
