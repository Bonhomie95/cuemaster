// File: mobile/src/game/ScoreBar.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PlayerState, MatchState, BallGroup } from '../types/game';

interface ScoreBarProps {
  match:    MatchState;
  myUserId: string;
}

function BallGroupDots({ group, pocketed }: { group: BallGroup; pocketed: number[] }) {
  if (!group) return null;
  const ids = group === 'solids'
    ? [1, 2, 3, 4, 5, 6, 7]
    : [9, 10, 11, 12, 13, 14, 15];

  return (
    <View style={styles.dots}>
      {ids.map(id => (
        <View
          key={id}
          style={[
            styles.dot,
            pocketed.includes(id) && styles.dotPocketed,
          ]}
        />
      ))}
    </View>
  );
}

function PlayerPanel({
  player, isMyTurn, isMe,
}: { player: PlayerState; isMyTurn: boolean; isMe: boolean }) {
  return (
    <View style={[styles.playerPanel, isMyTurn && styles.activePanel]}>
      <View style={styles.nameRow}>
        <Text style={[styles.name, isMe && styles.myName]} numberOfLines={1}>
          {player.displayName}
        </Text>
        <Text style={styles.elo}>#{player.eloRating}</Text>
      </View>
      <BallGroupDots
        group={player.ballGroup as BallGroup}
        pocketed={Array.from(player.ballsPocketed as unknown as number[])}
      />
      {isMyTurn && (
        <Text style={styles.timer}>{player.turnTimeRemaining}s</Text>
      )}
    </View>
  );
}

export const ScoreBar: React.FC<ScoreBarProps> = ({ match, myUserId }) => {
  const playerEntries = Object.entries(match.players);
  const me    = playerEntries.find(([id]) => id === myUserId);
  const other = playerEntries.find(([id]) => id !== myUserId);

  if (!me || !other) return null;

  const [meId, mePlayer]       = me;
  const [otherId, otherPlayer] = other;

  const myTurn    = match.currentTurn === meId;
  const theirTurn = match.currentTurn === otherId;

  return (
    <View style={styles.container}>
      <PlayerPanel player={mePlayer}    isMyTurn={myTurn}    isMe={true}  />

      <View style={styles.centre}>
        {match.status === 'countdown' ? (
          <Text style={styles.countdownText}>{match.countdown}</Text>
        ) : (
          <Text style={styles.vsText}>VS</Text>
        )}
        <Text style={styles.shotCount}>#{match.shotCount}</Text>
      </View>

      <PlayerPanel player={otherPlayer} isMyTurn={theirTurn} isMe={false} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical:   8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  playerPanel: {
    flex: 1, padding: 6, borderRadius: 8,
    backgroundColor: '#1F2937',
  },
  activePanel: {
    backgroundColor: '#1E3A5F',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  name:    { color: '#F9FAFB', fontSize: 13, fontWeight: '600', flex: 1 },
  myName:  { color: '#60A5FA' },
  elo:     { color: '#6B7280', fontSize: 11 },
  timer:   { color: '#F59E0B', fontSize: 12, fontWeight: '700', marginTop: 4 },
  dots:    { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 2 },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#374151',
    borderWidth: 1, borderColor: '#4B5563',
  },
  dotPocketed: { backgroundColor: '#22C55E', borderColor: '#16A34A' },
  centre:    { width: 48, alignItems: 'center', gap: 2 },
  vsText:    { color: '#4B5563', fontSize: 12, fontWeight: '700' },
  countdownText: { color: '#F59E0B', fontSize: 24, fontWeight: '800' },
  shotCount: { color: '#374151', fontSize: 10 },
});
