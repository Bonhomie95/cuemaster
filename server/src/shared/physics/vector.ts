// File: server/src/shared/physics/vector.ts

import { Vec2 } from './types';

export const vec2 = {
  add:    (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y }),
  sub:    (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y }),
  scale:  (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s }),
  dot:    (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,
  len:    (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y),
  len2:   (v: Vec2): number => v.x * v.x + v.y * v.y,
  norm:   (v: Vec2): Vec2 => {
    const l = Math.sqrt(v.x * v.x + v.y * v.y);
    return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
  },
  perp:  (v: Vec2): Vec2 => ({ x: -v.y, y: v.x }),
  zero:  (): Vec2 => ({ x: 0, y: 0 }),
  clone: (v: Vec2): Vec2 => ({ x: v.x, y: v.y }),
};
