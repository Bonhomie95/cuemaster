// File: server/src/shared/physics/pockets.ts

import { PhysicsBall, Vec2 } from './types';
import { TABLE_WIDTH, TABLE_HEIGHT, CORNER_POCKET_RADIUS, SIDE_POCKET_RADIUS } from '../constants';

interface Pocket {
  pos:    Vec2;
  radius: number;
}

// Six pockets: 4 corners + 2 side centres
export const POCKETS: Pocket[] = [
  // Corners
  { pos: { x: 0,              y: 0              }, radius: CORNER_POCKET_RADIUS },
  { pos: { x: TABLE_WIDTH,    y: 0              }, radius: CORNER_POCKET_RADIUS },
  { pos: { x: 0,              y: TABLE_HEIGHT   }, radius: CORNER_POCKET_RADIUS },
  { pos: { x: TABLE_WIDTH,    y: TABLE_HEIGHT   }, radius: CORNER_POCKET_RADIUS },
  // Side centres
  { pos: { x: TABLE_WIDTH / 2, y: 0             }, radius: SIDE_POCKET_RADIUS   },
  { pos: { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT  }, radius: SIDE_POCKET_RADIUS   },
];

/**
 * Returns the pocket index a ball has fallen into, or -1.
 * A ball is pocketed when its centre reaches the pocket centre
 * within the pocket radius.
 */
export function getPocketedIndex(ball: PhysicsBall): number {
  for (let i = 0; i < POCKETS.length; i++) {
    const p  = POCKETS[i]!;
    const dx = ball.pos.x - p.pos.x;
    const dy = ball.pos.y - p.pos.y;
    if (dx * dx + dy * dy <= p.radius * p.radius) return i;
  }
  return -1;
}
