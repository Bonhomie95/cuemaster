// File: server/src/shared/models/User.ts

import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole, KYCStatus, SkillTier } from '../types/user';
import { ELO_DEFAULT } from '../constants';
import { env } from '../config/env';

export interface IUserDocument extends Document {
  username:     string;
  email:        string;
  passwordHash: string;
  role:         UserRole;
  isActive:     boolean;
  isBanned:     boolean;
  banReason?:   string;
  displayName:  string;
  avatarUrl?:   string;
  country?:     string;
  dateOfBirth?: string;
  ageVerifiedAt?: Date;
  elo: {
    rating: number; tier: SkillTier;
    wins: number; losses: number; draws: number;
    winStreak: number; bestStreak: number;
    tournamentsPlayed: number; tournamentsWon: number;
  };
  coinBalance: number;
  kyc: {
    status: KYCStatus;
    totalLifetimeEarningsUsdCents: number;
    verifiedAt?: Date;
    rejectionReason?: string;
  };
  responsibleGaming: {
    selfExcludedUntil?: Date;
    dailyDepositLimitCents?: number;
    monthlyDepositLimitCents?: number;
    last30DaySpendCents: number;
    spendResetAt: Date;
  };
  equippedCosmeticIds: { cueId?: string; feltId?: string; ballSetId?: string };
  deviceFingerprints: string[];
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUserDocument>(
  {
    username:     { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 20 },
    email:        { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role:         { type: String, enum: Object.values(UserRole), default: UserRole.PLAYER },
    isActive:     { type: Boolean, default: true },
    isBanned:     { type: Boolean, default: false },
    banReason:    String,
    displayName:  { type: String, required: true, trim: true, maxlength: 32 },
    avatarUrl:    String,
    country:      { type: String, maxlength: 2 },
    dateOfBirth:  String,
    ageVerifiedAt: Date,
    elo: {
      rating:            { type: Number, default: ELO_DEFAULT },
      tier:              { type: String, enum: Object.values(SkillTier), default: SkillTier.BEGINNER },
      wins:              { type: Number, default: 0 },
      losses:            { type: Number, default: 0 },
      draws:             { type: Number, default: 0 },
      winStreak:         { type: Number, default: 0 },
      bestStreak:        { type: Number, default: 0 },
      tournamentsPlayed: { type: Number, default: 0 },
      tournamentsWon:    { type: Number, default: 0 },
    },
    coinBalance: { type: Number, default: 0, min: 0 },
    kyc: {
      status:                        { type: String, enum: Object.values(KYCStatus), default: KYCStatus.NONE },
      totalLifetimeEarningsUsdCents: { type: Number, default: 0 },
      verifiedAt:       Date,
      rejectionReason:  String,
    },
    responsibleGaming: {
      selfExcludedUntil:        Date,
      dailyDepositLimitCents:   Number,
      monthlyDepositLimitCents: Number,
      last30DaySpendCents: { type: Number, default: 0 },
      spendResetAt:        { type: Date, default: () => new Date() },
    },
    equippedCosmeticIds: { cueId: String, feltId: String, ballSetId: String },
    deviceFingerprints: [String],
  },
  { timestamps: true, versionKey: false },
);

UserSchema.index({ 'elo.rating': -1 });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, env.BCRYPT_ROUNDS);
  next();
});

UserSchema.methods['comparePassword'] = function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

export const User: Model<IUserDocument> = mongoose.model<IUserDocument>('User', UserSchema);
