// -----------------------------------------------------------------------------
// File: server/src/shared/types/coin.ts
// -----------------------------------------------------------------------------

export enum CoinTransactionType {
  PURCHASE          = 'purchase',
  DAILY_BONUS       = 'daily_bonus',
  WIN_REWARD        = 'win_reward',
  REFERRAL          = 'referral',
  PROMOTION         = 'promotion',
  SUBSCRIPTION      = 'subscription',
  REFUND            = 'refund',
  TOURNAMENT_ENTRY  = 'tournament_entry',
  COSMETIC_PURCHASE = 'cosmetic_purchase',
  ADJUSTMENT        = 'adjustment',
}

export interface CoinPack {
  id:              string;
  name:            string;
  coins:           number;
  bonusCoins:      number;
  priceUsdCents:   number;
  revenueCatSkuId: string;
  badgeLabel?:     string;
  isHighlighted:   boolean;
}

export const COIN_PACKS: CoinPack[] = [
  { id: 'pack_starter',  name: 'Starter',  coins: 500,    bonusCoins: 0,     priceUsdCents: 99,    revenueCatSkuId: 'cuemaster_coins_500',   isHighlighted: false },
  { id: 'pack_player',   name: 'Player',   coins: 1_200,  bonusCoins: 100,   priceUsdCents: 199,   revenueCatSkuId: 'cuemaster_coins_1200',  isHighlighted: false },
  { id: 'pack_pro',      name: 'Pro',      coins: 3_000,  bonusCoins: 500,   priceUsdCents: 499,   revenueCatSkuId: 'cuemaster_coins_3000',  isHighlighted: true,  badgeLabel: 'Most Popular' },
  { id: 'pack_champion', name: 'Champion', coins: 7_000,  bonusCoins: 1_500, priceUsdCents: 999,   revenueCatSkuId: 'cuemaster_coins_7000',  isHighlighted: false },
  { id: 'pack_master',   name: 'Master',   coins: 20_000, bonusCoins: 5_000, priceUsdCents: 2_499, revenueCatSkuId: 'cuemaster_coins_20000', isHighlighted: false, badgeLabel: 'Best Value' },
];

export const PRIZE_POOL_DISTRIBUTION = {
  prizePoolPct: 0.60,
  platformPct:  0.30,
  escrowPct:    0.10,
} as const;
