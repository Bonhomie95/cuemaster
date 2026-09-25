import * as T from "three";
import numbers from "../../assets/models/numbers.json";
export const ballColors = [
  "#faf9f2",
  "#e8af16",
  "#1646a4",
  "#bd2627",
  "#622d87",
  "#e0651f",
  "#176a45",
  "#752329",
  "#171b20",
  "#e8af16",
  "#1646a4",
  "#bd2627",
  "#622d87",
  "#e0651f",
  "#176a45",
  "#752329",
];
const cache = new Map<number, T.DataTexture>();
export function ballTexture(id: number) {
  if (cache.has(id)) return cache.get(id)!;
  const w = 512,
    h = 256,
    data = new Uint8Array(w * h * 4),
    c = new T.Color(ballColors[id]).convertLinearToSRGB();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const theta = (Math.PI * y) / h,
        phi = (2 * Math.PI * x) / w,
        sy = Math.cos(theta),
        sx = -Math.cos(phi) * Math.sin(theta),
        sz = Math.sin(phi) * Math.sin(theta);
      let r = c.r * 255,
        g = c.g * 255,
        b = c.b * 255;
      if (id > 8 && Math.abs(sy) > 0.58) {
        r = 249;
        g = 248;
        b = 240;
      }
      if (id > 0 && Math.abs(sz) > Math.sqrt(1 - 0.42 ** 2)) {
        r = 246;
        g = 243;
        b = 233;
        const mx = Math.floor(((sx / 0.38) * 0.5 + 0.5) * 48),
          my = Math.floor(((-sy / 0.38) * 0.5 + 0.5) * 48);
        if (mx >= 0 && mx < 48 && my >= 0 && my < 48) {
          const a = numbers[id][my * 48 + mx] / 255;
          r = r * (1 - a) + 17 * a;
          g = g * (1 - a) + 20 * a;
          b = b * (1 - a) + 20 * a;
        }
      }
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  const t = new T.DataTexture(data, w, h);
  t.colorSpace = T.SRGBColorSpace;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  cache.set(id, t);
  return t;
}
export function grain(kind: "cloth" | "wood") {
  const n = 128,
    d = new Uint8Array(n * n * 4);
  let seed = 81;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const rnd = seed / 4294967296;
      const v =
        kind === "cloth"
          ? 232 + rnd * 16 + (x % 2 === y % 2 ? 5 : 0)
          : 226 +
            Math.sin(y * 0.43 + Math.sin(x * 0.08) * 1.4) * 18 +
            Math.sin(y * 1.9 + Math.sin(x * 0.21) * 2.2) * 8 +
            rnd * 4;
      const i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  const t = new T.DataTexture(d, n, n);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(kind === "cloth" ? 54 : 3, kind === "cloth" ? 27 : 2);
  t.magFilter = T.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function shadowTexture() {
  const n = 64,
    data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x - 31.5) / 32, (y - 31.5) / 32),
        i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = Math.round(Math.max(0, 1 - r) ** 2 * 190);
    }
  const t = new T.DataTexture(data, n, n);
  t.magFilter = T.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Baked cloth detail seen from overhead: a soft pool of light towards the middle, darkening
 * into the cushion shadow, plus the weave. Sampled at 1024x512 because from the match camera
 * the cloth covers most of the screen.
 */
export function clothSurface() {
  const w = 1024,
    h = 512,
    data = new Uint8Array(w * h * 4);
  let seed = 1337;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = (x / (w - 1) - 0.5) * 2.8,
        pz = (y / (h - 1) - 0.5) * 1.5;
      // Cushion shadow: the cloth darkens in the last ~30 mm before the rail.
      const d = Math.max(
        0,
        Math.min(1.27 - Math.abs(px), 0.635 - Math.abs(pz)),
      );
      const cushion = 0.74 + 0.26 * (1 - Math.exp(-d / 0.024));
      // Lamp pool: bright down the middle of the bed, falling away to the corners.
      const r = Math.min(1, Math.hypot(px / 1.55, pz / 0.95));
      const pool = 1 - 0.34 * r * r;
      // Pocket mouths sit in their own shadow.
      let pocket = 1;
      for (const [cx, cz] of [
        [1.27, 0.635],
        [1.27, -0.635],
        [-1.27, 0.635],
        [-1.27, -0.635],
        [0, 0.66],
        [0, -0.66],
      ]) {
        const q = Math.hypot(px - cx, pz - cz);
        if (q < 0.17)
          pocket = Math.min(pocket, 0.62 + 0.38 * (q / 0.17) ** 1.5);
      }
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise =
        (seed / 4294967296 - 0.5) * 24 +
        Math.sin(x * 0.093) * Math.sin(y * 0.077) * 4;
      const weave =
        ((x & 1) === (y & 1) ? 1.6 : -1.6) +
        Math.sin(x * 0.7) * 0.8 +
        Math.sin(y * 0.7) * 0.8;
      const v = Math.max(
          0,
          Math.min(
            255,
            Math.round((242 + weave + noise) * cushion * pool * pocket),
          ),
        ),
        i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  const t = new T.DataTexture(data, w, h);
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Club floor: dark navy carpet with a fine weave and the lamp pool under the table. */
export function floorTexture() {
  const n = 256,
    data = new Uint8Array(n * n * 4);
  let seed = 99;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.min(1, Math.hypot((x - 127.5) / 128, (y - 127.5) / 128)),
        k = Math.pow(1 - r, 1.7);
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise =
        (seed / 4294967296 - 0.5) * 10 +
        ((x & 3) === 0 || (y & 3) === 0 ? -3 : 0);
      const i = (y * n + x) * 4;
      data[i] = Math.max(0, 8 + k * 20 + noise * 0.5);
      data[i + 1] = Math.max(0, 26 + k * 22 + noise * 0.7);
      data[i + 2] = Math.max(0, 42 + k * 22 + noise);
      data[i + 3] = 255;
    }
  const t = new T.DataTexture(data, n, n);
  t.colorSpace = T.SRGBColorSpace;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
