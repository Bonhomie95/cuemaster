// File: server/src/shared/utils/elo.ts

import { ELO_DEFAULT, ELO_K_FACTOR, ELO_K_PROVISIONAL, ELO_PROVISIONAL_GAMES, ELO_TIER_THRESHOLDS } from '../constants';
import { SkillTier } from '../types/user';

function expected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export function calculateEloChange(
  winnerRating: number, loserRating: number,
  winnerGames: number,  loserGames: number,
) {
  const kW = winnerGames < ELO_PROVISIONAL_GAMES ? ELO_K_PROVISIONAL : ELO_K_FACTOR;
  const kL = loserGames  < ELO_PROVISIONAL_GAMES ? ELO_K_PROVISIONAL : ELO_K_FACTOR;
  const winnerDelta = Math.round(kW * (1 - expected(winnerRating, loserRating)));
  const loserDelta  = Math.round(kL * (0 - expected(loserRating, winnerRating)));
  return {
    winnerNewRating: winnerRating + winnerDelta,
    loserNewRating:  Math.max(ELO_DEFAULT, loserRating + loserDelta),
    winnerDelta,
    loserDelta,
  };
}

export function getTierFromRating(rating: number): SkillTier {
  for (const [tier, [min, max]] of Object.entries(ELO_TIER_THRESHOLDS)) {
    if (rating >= min && rating <= max) return tier as SkillTier;
  }
  return SkillTier.LEGEND;
}
