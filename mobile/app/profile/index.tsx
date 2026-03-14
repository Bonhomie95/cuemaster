// File: mobile/app/profile/index.tsx

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Radius, Shadow } from '../../src/design/tokens';
import { TierBadge } from '../../src/components/TierBadge';
import { GoldButton } from '../../src/components/GoldButton';
import { useAuthStore } from '../../src/store/authStore';

export default function ProfileScreen() {
  const router  = useRouter();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const authUser   = useAuthStore(s => s.user);
  const logout     = useAuthStore(s => s.logout);

  // If userId param is set, viewing someone else's profile (Phase 6: fetch from API)
  const isOwnProfile = !userId || userId === authUser?._id;
  const user = authUser; // TODO: fetch other user when userId !== authUser._id

  if (!user) {
    return (
      <View style={styles.root}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.centred}>
          <Text style={styles.emptyText}>Sign in to view your profile</Text>
          <GoldButton label="Sign In" onPress={() => router.push('/login')} />
        </View>
      </View>
    );
  }

  const total   = user.elo.wins + user.elo.losses;
  const winRate = total > 0 ? Math.round((user.elo.wins / total) * 100) : 0;

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          {isOwnProfile && (
            <TouchableOpacity onPress={() => router.push('/settings')}>
              <Text style={styles.settingsIcon}>⚙️</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarEmoji}>🧑‍🎱</Text>
          </View>
          <Text style={styles.displayName}>{user.displayName}</Text>
          <Text style={styles.username}>@{user.username}</Text>
          <TierBadge tier={user.elo.tier} size="lg" />
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {[
            { icon: '🏆', label: 'Wins',     value: String(user.elo.wins) },
            { icon: '💔', label: 'Losses',   value: String(user.elo.losses) },
            { icon: '📊', label: 'Win Rate', value: `${winRate}%` },
            { icon: '⚡', label: 'ELO',      value: String(user.elo.rating) },
            { icon: '🔥', label: 'Streak',   value: '0' },
            { icon: '🪙', label: 'Coins',    value: user.coinBalance.toLocaleString() },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statIcon}>{s.icon}</Text>
              <Text style={styles.statVal}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Trophies */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏅 Trophies</Text>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>Win tournaments to earn trophies</Text>
          </View>
        </View>

        {/* Recent matches */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎱 Recent Matches</Text>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No matches yet — play to build your history</Text>
          </View>
        </View>

        {/* Actions */}
        {isOwnProfile ? (
          <View style={styles.actions}>
            <GoldButton label="Edit Profile"  variant="outline" onPress={() => {}} fullWidth />
            <GoldButton label="Sign Out"      variant="danger"  onPress={() => { logout(); router.replace('/'); }} fullWidth />
          </View>
        ) : (
          <View style={styles.actions}>
            <GoldButton label="Challenge"     variant="gold"    onPress={() => {}} fullWidth />
            <GoldButton label="Add Friend"    variant="outline" onPress={() => {}} fullWidth />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingBottom: 40 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
  },
  backBtn:    { padding: 8 },
  backText:   { color: Colors.gold, fontSize: 28, fontWeight: '300' },
  settingsIcon: { fontSize: 22 },

  avatarSection: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  avatarRing: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.bgCardLight,
    borderWidth: 3, borderColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    ...Shadow.gold,
  },
  avatarEmoji:  { fontSize: 52 },
  displayName:  { ...Typography.xxl, fontWeight: '800', color: Colors.white },
  username:     { ...Typography.base, color: Colors.gray400 },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, marginTop: 8,
  },
  statCard: {
    width: '30%', flexGrow: 1,
    backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: 12,
    alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.gray800,
  },
  statIcon:  { fontSize: 18 },
  statVal:   { ...Typography.xl, fontWeight: '800', color: Colors.gold },
  statLabel: { ...Typography.xs, color: Colors.gray500 },

  section:      { padding: 16, paddingBottom: 0 },
  sectionTitle: { ...Typography.md, fontWeight: '800', color: Colors.white, marginBottom: 10 },
  emptyCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.gray800,
    borderStyle: 'dashed',
  },
  emptyCardText: { ...Typography.sm, color: Colors.gray500, textAlign: 'center' },

  actions:  { padding: 16, gap: 10, marginTop: 8 },
  centred:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText:{ ...Typography.base, color: Colors.gray400 },
});
