// File: mobile/app/leaderboard/index.tsx

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Radius, TIER_LABELS } from '../../src/design/tokens';
import { TierBadge } from '../../src/components/TierBadge';
import { get }       from '../../src/api/client';

type Period = 'weekly' | 'monthly' | 'alltime';

interface LeaderboardEntry {
  rank:        number;
  userId:      string;
  displayName: string;
  avatarEmoji: string;
  eloRating:   number;
  tier:        string;
  wins:        number;
  country:     string;
  countryFlag: string;
}

// Mock data — Phase 6 replaces with real API
const MOCK_LEADERS: LeaderboardEntry[] = [
  { rank: 1,  userId: 'u1', displayName: 'ShadowBreak',  avatarEmoji: '🦁', eloRating: 2340, tier: 'legend',  wins: 412, country: 'US', countryFlag: '🇺🇸' },
  { rank: 2,  userId: 'u2', displayName: 'QueenOfCues',  avatarEmoji: '👩‍🎱', eloRating: 2218, tier: 'legend',  wins: 388, country: 'GB', countryFlag: '🇬🇧' },
  { rank: 3,  userId: 'u3', displayName: 'EightBallKing', avatarEmoji: '👑', eloRating: 2175, tier: 'legend',  wins: 356, country: 'NG', countryFlag: '🇳🇬' },
  { rank: 4,  userId: 'u4', displayName: 'SlickStick',   avatarEmoji: '🐺', eloRating: 2091, tier: 'diamond', wins: 301, country: 'CA', countryFlag: '🇨🇦' },
  { rank: 5,  userId: 'u5', displayName: 'PocketRocket',  avatarEmoji: '🚀', eloRating: 1988, tier: 'diamond', wins: 278, country: 'AU', countryFlag: '🇦🇺' },
  { rank: 6,  userId: 'u6', displayName: 'ChalkyFingers', avatarEmoji: '✋', eloRating: 1902, tier: 'diamond', wins: 245, country: 'DE', countryFlag: '🇩🇪' },
  { rank: 7,  userId: 'u7', displayName: 'RunTheTable',  avatarEmoji: '🔥', eloRating: 1845, tier: 'master',  wins: 234, country: 'BR', countryFlag: '🇧🇷' },
  { rank: 8,  userId: 'u8', displayName: 'MasseShotPro', avatarEmoji: '💎', eloRating: 1788, tier: 'master',  wins: 219, country: 'JP', countryFlag: '🇯🇵' },
  { rank: 9,  userId: 'u9', displayName: 'BankShotAce',  avatarEmoji: '🎯', eloRating: 1723, tier: 'master',  wins: 201, country: 'FR', countryFlag: '🇫🇷' },
  { rank: 10, userId: 'u10',displayName: 'CleanBreak',   avatarEmoji: '⚡', eloRating: 1680, tier: 'master',  wins: 189, country: 'ZA', countryFlag: '🇿🇦' },
];

function PodiumCard({ entry, height, delay }: { entry: LeaderboardEntry; height: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const medalColors: Record<number, string> = { 1: Colors.gold, 2: '#C0C0C0', 3: '#CD7F32' };
  const medal = medalColors[entry.rank] ?? Colors.gray500;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration: 600, delay,
      useNativeDriver: false,
    }).start();
  }, []);

  return (
    <Animated.View style={[podium.card, {
      height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, height] }),
      borderColor: medal,
    }]}>
      <Text style={[podium.rank, { color: medal }]}>#{entry.rank}</Text>
      <Text style={podium.avatar}>{entry.avatarEmoji}</Text>
      <Text style={podium.name} numberOfLines={1}>{entry.displayName}</Text>
      <Text style={[podium.elo, { color: medal }]}>{entry.eloRating}</Text>
    </Animated.View>
  );
}

const podium = StyleSheet.create({
  card: {
    flex: 1, alignItems: 'center', justifyContent: 'flex-end',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg, borderWidth: 2,
    padding: 10, overflow: 'hidden',
    gap: 4,
  },
  rank:   { ...Typography.xl, fontWeight: '900' },
  avatar: { fontSize: 28 },
  name:   { ...Typography.xs, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  elo:    { ...Typography.sm, fontWeight: '800' },
});

function RankCard({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const slideAnim = useRef(new Animated.Value(60)).current;
  const opacity   = useRef(new Animated.Value(0)).current;
  const router    = useRouter();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.timing(opacity,   { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const tierInfo = TIER_LABELS[entry.tier] ?? TIER_LABELS['beginner']!;

  return (
    <Animated.View style={{ transform: [{ translateX: slideAnim }], opacity }}>
      <TouchableOpacity style={rc.card} onPress={() => router.push(`/profile?userId=${entry.userId}`)}>
        <Text style={rc.rank}>#{entry.rank}</Text>
        <Text style={rc.avatar}>{entry.avatarEmoji}</Text>
        <View style={rc.info}>
          <View style={rc.nameRow}>
            <Text style={rc.name}>{entry.displayName}</Text>
            <Text style={rc.flag}>{entry.countryFlag}</Text>
          </View>
          <TierBadge tier={entry.tier} size="sm" />
        </View>
        <View style={rc.stats}>
          <Text style={rc.elo}>{entry.eloRating}</Text>
          <Text style={rc.wins}>{entry.wins}W</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const rc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    padding: 12, borderWidth: 1, borderColor: Colors.gray800,
  },
  rank:    { ...Typography.md, fontWeight: '800', color: Colors.gray500, width: 36, textAlign: 'center' },
  avatar:  { fontSize: 28 },
  info:    { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:    { ...Typography.base, fontWeight: '700', color: Colors.white },
  flag:    { fontSize: 14 },
  stats:   { alignItems: 'flex-end', gap: 2 },
  elo:     { ...Typography.md, fontWeight: '800', color: Colors.gold },
  wins:    { ...Typography.xs, color: Colors.gray400 },
});

export default function LeaderboardScreen() {
  const router  = useRouter();
  const [period, setPeriod] = useState<Period>('alltime');

  const top3   = MOCK_LEADERS.slice(0, 3);
  const rest   = MOCK_LEADERS.slice(3);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Leaderboard</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Period tabs */}
      <View style={styles.tabs}>
        {(['weekly', 'monthly', 'alltime'] as Period[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.tab, period === p && styles.tabActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.tabText, period === p && styles.tabTextActive]}>
              {p === 'alltime' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Podium */}
        <View style={styles.podiumRow}>
          {top3[1] && <PodiumCard entry={top3[1]} height={120} delay={100} />}
          {top3[0] && <PodiumCard entry={top3[0]} height={160} delay={0}   />}
          {top3[2] && <PodiumCard entry={top3[2]} height={100} delay={200} />}
        </View>

        {/* Ranked list */}
        <View style={styles.list}>
          {rest.map((entry, i) => (
            <RankCard key={entry.userId} entry={entry} index={i} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.gray800,
  },
  backBtn:  { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: Colors.gold, fontSize: 28, fontWeight: '300' },
  title:    { ...Typography.xl, fontWeight: '800', color: Colors.white },

  tabs: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8,
  },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: Radius.md,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.gray700,
    alignItems: 'center',
  },
  tabActive:     { backgroundColor: Colors.gold + '20', borderColor: Colors.gold },
  tabText:       { ...Typography.sm, fontWeight: '600', color: Colors.gray400 },
  tabTextActive: { color: Colors.gold, fontWeight: '800' },

  podiumRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 20, height: 180 },
  list:      { gap: 8 },
});
