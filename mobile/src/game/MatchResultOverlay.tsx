// File: mobile/src/game/MatchResultOverlay.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MatchResult } from '../types/game';

interface MatchResultOverlayProps {
  result:    MatchResult;
  myUserId:  string;
  onRematch: () => void;
  onHome:    () => void;
}

const WIN_REASON_LABEL: Record<string, string> = {
  pocketed_8ball:       'Pocketed the 8 ball!',
  opponent_forfeit:     'Opponent forfeited',
  opponent_disconnect:  'Opponent disconnected',
  foul_on_8ball:        'Foul on the 8 ball',
};

export const MatchResultOverlay: React.FC<MatchResultOverlayProps> = ({
  result, myUserId, onRematch, onHome,
}) => {
  const won = result.winnerId === myUserId;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={[styles.headline, won ? styles.win : styles.lose]}>
          {won ? '🏆 You Won!' : '💀 You Lost'}
        </Text>

        <Text style={styles.reason}>
          {WIN_REASON_LABEL[result.winReason] ?? result.winReason}
        </Text>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{result.shotCount}</Text>
            <Text style={styles.statLabel}>Shots</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>
              {Math.round(result.durationMs / 1000)}s
            </Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity style={styles.btnSecondary} onPress={onHome}>
            <Text style={styles.btnSecondaryText}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={onRematch}>
            <Text style={styles.btnPrimaryText}>Rematch</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          100,
  },
  card: {
    backgroundColor: '#1F2937',
    borderRadius:    20,
    padding:         32,
    width:           '80%',
    alignItems:      'center',
    gap:             16,
    borderWidth:     1,
    borderColor:     '#374151',
  },
  headline: { fontSize: 28, fontWeight: '800' },
  win:      { color: '#22C55E' },
  lose:     { color: '#EF4444' },
  reason:   { color: '#9CA3AF', fontSize: 14, textAlign: 'center' },
  stats:    { flexDirection: 'row', gap: 32 },
  stat:     { alignItems: 'center' },
  statVal:  { color: '#F9FAFB', fontSize: 22, fontWeight: '700' },
  statLabel:{ color: '#6B7280', fontSize: 12 },
  buttons:  { flexDirection: 'row', gap: 12, marginTop: 8 },
  btnPrimary: {
    backgroundColor: '#2563EB', paddingVertical: 12,
    paddingHorizontal: 28, borderRadius: 10,
  },
  btnPrimaryText:   { color: '#F9FAFB', fontWeight: '700', fontSize: 15 },
  btnSecondary: {
    borderWidth: 1, borderColor: '#4B5563',
    paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10,
  },
  btnSecondaryText: { color: '#9CA3AF', fontWeight: '600', fontSize: 15 },
});
