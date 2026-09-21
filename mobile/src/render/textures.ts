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
      if (id > 8 && Math.abs(sy) > 0.52) {
        r = 249;
        g = 248;
        b = 240;
      }
      if (id > 0 && Math.abs(sz) > Math.sqrt(1 - 0.49 ** 2)) {
        r = 252;
        g = 251;
        b = 245;
        const mx = Math.floor(((sx / 0.44) * 0.5 + 0.5) * 48),
          my = Math.floor(((-sy / 0.44) * 0.5 + 0.5) * 48);
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
          ? 238 + rnd * 8 + (x % 2 === y % 2 ? 2 : 0)
          : 175 + Math.sin(y * 0.43 + Math.sin(x * 0.08) * 1.4) * 7 + rnd * 5;
      const i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  const t = new T.DataTexture(d, n, n);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(kind === "cloth" ? 22 : 3, kind === "cloth" ? 11 : 2);
  t.magFilter = T.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function shadowTexture() {
 const n=64, data=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
  const r=Math.hypot((x-31.5)/32,(y-31.5)/32),i=(y*n+x)*4;
  data[i]=data[i+1]=data[i+2]=0;data[i+3]=Math.round(Math.max(0,1-r)**2*190);
 }
 const t=new T.DataTexture(data,n,n);t.magFilter=T.LinearFilter;t.needsUpdate=true;return t;
}

/** Low-frequency cushion-contact shading; separate from the fine cloth weave. */
export function clothSurface() {
 const w=512,h=256,data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
  const px=(x/(w-1)-.5)*2.8,pz=(y/(h-1)-.5)*1.5;
  const d=Math.max(0,Math.min(1.27-Math.abs(px),.635-Math.abs(pz)));
  const shade=.70+.30*(1-Math.exp(-d/.025));
  const weave=((x+y)%2 ? 1 : -1)*1.5;
  const v=Math.round((238+weave)*shade),i=(y*w+x)*4;
  data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
 }
 const t=new T.DataTexture(data,w,h);t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}
