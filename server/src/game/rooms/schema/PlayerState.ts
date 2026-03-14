// File: server/src/game/rooms/schema/PlayerState.ts

import { Schema, type, ArraySchema } from '@colyseus/schema';
import { TURN_TIME_SECONDS } from '../../../shared/constants';

export class PlayerState extends Schema {
  @type('string')  userId            = '';
  @type('string')  username          = '';
  @type('string')  displayName       = '';
  @type('uint16')  eloRating         = 1000;
  @type('boolean') isConnected       = false;
  @type('boolean') isReady           = false;
  @type('string')  ballGroup         = '';   // 'solids' | 'stripes' | ''
  @type(['uint8']) ballsPocketed      = new ArraySchema<number>();
  @type('uint8')   turnTimeRemaining  = TURN_TIME_SECONDS;
  @type('uint16')  totalTimeUsed      = 0;
}
