// File: mobile/app/game/[roomId].tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, useWindowDimensions, ActivityIndicator,
  TouchableOpacity, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colyseusClient }       from '../../src/game/ColyseusClient';
import { TableRenderer, getTableLayout } from '../../src/game/TableRenderer';
import { AimGestureHandler }    from '../../src/game/AimGestureHandler';
import { ShotControls }         from '../../src/game/ShotControls';
import { ScoreBar }             from '../../src/game/ScoreBar';
import { MatchResultOverlay }   from '../../src/game/MatchResultOverlay';
import { useGameStore }         from '../../src/store/gameStore';
import { useAuthStore }         from '../../src/store/authStore';
import { del }                  from '../../src/api/client';

export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router     = useRouter();
  const { width, height } = useWindowDimensions();

  const match       = useGameStore(s => s.match);
  const myUserId    = useGameStore(s => s.myUserId);
  const isConnected = useGameStore(s => s.isConnected);
  const lastFoul    = useGameStore(s => s.lastFoul);
  const matchResult = useGameStore(s => s.matchResult);
  const errorMsg    = useGameStore(s => s.errorMsg);
  const authUser    = useAuthStore(s => s.user);

  const [aimAngle, setAimAngle] = useState(0);
  const [isJoining, setIsJoining] = useState(true);

  // ── Connect on mount ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!authUser) { router.replace('/'); return; }

    useGameStore.getState().setMyUserId(authUser._id);

    const join = async () => {
      try {
        if (roomId && roomId !== 'practice') {
          await colyseusClient.joinRoom(roomId as string);
        } else {
          await colyseusClient.joinPractice();
        }
        colyseusClient.sendReady();
      } catch (err) {
        Alert.alert('Connection failed', err instanceof Error ? err.message : 'Unknown error', [
          { text: 'Back', onPress: () => router.back() },
        ]);
      } finally {
        setIsJoining(false);
      }
    };

    join();

    return () => {
      colyseusClient.leave();
      del('/api/matches/queue').catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Layout ─────────────────────────────────────────────────────────────────

  const HUD_TOP    = 64;
  const HUD_BOTTOM = 120;
  const tableH     = height - HUD_TOP - HUD_BOTTOM;
  const layout     = getTableLayout(width, tableH);

  // ── Derived state ──────────────────────────────────────────────────────────

  const balls         = match?.balls ?? [];
  const cueBall       = balls.find(b => b.id === 0 && !b.isPocketed) ?? null;
  const isMyTurn      = !!match && match.currentTurn === myUserId;
  const canShoot      = isMyTurn && match?.turnPhase === 'aiming' && !match?.isBallInHand;
  const isBallInHand  = match?.isBallInHand ?? false;

  // ── Shoot ──────────────────────────────────────────────────────────────────

  const handleShoot = useCallback((
    angle: number, power: number, spinX: number, spinY: number,
  ) => {
    if (!canShoot) return;
    colyseusClient.sendShot({ aimAngle: angle, power, spinX, spinY });
  }, [canShoot]);

  // ── Ball-in-hand placement ─────────────────────────────────────────────────

  const handlePlaceBall = useCallback((x: number, y: number) => {
    if (!isBallInHand || !isMyTurn) return;
    colyseusClient.placeBall(x, y);
  }, [isBallInHand, isMyTurn]);

  // ── Rematch ────────────────────────────────────────────────────────────────

  const handleRematch = useCallback(async () => {
    useGameStore.getState().reset();
    await colyseusClient.leave();
    router.replace('/game/practice');
  }, [router]);

  const handleHome = useCallback(() => {
    router.replace('/');
  }, [router]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isJoining) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Connecting…</Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* HUD — top */}
      {match && (
        <ScoreBar match={match} myUserId={myUserId} />
      )}

      {/* Table + gesture layer */}
      <View style={[styles.tableArea, { height: tableH }]}>
        <AimGestureHandler
          layout={layout}
          cueBall={cueBall}
          isBallInHand={isBallInHand}
          isMyTurn={isMyTurn}
          aimAngle={aimAngle}
          onAimChange={setAimAngle}
          onPlaceBall={handlePlaceBall}
        >
          <TableRenderer
            layout={layout}
            balls={balls}
            aimAngle={aimAngle}
            aimLine={canShoot}
            cueBallX={isBallInHand ? undefined : undefined}
            cueBallY={isBallInHand ? undefined : undefined}
          />
        </AimGestureHandler>

        {/* Status overlays */}
        {!isConnected && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Reconnecting…</Text>
          </View>
        )}

        {match?.status === 'countdown' && (
          <View style={styles.overlay}>
            <Text style={styles.countdownText}>{match.countdown}</Text>
          </View>
        )}

        {match?.status === 'paused' && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Opponent disconnected…</Text>
            <Text style={styles.overlaySubText}>Waiting 30s before forfeit</Text>
          </View>
        )}

        {isBallInHand && isMyTurn && (
          <View style={styles.ballInHandBanner}>
            <Text style={styles.ballInHandText}>Tap table to place cue ball</Text>
          </View>
        )}

        {lastFoul && (
          <View style={styles.foulBanner}>
            <Text style={styles.foulText}>FOUL — {lastFoul.replace(/_/g, ' ').toUpperCase()}</Text>
            <Text style={styles.foulSub}>Ball in hand for opponent</Text>
          </View>
        )}

        {!isMyTurn && match?.status === 'in_progress' && (
          <View style={styles.waitingBanner}>
            <Text style={styles.waitingText}>Opponent's turn…</Text>
          </View>
        )}

        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
      </View>

      {/* Controls — bottom */}
      <ShotControls
        onShoot={handleShoot}
        disabled={!canShoot}
        aimAngle={aimAngle}
        onAimChange={setAimAngle}
      />

      {/* Match result overlay */}
      {matchResult && (
        <MatchResultOverlay
          result={matchResult}
          myUserId={myUserId}
          onRematch={handleRematch}
          onHome={handleHome}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#0B0F17' },
  loading:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F17', gap: 16 },
  loadingText: { color: '#9CA3AF', fontSize: 16 },
  tableArea:   { flex: 1, position: 'relative' },

  // Overlays
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  overlayText:     { color: '#F9FAFB', fontSize: 18, fontWeight: '600' },
  overlaySubText:  { color: '#9CA3AF', fontSize: 13, marginTop: 6 },
  countdownText:   { color: '#F59E0B', fontSize: 72, fontWeight: '900' },

  ballInHandBanner: {
    position: 'absolute', bottom: 12, left: 0, right: 0,
    alignItems: 'center', zIndex: 5,
  },
  ballInHandText: {
    backgroundColor: '#1D4ED8', color: '#F9FAFB',
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 20, fontSize: 13, fontWeight: '600',
  },

  foulBanner: {
    position: 'absolute', top: 12, left: 16, right: 16,
    backgroundColor: '#7F1D1D', borderRadius: 10,
    padding: 10, alignItems: 'center', zIndex: 5,
  },
  foulText: { color: '#FECACA', fontSize: 14, fontWeight: '800' },
  foulSub:  { color: '#FCA5A5', fontSize: 12, marginTop: 2 },

  waitingBanner: {
    position: 'absolute', bottom: 12, left: 0, right: 0,
    alignItems: 'center', zIndex: 5,
  },
  waitingText: {
    backgroundColor: 'rgba(31,41,55,0.85)',
    color: '#9CA3AF', paddingHorizontal: 16, paddingVertical: 5,
    borderRadius: 20, fontSize: 13,
  },

  errorBanner: {
    position: 'absolute', top: 12, left: 16, right: 16,
    backgroundColor: '#7C2D12', borderRadius: 8,
    padding: 8, alignItems: 'center', zIndex: 6,
  },
  errorText: { color: '#FDBA74', fontSize: 13, fontWeight: '600' },
});
