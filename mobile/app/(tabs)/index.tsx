// File: mobile/app/(tabs)/index.tsx

import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Dimensions, ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Radius, Shadow, TIER_LABELS } from '../../src/design/tokens';
import { GoldButton } from '../../src/components/GoldButton';
import { TierBadge }  from '../../src/components/TierBadge';
import { useAuthStore } from '../../src/store/authStore';
import { post, del }    from '../../src/api/client';

const { width } = Dimensions.get('window');

// ── Mock tournament data (Phase 6 wires real data) ────────────────────────────
const MOCK_TOURNAMENTS = [
  { id: 't1', name: 'Daily Grind',    tier: 'Daily',   prize: '$50',    entry: '10',  players: '14/16', starts: '2h',   color: Colors.ball2 },
  { id: 't2', name: 'Weekend Wars',   tier: 'Weekly',  prize: '$250',   entry: '50',  players: '22/32', starts: '6h',   color: Colors.ball3 },
  { id: 't3', name: 'Gold Invitational', tier: 'Major', prize: '$1,000', entry: '200', players: '8/64',  starts: '2d',   color: Colors.gold },
  { id: 't4', name: 'Tuesday Rush',   tier: 'Daily',   prize: '$75',    entry: '10',  players: '10/16', starts: '45m',  color: Colors.ball5 },
  { id: 't5', name: 'Monthly Finals', tier: 'Monthly', prize: '$500',   entry: '200', players: '44/64', starts: '3d',   color: Colors.ball4 },
];

// ── Lazy Susan Carousel ────────────────────────────────────────────────────────

const CARD_W   = 200;
const CARD_GAP = 16;

function TournamentCarousel() {
  const scrollX   = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={carousel.wrapper}>
      <Text style={carousel.heading}>Tournaments</Text>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + CARD_GAP}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 20, gap: CARD_GAP }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {MOCK_TOURNAMENTS.map((t, i) => {
          const inputRange = [
            (i - 1) * (CARD_W + CARD_GAP),
            i       * (CARD_W + CARD_GAP),
            (i + 1) * (CARD_W + CARD_GAP),
          ];
          const scale = scrollX.interpolate({ inputRange, outputRange: [0.88, 1, 0.88], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.65, 1, 0.65], extrapolate: 'clamp' });

          return (
            <Animated.View key={t.id} style={[carousel.card, { width: CARD_W, transform: [{ scale }], opacity, borderColor: t.color }]}>
              <View style={[carousel.tierBadge, { backgroundColor: t.color + '30' }]}>
                <Text style={[carousel.tierText, { color: t.color }]}>{t.tier}</Text>
              </View>
              <Text style={carousel.cardName}>{t.name}</Text>
              <Text style={carousel.cardPrize}>{t.prize}</Text>
              <View style={carousel.cardRow}>
                <Text style={carousel.cardMeta}>👥 {t.players}</Text>
                <Text style={carousel.cardMeta}>⏰ {t.starts}</Text>
              </View>
              <View style={carousel.cardRow}>
                <Text style={carousel.cardEntry}>🪙 {t.entry} entry</Text>
              </View>
              <TouchableOpacity style={[carousel.joinBtn, { borderColor: t.color }]}>
                <Text style={[carousel.joinBtnText, { color: t.color }]}>Join</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const carousel = StyleSheet.create({
  wrapper:    { marginTop: 8 },
  heading:    { ...Typography.lg, fontWeight: '800', color: Colors.white, paddingHorizontal: 20, marginBottom: 12 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    padding: 16, gap: 8,
    ...Shadow.card,
  },
  tierBadge:  { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  tierText:   { ...Typography.xs, fontWeight: '700' },
  cardName:   { ...Typography.md, fontWeight: '800', color: Colors.white },
  cardPrize:  { ...Typography.xxl, fontWeight: '900', color: Colors.gold },
  cardRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  cardMeta:   { ...Typography.xs, color: Colors.gray400 },
  cardEntry:  { ...Typography.sm, color: Colors.gray300 },
  joinBtn: {
    marginTop: 4, paddingVertical: 8, borderRadius: Radius.md,
    borderWidth: 1.5, alignItems: 'center',
  },
  joinBtnText: { ...Typography.sm, fontWeight: '700' },
});

// ── Quick stats row ────────────────────────────────────────────────────────────

function StatsRow({ user }: { user: { elo: { wins: number; losses: number; tier: string; rating: number } } }) {
  const total   = user.elo.wins + user.elo.losses;
  const winRate = total > 0 ? Math.round((user.elo.wins / total) * 100) : 0;

  return (
    <View style={stats.row}>
      {[
        { label: 'Wins',     value: String(user.elo.wins) },
        { label: 'Win Rate', value: `${winRate}%` },
        { label: 'ELO',      value: String(user.elo.rating) },
      ].map(s => (
        <View key={s.label} style={stats.card}>
          <Text style={stats.val}>{s.value}</Text>
          <Text style={stats.label}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const stats = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  card:  { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.gray800 },
  val:   { ...Typography.xl, fontWeight: '800', color: Colors.gold },
  label: { ...Typography.xs, color: Colors.gray400, marginTop: 2 },
});

// ── Main HomeScreen ────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router   = useRouter();
  const user     = useAuthStore(s => s.user);
  const [finding, setFinding] = useState(false);
  const playScale = useRef(new Animated.Value(1)).current;

  const pulsePlay = () => {
    Animated.sequence([
      Animated.spring(playScale, { toValue: 0.93, useNativeDriver: true, friction: 8 }),
      Animated.spring(playScale, { toValue: 1,    useNativeDriver: true, friction: 8 }),
    ]).start();
  };

  const handleFindMatch = useCallback(async () => {
    if (!user) { router.push('/login'); return; }
    pulsePlay();
    setFinding(true);
    try {
      const res = await post<{ roomId: string }>('/api/matches/queue', {});
      router.push(`/game/${res.roomId}`);
    } catch (err) {
      Alert.alert('Matchmaking', err instanceof Error ? err.message : 'No opponent found');
    } finally {
      setFinding(false);
    }
  }, [user, router]);

  const handleCancelQueue = useCallback(async () => {
    setFinding(false);
    await del('/api/matches/queue');
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Top bar ────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        {/* Left: coins + rank */}
        <View style={styles.topLeft}>
          <TouchableOpacity style={styles.coinChip} onPress={() => router.push('/store')}>
            <Text style={styles.coinIcon}>🪙</Text>
            <Text style={styles.coinAmount}>{user?.coinBalance?.toLocaleString() ?? '0'}</Text>
          </TouchableOpacity>
          {user && (
            <TouchableOpacity style={styles.rankChip} onPress={() => router.push('/leaderboard')}>
              <TierBadge tier={user.elo.tier} size="sm" />
            </TouchableOpacity>
          )}
        </View>

        {/* Centre: logo */}
        <Text style={styles.logo}>🎱</Text>

        {/* Right: profile + settings */}
        <View style={styles.topRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/settings')}>
            <Text style={styles.iconBtnText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.avatarBtn]}
            onPress={() => user ? router.push('/profile') : router.push('/login')}
          >
            <Text style={styles.iconBtnText}>{user ? '👤' : '🔑'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Hero PLAY button ───────────────────────────────────────── */}
        <View style={styles.heroSection}>
          {finding ? (
            <View style={styles.findingCard}>
              <ActivityIndicator size="large" color={Colors.gold} />
              <Text style={styles.findingTitle}>Finding your opponent…</Text>
              <Text style={styles.findingSub}>ELO-matched · expanding every 10s</Text>
              <GoldButton label="Cancel" variant="outline" onPress={handleCancelQueue} />
            </View>
          ) : (
            <>
              <Animated.View style={{ transform: [{ scale: playScale }] }}>
                <TouchableOpacity style={styles.playBtn} onPress={handleFindMatch} activeOpacity={0.85}>
                  <Text style={styles.playBtnText}>PLAY</Text>
                  <Text style={styles.playBtnSub}>Ranked Match</Text>
                </TouchableOpacity>
              </Animated.View>

              <View style={styles.quickActions}>
                <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/game/practice')}>
                  <Text style={styles.quickIcon}>🧪</Text>
                  <Text style={styles.quickLabel}>Practice</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/store')}>
                  <Text style={styles.quickIcon}>🛍️</Text>
                  <Text style={styles.quickLabel}>Store</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/leaderboard')}>
                  <Text style={styles.quickIcon}>🏆</Text>
                  <Text style={styles.quickLabel}>Rankings</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickBtn} onPress={() => Alert.alert('Friends', 'Coming soon!')}>
                  <Text style={styles.quickIcon}>👥</Text>
                  <Text style={styles.quickLabel}>Friends</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Stats row */}
        {user && <StatsRow user={user} />}

        {/* Tournament carousel */}
        <TournamentCarousel />

        {/* Daily bonus card */}
        <TouchableOpacity style={styles.bonusCard}>
          <Text style={styles.bonusIcon}>🎁</Text>
          <View style={styles.bonusText}>
            <Text style={styles.bonusTitle}>Daily Bonus</Text>
            <Text style={styles.bonusSub}>Claim your free 25 coins today</Text>
          </View>
          <Text style={styles.bonusArrow}>›</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingBottom: 40 },

  // Top bar
  topBar: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 16,
    paddingTop:      52,
    paddingBottom:   12,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray800,
  },
  topLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' },
  logo:     { fontSize: 28 },

  coinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.bgCardLight,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.gold + '40',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  coinIcon:   { fontSize: 14 },
  coinAmount: { ...Typography.sm, fontWeight: '700', color: Colors.gold },
  rankChip:   {},

  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bgCardLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.gray700,
  },
  avatarBtn:    { borderColor: Colors.gold + '60' },
  iconBtnText:  { fontSize: 16 },

  // Hero
  heroSection: { alignItems: 'center', paddingVertical: 36, gap: 24 },
  playBtn: {
    width:  180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.feltGreenMid,
    borderWidth: 4,
    borderColor: Colors.gold,
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    Colors.gold,
    shadowOffset:   { width: 0, height: 0 },
    shadowOpacity:  0.55,
    shadowRadius:   28,
    elevation:      16,
  },
  playBtnText: { ...Typography.hero, fontWeight: '900', color: Colors.gold, letterSpacing: 4 },
  playBtnSub:  { ...Typography.sm,   color: Colors.goldLight, marginTop: 2 },

  quickActions: { flexDirection: 'row', gap: 16 },
  quickBtn: {
    alignItems: 'center', gap: 4,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg, padding: 14,
    borderWidth: 1, borderColor: Colors.gray800,
    minWidth: 68,
  },
  quickIcon:  { fontSize: 22 },
  quickLabel: { ...Typography.xs, color: Colors.gray400, fontWeight: '600' },

  // Finding
  findingCard: {
    alignItems: 'center', gap: 14,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl, padding: 32,
    borderWidth: 1.5, borderColor: Colors.gold + '40',
    width: '85%',
    ...Shadow.gold,
  },
  findingTitle: { ...Typography.lg,   fontWeight: '700', color: Colors.white },
  findingSub:   { ...Typography.sm,   color: Colors.gray400 },

  // Bonus card
  bonusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    margin: 20, marginTop: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg, padding: 16,
    borderWidth: 1, borderColor: Colors.gold + '30',
  },
  bonusIcon:  { fontSize: 28 },
  bonusText:  { flex: 1 },
  bonusTitle: { ...Typography.base, fontWeight: '700', color: Colors.gold },
  bonusSub:   { ...Typography.sm,   color: Colors.gray400 },
  bonusArrow: { color: Colors.gold, fontSize: 22 },
});
