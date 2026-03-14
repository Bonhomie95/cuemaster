// -----------------------------------------------------------------------------
// File: server/src/shared/types/user.ts
// -----------------------------------------------------------------------------

export enum UserRole {
  PLAYER = 'player',
  ADMIN  = 'admin',
  MOD    = 'moderator',
}

export enum KYCStatus {
  NONE     = 'none',
  PENDING  = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export const KYC_THRESHOLDS = {
  TIER_1:  10_000,
  TIER_2:  50_000,
  TIER_3: 100_000,
  TIER_4: 400_000,
} as const;

export enum SkillTier {
  BEGINNER = 'beginner',
  AMATEUR  = 'amateur',
  SKILLED  = 'skilled',
  EXPERT   = 'expert',
  MASTER   = 'master',
  DIAMOND  = 'diamond',
  LEGEND   = 'legend',
}

export interface EloStats {
  rating:            number;
  tier:              SkillTier;
  wins:              number;
  losses:            number;
  draws:             number;
  winStreak:         number;
  bestStreak:        number;
  tournamentsPlayed: number;
  tournamentsWon:    number;
}

export interface AuthTokenPayload {
  userId:   string;
  username: string;
  role:     UserRole;
  iat?:     number;
  exp?:     number;
}
