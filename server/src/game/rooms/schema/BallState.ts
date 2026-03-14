// File: server/src/game/rooms/schema/BallState.ts

import { Schema, type } from '@colyseus/schema';

export class SpinState extends Schema {
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
}

export class BallState extends Schema {
  @type('uint8')   id         = 0;   // 0=cue, 1-7=solids, 8=eight, 9-15=stripes
  @type('float32') x          = 0;   // mm from top-left
  @type('float32') y          = 0;
  @type('float32') vx         = 0;   // mm/s
  @type('float32') vy         = 0;
  @type(SpinState) spin       = new SpinState();
  @type('boolean') isPocketed = false;
  @type('boolean') isMoving   = false;
}
