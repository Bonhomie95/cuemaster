// File: server/src/shared/models/Match.ts

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IShotRecord {
  shotIndex:     number;
  playerId:      string;
  aimAngle:      number;
  power:         number;
  spinX:         number;
  spinY:         number;
  cueBallX?:     number;
  cueBallY?:     number;
  foulCommitted: boolean;
  foulType?:     string;
  ballsPocketed: number[];
  timestamp:     number;
}

export interface IMatchDocument extends Document {
  roomId:      string;
  gameMode:    string;
  isRanked:    boolean;
  isTournament: boolean;
  tournamentId?: string;

  player1Id:   string;
  player2Id:   string;
  winnerId?:   string;
  loserId?:    string;
  winReason?:  string;

  // ELO snapshots — before and after
  player1EloBefore: number;
  player2EloBefore: number;
  player1EloAfter?: number;
  player2EloAfter?: number;
  player1EloDelta?: number;
  player2EloDelta?: number;

  // Coin awards
  player1CoinsAwarded: number;
  player2CoinsAwarded: number;

  status:    'in_progress' | 'finished' | 'abandoned';
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  shotCount:  number;

  // Input-only replay log (~5KB per match)
  shots: IShotRecord[];
}

const ShotRecordSchema = new Schema<IShotRecord>(
  {
    shotIndex:     { type: Number, required: true },
    playerId:      { type: String, required: true },
    aimAngle:      { type: Number, required: true },
    power:         { type: Number, required: true },
    spinX:         { type: Number, default: 0 },
    spinY:         { type: Number, default: 0 },
    cueBallX:      Number,
    cueBallY:      Number,
    foulCommitted: { type: Boolean, default: false },
    foulType:      String,
    ballsPocketed: [Number],
    timestamp:     { type: Number, required: true },
  },
  { _id: false },
);

const MatchSchema = new Schema<IMatchDocument>(
  {
    roomId:      { type: String, required: true, unique: true, index: true },
    gameMode:    { type: String, default: '8ball' },
    isRanked:    { type: Boolean, default: true },
    isTournament:{ type: Boolean, default: false },
    tournamentId:String,

    player1Id:  { type: String, required: true, index: true },
    player2Id:  { type: String, required: true, index: true },
    winnerId:   String,
    loserId:    String,
    winReason:  String,

    player1EloBefore: { type: Number, default: 0 },
    player2EloBefore: { type: Number, default: 0 },
    player1EloAfter:  Number,
    player2EloAfter:  Number,
    player1EloDelta:  Number,
    player2EloDelta:  Number,

    player1CoinsAwarded: { type: Number, default: 0 },
    player2CoinsAwarded: { type: Number, default: 0 },

    status:     { type: String, enum: ['in_progress', 'finished', 'abandoned'], default: 'in_progress' },
    startedAt:  { type: Date, default: () => new Date() },
    finishedAt: Date,
    durationMs: Number,
    shotCount:  { type: Number, default: 0 },

    shots: { type: [ShotRecordSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

MatchSchema.index({ player1Id: 1, startedAt: -1 });
MatchSchema.index({ player2Id: 1, startedAt: -1 });
MatchSchema.index({ status: 1 });

export const Match: Model<IMatchDocument> =
  mongoose.model<IMatchDocument>('Match', MatchSchema);
