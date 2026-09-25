import { CpuOpponent, CpuShot, planCpuShot, cpuPlacement } from "./cpu";
import { cueById } from "./cues";
import { World, drill, P, Ball, ball, R, H } from "../physics/engine";
import { Progress } from "./progress";
export type Skin = {
  id: string;
  name: string;
  subtitle: string;
  cloth: string;
  cushion: string;
  wood: string;
  metal: string;
  swatch: string;
};
export const skins: Skin[] = [
  {
    id: "heritage",
    name: "Lagos",
    subtitle: "WALNUT · CHAMPIONSHIP GREEN",
    cloth: "#07845b",
    cushion: "#10523e",
    wood: "#38241b",
    metal: "#b99557",
    swatch: "#24785d",
  },
  {
    id: "riviera",
    name: "London",
    subtitle: "EBONY · TOURNAMENT BLUE",
    cloth: "#087fab",
    cushion: "#18516c",
    wood: "#202730",
    metal: "#a2b7c2",
    swatch: "#337caa",
  },
  {
    id: "oxblood",
    name: "Paris",
    subtitle: "SMOKED OAK · OXBLOOD",
    cloth: "#a53154",
    cushion: "#572231",
    wood: "#292023",
    metal: "#c19768",
    swatch: "#963e57",
  },
];
skins.push(
  {
    id: "midnight",
    name: "Tokyo",
    subtitle: "OBSIDIAN · INDIGO",
    cloth: "#4242a4",
    cushion: "#191d43",
    wood: "#111525",
    metal: "#a6b8d2",
    swatch: "#464e9e",
  },
  {
    id: "jade",
    name: "Dubai",
    subtitle: "JADE · BRUSHED GOLD",
    cloth: "#079c75",
    cushion: "#074937",
    wood: "#153e32",
    metal: "#d2b276",
    swatch: "#169b75",
  },
  {
    id: "champion",
    name: "New York",
    subtitle: "GOLD · BLACK LACQUER",
    cloth: "#8b6430",
    cushion: "#60441f",
    wood: "#16191b",
    metal: "#d7b66c",
    swatch: "#b18543",
  },
);
export class Session {
  cpu: CpuOpponent | null = null;
  cpuWait = 0;
  cpuPlan: CpuShot | null = null;
  cpuSerial = -1;
  get cpuTurn() {
    return !!this.cpu && this.progress.turn === 1 && !this.progress.finished;
  }
  updateCpu(dt: number) {
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
  updateClock(now = Date.now()) {
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
    if (left === 0) {
      this.power = 0;
      this.progress.turn = 1 - this.progress.turn;
      this.progress.foul = "Time expired";
      this.placement = true;
      this.headStringPlacement = this.shots === 0;
      this.resetTurnClock();
      this.notify();
    } else if (left !== this.secondsLeft) {
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
        : "Make your opening statement.";
    this.resetTurnClock();
    this.notify();
  }
  resolveBreak(
    choice: "spot" | "rerack" | "opponent-break" | "accept" | "hand",
  ) {
    if (!this.progress.breakChoice || this.running) return;
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
  placeCue(x: number, z: number, commit = true) {
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
  update(dt: number) {
    this.updateClock();
    this.updateCpu(dt);
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
      this.accumulator -= P.tick;
      steps++;
      for (const e of this.world.events) {
        this.onEvent?.(e);
        this.progress.contact(e);
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
        this.progress.finish(this.drill === "break" && this.shots === 1);
        if (this.world.balls.filter((b) => b.id !== 0).every((b) => b.pocketed))
          this.progress.finished = true;
        this.running = false;
        this.resetTurnClock();
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
        this.notify();
        break;
      }
    }
    this.alpha = Math.min(1, this.accumulator / P.tick);
  }
}
export const session = new Session();
// Dev-only handle for inspecting and scripting shots from a browser console.
if (typeof __DEV__ !== "undefined" && __DEV__)
  (globalThis as any).__cm = session;
