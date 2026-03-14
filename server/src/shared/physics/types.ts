// File: server/src/shared/physics/types.ts

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Internal simulation ball — richer than the Colyseus schema ball */
export interface PhysicsBall {
  id:         number;
  pos:        Vec2;       // mm
  vel:        Vec2;       // mm/s
  spin:       Vec3;       // rad/s — x=topspin/backspin, y=sidespin, z=roll
  isPocketed: boolean;
  isMoving:   boolean;
  /** Rolling = true once sliding transitions to rolling */
  isRolling:  boolean;
}

export type FoulType =
  | 'scratch'           // cue ball pocketed
  | 'no_contact'        // cue ball hit nothing
  | 'wrong_ball_first'  // hit opponent's ball or 8-ball illegally
  | 'no_rail_after'     // nothing hit rail after contact (8-ball rules)
  | 'jumped_table';     // ball left table bounds

export interface ShotFoul {
  type:    FoulType;
  ballId?: number;
}

export interface ShotResult {
  /** Final ball states after everything stops */
  balls:        PhysicsBall[];
  /** Balls pocketed this shot (ids) */
  pocketed:     number[];
  /** Foul committed, if any */
  foul:         ShotFoul | null;
  /** Whether any object ball was contacted */
  contactMade:  boolean;
  /** Whether a rail was hit after contact */
  railHit:      boolean;
  /** How many simulation ticks ran */
  ticks:        number;
}
