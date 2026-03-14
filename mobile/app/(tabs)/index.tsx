// File: mobile/app/(tabs)/index.tsx

import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { post, del }   from '../../src/api/client';

export default function HomeScreen() {
  const router    = useRouter();
  const user      = useAuthStore(s => s.user);
  const [finding, setFinding] = useState(false);

  const handleFindMatch = useCallback(async () => {
    if (!user) { router.push('/login'); return; }
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

  const handlePractice = useCallback(() => {
    if (!user) { router.push('/login'); return; }
    router.push('/game/practice');
  }, [user, router]);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>🎱 CueMaster</Text>
        {user ? (
          <View style={styles.userChip}>
            <Text style={styles.userChipText}>{user.displayName}</Text>
            <Text style={styles.eloText}>#{user.elo.rating}</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={() => router.push('/login')}>
            <Text style={styles.loginLink}>Sign in</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Coin balance */}
      {user && (
        <View style={styles.coinBadge}>
          <Text style={styles.coinText}>🪙 {user.coinBalance.toLocaleString()} coins</Text>
        </View>
      )}

      {/* Main actions */}
      <View style={styles.actions}>
        {finding ? (
          <View style={styles.findingCard}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.findingText}>Finding opponent…</Text>
            <Text style={styles.findingSubText}>ELO-matched, expanding every 10s</Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelQueue}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleFindMatch}>
              <Text style={styles.primaryBtnText}>🎯  Find Match</Text>
              <Text style={styles.primaryBtnSub}>Ranked · ELO matchmaking</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={handlePractice}>
              <Text style={styles.secondaryBtnText}>🧪  Practice</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Stats row */}
      {user && (
        <View style={styles.statsRow}>
          {[
            { label: 'Wins',   value: user.elo.wins   },
            { label: 'Losses', value: user.elo.losses },
            { label: 'Tier',   value: user.elo.tier   },
          ].map(s => (
            <View key={s.label} style={styles.stat}>
              <Text style={styles.statVal}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#0B0F17', padding: 20 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  logo:        { color: '#F9FAFB', fontSize: 22, fontWeight: '800' },
  userChip:    { alignItems: 'flex-end' },
  userChipText:{ color: '#D1D5DB', fontSize: 13, fontWeight: '600' },
  eloText:     { color: '#3B82F6', fontSize: 11 },
  loginLink:   { color: '#3B82F6', fontSize: 14, fontWeight: '600' },
  coinBadge:   { backgroundColor: '#1F2937', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 24 },
  coinText:    { color: '#FCD34D', fontSize: 13, fontWeight: '600' },
  actions:     { gap: 12, marginBottom: 32 },
  primaryBtn:  { backgroundColor: '#2563EB', borderRadius: 16, padding: 20, gap: 4 },
  primaryBtnText: { color: '#F9FAFB', fontSize: 18, fontWeight: '800' },
  primaryBtnSub:  { color: '#BFDBFE', fontSize: 12 },
  secondaryBtn:{ backgroundColor: '#1F2937', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#374151' },
  secondaryBtnText: { color: '#D1D5DB', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  findingCard: { backgroundColor: '#1F2937', borderRadius: 16, padding: 28, alignItems: 'center', gap: 10 },
  findingText: { color: '#F9FAFB', fontSize: 17, fontWeight: '700' },
  findingSubText: { color: '#6B7280', fontSize: 13 },
  cancelBtn:   { marginTop: 6, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1, borderColor: '#4B5563' },
  cancelBtnText: { color: '#9CA3AF', fontWeight: '600' },
  statsRow:    { flexDirection: 'row', gap: 12 },
  stat:        { flex: 1, backgroundColor: '#1F2937', borderRadius: 12, padding: 14, alignItems: 'center' },
  statVal:     { color: '#F9FAFB', fontSize: 20, fontWeight: '700' },
  statLabel:   { color: '#6B7280', fontSize: 11, marginTop: 2 },
});
