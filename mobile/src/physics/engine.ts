import table from "./table.json";
/** SI units. x/z is cloth, y is vertical. Solid sphere I=2mr²/5.
 * Dimensions: WPA recommended equipment specifications (2024).
 * Cloth equations: Evan Kiefl, The physics of pool/billiards (2020).
 * Restitution/friction values are initial calibration parameters, not measurements.
 */
export const P = {
  ...table,
  g: 9.81,
  slide: 0.2,
  // pooltool default u_r; 0.012 made the cloth feel slow.
  roll: 0.01,
  spinDecel: 9,
  restitution: 0.96,
  // Cushion friction at the nose contact (Han 2005 / Mathavan 2010 range 0.14-0.25).
  cushionFriction: 0.2,
  tick: 1 / 240,
};
/** Ball-ball friction falls with slip speed: Alciatore TP A.14, mu = a + b·exp(-c·v). */
export function throwFriction(slip: number) {
  return 9.951e-3 + 0.108 * Math.exp(-1.088 * slip);
}
export const H = P.length / 2,
  W = P.width / 2,
  R = P.radius;
/** Cushion nose contact sits above the ball centre: sin θ = (nose − R)/R. */
const NOSE_SIN = Math.max(0, Math.min(0.5, (P.noseHeight - R) / R)),
  NOSE_COS = Math.sqrt(1 - NOSE_SIN * NOSE_SIN);
export type Ball = {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  pocketed: boolean;
  drop: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
};
export type Event = {
  type: "ball" | "rail" | "pocket" | "cue";
  a: number;
  b?: number;
  speed: number;
  time: number;
};
export type Segment = {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  jaw: boolean;
};
export const rails: Segment[] = [];
function seg(ax: number, az: number, bx: number, bz: number, jaw = false) {
  rails.push({ ax, az, bx, bz, jaw });
}
for (const s of [-1, 1]) {
  for (const side of [-1, 1]) {
    const a = side * P.sideHalf,
      b = side * (H - P.cornerCut);
    seg(a, s * W, b, s * W);
    seg(a, s * W, side * (P.sideHalf - 0.5 * R), s * (W + 1.9 * R), true);
    seg(b, s * W, side * (H - 0.79 * R), s * (W + 1.45 * R), true);
  }
  seg(s * H, -W + P.cornerCut, s * H, W - P.cornerCut);
  for (const t of [-1, 1])
    seg(
      s * H,
      t * (W - P.cornerCut),
      s * (H + 1.45 * R),
      t * (W - 0.79 * R),
      true,
    );
}
/**
 * Resting orientation. The old value turned every ball's number patch straight up, which from
 * the overhead camera read as a white dot on a flat disc. Tilt and per-ball yaw put the number
 * and the stripe band on the side, as balls actually lie. Deterministic in `id`.
 */
function restingSpin(id: number) {
  const a = (0.9 + id * 1.37) / 2,
    t = 1.02 / 2;
  return {
    qx: Math.cos(a) * Math.sin(t),
    qy: Math.cos(t) * Math.sin(a),
    qz: -Math.sin(a) * Math.sin(t),
    qw: Math.cos(a) * Math.cos(t),
  };
}
export function ball(id: number, x: number, z: number): Ball {
  return {
    id,
    x,
    z,
    vx: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
    pocketed: false,
    drop: 0,
    ...restingSpin(id),
  };
}
/**
 * A real frozen rack is not a perfect lattice. With 0.08 mm gaps and no jitter the break ran
 * down the lattice lines like a Newton's cradle and potted 0.1 balls on average; sub-millimetre
 * imperfection (still visually frozen) breaks the lines up and pots ~0.6. Gap exceeds the worst
 * jitter approach (0.2 mm·√2 per ball) so racked balls never overlap.
 */
const RACK_GAP = 0.0003,
  RACK_JITTER = 0.0004;
export function rack(seed = 1): Ball[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const ids = [1, 10, 2, 3, 8, 11, 12, 4, 13, 5, 7, 6, 15, 14, 9];
  const balls = [ball(0, -H / 2, 0)];
  let n = 0;
  for (let row = 0; row < 5; row++)
    for (let col = 0; col <= row; col++)
      balls.push(
        ball(
          ids[n++],
          H / 2 +
            row * Math.sqrt(3) * (R + RACK_GAP) +
            (rand() - 0.5) * RACK_JITTER,
          (col - row / 2) * 2 * (R + RACK_GAP) + (rand() - 0.5) * RACK_JITTER,
        ),
      );
  return balls.sort((a, b) => a.id - b.id);
}
export function kinetic(b: Ball) {
  return (
    0.5 * P.mass * (b.vx * b.vx + b.vz * b.vz) +
    0.2 * P.mass * R * R * (b.wx * b.wx + b.wy * b.wy + b.wz * b.wz)
  );
}
export function moving(b: Ball) {
  return (
    !b.pocketed &&
    (Math.hypot(b.vx, b.vz) > 1e-5 || Math.hypot(b.wx, b.wy, b.wz) > 1e-4)
  );
}
function approachZero(v: number, d: number) {
  return Math.sign(v) * Math.max(0, Math.abs(v) - d);
}
/** Exact cloth integration within each sliding or rolling phase. */
export function cloth(b: Ball, dt: number) {
  const ox = b.wx,
    oy = b.wy,
    oz = b.wz;
  const ux = b.vx + R * b.wz,
    uz = b.vz - R * b.wx,
    u = Math.hypot(ux, uz);
  if (u > 1e-7) {
    const transition = u / (3.5 * P.slide * P.g),
      t = Math.min(dt, transition);
    const ax = (-P.slide * P.g * ux) / u,
      az = (-P.slide * P.g * uz) / u;
    b.x += b.vx * t + 0.5 * ax * t * t;
    b.z += b.vz * t + 0.5 * az * t * t;
    b.vx += ax * t;
    b.vz += az * t;
    b.wx -= (2.5 * az * t) / R;
    b.wz += (2.5 * ax * t) / R;
    if (transition <= dt) {
      b.wx = b.vz / R;
      b.wz = -b.vx / R;
      roll(b, dt - t);
    }
  } else roll(b, dt);
  b.wy = approachZero(b.wy, P.spinDecel * dt);
  const wx = (ox + b.wx) * 0.5,
    wy = (oy + b.wy) * 0.5,
    wz = (oz + b.wz) * 0.5,
    mag = Math.hypot(wx, wy, wz);
  if (mag > 1e-10) {
    const scale = Math.sin(mag * dt * 0.5) / mag,
      dx = wx * scale,
      dy = wy * scale,
      dz = wz * scale,
      dw = Math.cos(mag * dt * 0.5);
    const x = dw * b.qx + dx * b.qw + dy * b.qz - dz * b.qy,
      y = dw * b.qy - dx * b.qz + dy * b.qw + dz * b.qx,
      z = dw * b.qz + dx * b.qy - dy * b.qx + dz * b.qw,
      w = dw * b.qw - dx * b.qx - dy * b.qy - dz * b.qz;
    const n = Math.hypot(x, y, z, w);
    b.qx = x / n;
    b.qy = y / n;
    b.qz = z / n;
    b.qw = w / n;
  }
}
function roll(b: Ball, dt: number) {
  const v = Math.hypot(b.vx, b.vz);
  if (v > 1e-9) {
    const t = Math.min(dt, v / (P.roll * P.g)),
      f = Math.max(0, 1 - (P.roll * P.g * t) / v),
      d = t - (0.5 * P.roll * P.g * t * t) / v;
    b.x += b.vx * d;
    b.z += b.vz * d;
    b.vx *= f;
    b.vz *= f;
  } else {
    b.vx = 0;
    b.vz = 0;
  }
  b.wx = b.vz / R;
  b.wz = -b.vx / R;
}
export class World {
  balls: Ball[];
  time = 0;
  events: Event[] = [];
  steps = 0;
  maxOverlap = 0;
  constructor(balls = rack()) {
    this.balls = balls.map((b) => ({ ...b }));
  }
  get active() {
    return this.balls.some(moving);
  }
  emit(type: Event["type"], a: number, speed: number, b?: number) {
    this.events.push({ type, a, b, speed, time: this.time });
  }
  strike(angle: number, power: number, side = 0, top = 0) {
    const b = this.balls.find((b) => b.id === 0);
    if (!b || b.pocketed || this.active) return false;
    if (![angle, power, side, top].every(Number.isFinite)) return false;
    const len = Math.hypot(side, top);
    if (len > 1) {
      side /= len;
      top /= len;
    }
    const v = 0.18 + Math.max(0, Math.min(1, power)) ** 1.45 * 10.82;
    // Initial squirt approximation; calibrated independently from spin impulse.
    const a = angle - side * 0.025,
      dx = Math.cos(a),
      dz = Math.sin(a);
    b.vx = v * dx;
    b.vz = v * dz;
    b.wx = (2.5 * v * top * 0.5 * dz) / R;
    b.wz = (-2.5 * v * top * 0.5 * dx) / R;
    b.wy = (2.5 * v * side * 0.5) / R;
    this.emit("cue", 0, v);
    return true;
  }
  tick() {
    let left = P.tick;
    while (left > 1e-10) {
      let max = 0;
      for (const b of this.balls)
        if (!b.pocketed) max = Math.max(max, Math.hypot(b.vx, b.vz));
      const dt = this.contactStep(
        Math.min(left, (R * 0.12) / Math.max(max, 0.1)),
      );
      for (const b of this.balls) if (!b.pocketed) cloth(b, dt);
      this.time += dt;
      this.steps++;
      // Repeated passes separate any residual overlap and resolve cushions.
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < this.balls.length; i++)
          for (let j = i + 1; j < this.balls.length; j++)
            this.collide(this.balls[i], this.balls[j]);
        for (const b of this.balls) if (!b.pocketed) this.cushions(b);
      }
      for (const b of this.balls) {
        if (b.pocketed) b.drop += dt;
        else this.capture(b);
      }
      left -= dt;
    }
  }
  /** Linear time-of-impact prediction, refined by the adaptive cloth steps. */
  contactStep(limit: number) {
    let first = limit;
    const circle = (
      dx: number,
      dz: number,
      vx: number,
      vz: number,
      r: number,
    ) => {
      const a = vx * vx + vz * vz,
        b = dx * vx + dz * vz,
        c = dx * dx + dz * dz - r * r;
      if (a < 1e-12 || b >= 0 || c < 0) return;
      const disc = b * b - a * c;
      if (disc < 0) return;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0 && t < first) first = Math.max(1e-7, t + 1e-7);
    };
    for (let i = 0; i < this.balls.length; i++) {
      const a = this.balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < this.balls.length; j++) {
        const b = this.balls[j];
        if (!b.pocketed)
          circle(a.x - b.x, a.z - b.z, a.vx - b.vx, a.vz - b.vz, 2 * R);
      }
      if (a.vx === 0 && a.vz === 0) continue;
      for (const s of rails) {
        circle(a.x - s.ax, a.z - s.az, a.vx, a.vz, R);
        circle(a.x - s.bx, a.z - s.bz, a.vx, a.vz, R);
        const dx = s.bx - s.ax,
          dz = s.bz - s.az,
          len = Math.hypot(dx, dz),
          nx = -dz / len,
          nz = dx / len;
        const d = (a.x - s.ax) * nx + (a.z - s.az) * nz,
          v = a.vx * nx + a.vz * nz;
        if (Math.abs(d) >= R && d * v < 0) {
          const t = (Math.sign(d) * R - d) / v;
          const at =
            ((a.x + a.vx * t - s.ax) * dx + (a.z + a.vz * t - s.az) * dz) /
            (len * len);
          if (t >= 0 && t < first && at >= 0 && at <= 1)
            first = Math.max(1e-7, t + 1e-7);
        }
      }
    }
    return Math.min(limit, first);
  }
  collide(a: Ball, b: Ball, share = 1, skin = 0) {
    if (a.pocketed || b.pocketed) return;
    const dx = b.x - a.x,
      dz = b.z - a.z,
      d2 = dx * dx + dz * dz;
    if (d2 >= (2 * R + skin) ** 2) return;
    const d = Math.sqrt(d2),
      nx = d > 1e-10 ? dx / d : 1,
      nz = d > 1e-10 ? dz / d : 0;
    const overlap = 2 * R - d;
    if (overlap > 0) {
      this.maxOverlap = Math.max(this.maxOverlap, overlap);
      a.x -= nx * (overlap / 2 + 1e-9);
      a.z -= nz * (overlap / 2 + 1e-9);
      b.x += nx * (overlap / 2 + 1e-9);
      b.z += nz * (overlap / 2 + 1e-9);
    }
    const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
    if (vn <= 0) return;
    const j = (share * (1 + P.restitution) * vn) / 2;
    a.vx -= j * nx;
    a.vz -= j * nz;
    b.vx += j * nx;
    b.vz += j * nz;
    const tx = -nz,
      tz = nx,
      vt = (a.vx - b.vx) * tx + (a.vz - b.vz) * tz - R * (a.wy + b.wy),
      // Vertical slip from follow/draw roll: why rolling balls throw less than stunned ones.
      vv = R * ((a.wx + b.wx) * tx + (a.wz + b.wz) * tz),
      slip = Math.hypot(vt, vv);
    if (slip > 1e-9) {
      const jf = Math.min(throwFriction(slip) * j, slip / 7),
        jt = (jf * vt) / slip,
        jv = (jf * vv) / slip;
      a.vx -= jt * tx;
      a.vz -= jt * tz;
      b.vx += jt * tx;
      b.vz += jt * tz;
      a.wy += (2.5 * jt) / R;
      b.wy += (2.5 * jt) / R;
      a.wx -= (2.5 * jv * tx) / R;
      a.wz -= (2.5 * jv * tz) / R;
      b.wx -= (2.5 * jv * tx) / R;
      b.wz -= (2.5 * jv * tz) / R;
    }
    if (vn > 0.015) this.emit("ball", a.id, vn, b.id);
  }
  cushions(b: Ball) {
    if (b.vx === 0 && b.vz === 0) return;
    for (const s of rails) {
      const dx = s.bx - s.ax,
        dz = s.bz - s.az,
        l2 = dx * dx + dz * dz;
      const t = Math.max(
        0,
        Math.min(1, ((b.x - s.ax) * dx + (b.z - s.az) * dz) / l2),
      );
      const px = b.x - s.ax - t * dx,
        pz = b.z - s.az - t * dz,
        d = Math.hypot(px, pz);
      if (d >= R || d < 1e-10) continue;
      const nx = px / d,
        nz = pz / d;
      b.x += nx * (R - d + 1e-9);
      b.z += nz * (R - d + 1e-9);
      const vn = b.vx * nx + b.vz * nz;
      if (vn >= 0) continue;
      const e = 0.87 - 0.07 * Math.min(1, Math.abs(vn) / 8),
        imp = -(1 + e) * vn;
      b.vx += imp * nx;
      b.vz += imp * nz;
      // Friction at the raised nose contact. r = R(−cosθ n + sinθ ŷ); slip directions are the
      // rail tangent t and s = sinθ n + cosθ ŷ, both with effective inverse mass 3.5 per unit mass.
      // The s term is what turns a rolling ball's topspin over; without it a rolling ball left
      // a rail with under a third of its speed.
      const tx = -nz,
        tz = nx,
        wn = b.wx * nx + b.wz * nz,
        wt = b.wx * tx + b.wz * tz,
        vt = b.vx * tx + b.vz * tz + R * (NOSE_COS * b.wy + NOSE_SIN * wn),
        vs = NOSE_SIN * (vn + imp / 2) - R * wt,
        slip = Math.hypot(vt, vs);
      if (slip > 1e-9) {
        const jf = Math.min(P.cushionFriction * imp, slip / 3.5),
          jt = (jf * vt) / slip,
          js = (jf * vs) / slip;
        b.vx -= jt * tx + js * NOSE_SIN * nx;
        b.vz -= jt * tz + js * NOSE_SIN * nz;
        b.wy -= (2.5 * jt * NOSE_COS) / R;
        // Δω = r×F/I = −(2.5/R)·jt(cosθ ŷ + sinθ n) + (2.5/R)·js t
        b.wx += (2.5 * (js * tx - jt * NOSE_SIN * nx)) / R;
        b.wz += (2.5 * (js * tz - jt * NOSE_SIN * nz)) / R;
      }
      if (Math.abs(vn) > 0.015) this.emit("rail", b.id, -vn);
    }
  }
  capture(b: Ball) {
    const x = Math.abs(b.x),
      z = Math.abs(b.z);
    // Expressed in ball radii so the mouths keep their proportions if the ball size changes.
    const side = x < P.sideHalf - 0.35 * R && z > W + 0.9 * R;
    const corner =
      x + z > H + W - 1.2 * R && x > H - 3.2 * R && z > W - 3.2 * R;
    if (side || corner) {
      b.pocketed = true;
      b.drop = 0;
      this.emit("pocket", b.id, Math.hypot(b.vx, b.vz));
      b.vx = b.vz = b.wx = b.wy = b.wz = 0;
    }
  }
  placeCue(x: number, z: number) {
    if (this.active || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (Math.abs(x) > H - R || Math.abs(z) > W - R) return false;
    if (
      this.balls.some(
        (b) =>
          b.id !== 0 &&
          !b.pocketed &&
          Math.hypot(b.x - x, b.z - z) < 2 * R + 0.001,
      )
    )
      return false;
    for (const s of rails) {
      const dx = s.bx - s.ax,
        dz = s.bz - s.az,
        t = Math.max(
          0,
          Math.min(
            1,
            ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz),
          ),
        );
      if (Math.hypot(x - s.ax - t * dx, z - s.az - t * dz) < R) return false;
    }
    const b = this.balls.find((b) => b.id === 0)!;
    Object.assign(b, ball(0, x, z));
    return true;
  }
}
export function simulate(world: World, limit = 40) {
  let ticks = 0;
  while (world.active && ticks < limit / P.tick) {
    world.tick();
    ticks++;
  }
  return ticks;
}
export function drill(name: string): Ball[] {
  if (name === "break") return rack(41);
  if (name === "finish") return [ball(0, 0, 0.36), ball(8, 0, 0.05)];
  if (name === "pocket")
    return [
      ball(0, 0, 0.36),
      ball(1, 0, 0.05),
      ball(9, 0.7, 0.15),
      ball(8, -0.7, -0.2),
    ];
  if (name === "cut")
    return [
      ball(0, -0.65, 0.25),
      ball(1, 0.42, -0.1),
      ball(9, 0.65, 0.25),
      ball(8, -0.2, -0.35),
    ];
  if (name === "spin") return [ball(0, -0.65, 0), ball(1, -0.1, 0)];
  return [
    ball(0, -0.6, 0.12),
    ball(1, 0.3, -0.25),
    ball(2, 0.6, 0.24),
    ball(3, -0.12, -0.38),
    ball(8, 0.7, -0.27),
    ball(10, -0.35, 0.32),
  ];
}
