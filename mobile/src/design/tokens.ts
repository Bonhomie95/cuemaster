// File: mobile/src/design/tokens.ts

export const Colors = {
  // Primary palette — deep green + gold
  feltGreen:    '#1B5E20',
  feltGreenMid: '#2E7D32',
  feltGreenLight:'#388E3C',
  gold:         '#F9A825',
  goldLight:    '#FFD54F',
  goldDark:     '#F57F17',

  // Background layers
  bg:           '#0A1A0C',
  bgCard:       '#112214',
  bgCardLight:  '#1A3320',
  bgOverlay:    'rgba(0,0,0,0.72)',

  // Ball colours
  ballCue:      '#F5F0DC',
  ball1:        '#F9A825',  // yellow
  ball2:        '#1565C0',  // blue
  ball3:        '#C62828',  // red
  ball4:        '#6A1B9A',  // purple
  ball5:        '#E65100',  // orange
  ball6:        '#1B5E20',  // green
  ball7:        '#6D1F00',  // maroon
  ball8:        '#1A1A1A',  // black
  // stripes same hues

  // UI
  white:        '#F9FAFB',
  whiteAlpha70: 'rgba(249,250,251,0.70)',
  whiteAlpha30: 'rgba(249,250,251,0.30)',
  gray100:      '#F3F4F6',
  gray300:      '#D1D5DB',
  gray400:      '#9CA3AF',
  gray500:      '#6B7280',
  gray600:      '#4B5563',
  gray700:      '#374151',
  gray800:      '#1F2937',
  gray900:      '#111827',

  // Semantic
  success:      '#22C55E',
  successDark:  '#15803D',
  danger:       '#EF4444',
  dangerDark:   '#B91C1C',
  warning:      '#F59E0B',
  info:         '#3B82F6',

  // Tier colours
  tierBeginner: '#9CA3AF',
  tierAmateur:  '#10B981',
  tierSkilled:  '#3B82F6',
  tierExpert:   '#8B5CF6',
  tierMaster:   '#F59E0B',
  tierDiamond:  '#06B6D4',
  tierLegend:   '#F9A825',
} as const;

export const Felt = {
  green:   { id: 'green',   label: 'Championship Green', color: '#2E7D32', dark: '#1B5E20' },
  blue:    { id: 'blue',    label: 'Midnight Blue',      color: '#1565C0', dark: '#0D47A1' },
  red:     { id: 'red',     label: 'Crimson Red',        color: '#C62828', dark: '#7F0000' },
  purple:  { id: 'purple',  label: 'Purple Royale',      color: '#6A1B9A', dark: '#38006B' },
  sand:    { id: 'sand',    label: 'Desert Sand',        color: '#A1887F', dark: '#6D4C41' },
  white:   { id: 'white',   label: 'Arctic White',       color: '#ECEFF1', dark: '#B0BEC5' },
} as const;

export type FeltId = keyof typeof Felt;

export const Typography = {
  xs:   { fontSize: 10, lineHeight: 14 },
  sm:   { fontSize: 12, lineHeight: 16 },
  base: { fontSize: 14, lineHeight: 20 },
  md:   { fontSize: 16, lineHeight: 22 },
  lg:   { fontSize: 18, lineHeight: 24 },
  xl:   { fontSize: 22, lineHeight: 28 },
  xxl:  { fontSize: 28, lineHeight: 34 },
  hero: { fontSize: 36, lineHeight: 42 },
} as const;

export const Radius = {
  sm:   6,
  md:   10,
  lg:   16,
  xl:   24,
  full: 999,
} as const;

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  gold: {
    shadowColor: '#F9A825',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

export const SPLASH_VIBES = [
  { label: 'Dark Luxury',   bg: ['#0A1A0C', '#1B3A1E', '#0A1A0C'] },
  { label: 'Neon Night',    bg: ['#0D0D1A', '#1A0D2E', '#0D1A1A'] },
  { label: 'Golden Hour',   bg: ['#1A0F00', '#2E1A00', '#0F1A05'] },
  { label: 'Deep Ocean',    bg: ['#000D1A', '#001A2E', '#00100D'] },
  { label: 'Royal Purple',  bg: ['#0D001A', '#1A0030', '#0A0D1A'] },
  { label: 'Crimson Club',  bg: ['#1A0000', '#2E0000', '#0D1A05'] },
  { label: 'Arctic Pro',    bg: ['#0A1520', '#102030', '#0A1A10'] },
  { label: 'Championship',  bg: ['#0A1A0C', '#0D2B10', '#1A0F00'] },
] as const;

export const CATCHPHRASES = [
  'Your shot. Your skill. Your prize.',
  'The world\'s sharpest players. Are you one?',
  'Pool, perfected.',
  'Rack up. Cash out.',
  'Every ball tells a story. What\'s yours?',
  'Where legends are made, one shot at a time.',
  'Break. Run. Win. Repeat.',
  'Precision is everything.',
  'The table never lies.',
  'Step up. Chalk up. Show up.',
  'Skill over luck. Always.',
  'Greatness is one shot away.',
  'The cue is mightier than the sword.',
  'Fortune favours the focused.',
] as const;

export const TIER_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  beginner: { label: 'Beginner',  color: Colors.tierBeginner, icon: '🎱' },
  amateur:  { label: 'Amateur',   color: Colors.tierAmateur,  icon: '⚡' },
  skilled:  { label: 'Skilled',   color: Colors.tierSkilled,  icon: '🔵' },
  expert:   { label: 'Expert',    color: Colors.tierExpert,   icon: '💜' },
  master:   { label: 'Master',    color: Colors.tierMaster,   icon: '🔥' },
  diamond:  { label: 'Diamond',   color: Colors.tierDiamond,  icon: '💎' },
  legend:   { label: 'Legend',    color: Colors.tierLegend,   icon: '👑' },
};

export const QUICK_CHAT = [
  'Good shot! 👏',
  'Nice try!',
  'Well played 🤝',
  'Lucky shot 😅',
  'GG!',
  'Rematch?',
  'Too easy 😎',
  'You got this!',
  '🔥 On fire!',
  'Back to back!',
] as const;
