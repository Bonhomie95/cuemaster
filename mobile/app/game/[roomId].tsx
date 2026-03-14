// File: mobile/app/game/[roomId].tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, useWindowDimensions,
  ActivityIndicator, TouchableOpacity, Alert, PanResponder,
  Animated, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Radius, QUICK_CHAT } from '../../src/design/tokens';
import { colyseusClient }    from '../../src/game/ColyseusClient';
import { TableRenderer, getTableLayout } from '../../src/game/TableRenderer';
import { useGameStore }      from '../../src/store/gameStore';
import { useAuthStore }      from '../../src/store/authStore';
import { useSettingsStore }  from '../../src/store/settingsStore';
import { MatchResultOverlay } from '../../src/game/MatchResultOverlay';
import { del }               from '../../src/api/client';
import { Felt, FeltId }      from '../../src/design/tokens';
import { BallState }         from '../../src/types/game';

const PANEL_W = 220;

// ── Player Panel (right side) ─────────────────────────────────────────────────

function PlayerPanel({
  displayName, eloRating, avatarEmoji = '🧑‍🎱',
  ballGroup, ballsPocketed, turnTimeRemaining,
  isMyTurn, isMe, isConnected, onAvatarPress,
}: {
  displayName: string; eloRating: number; avatarEmoji?: string;
  ballGroup: string; ballsPocketed: number[];
  turnTimeRemaining: number; isMyTurn: boolean;
  isMe: boolean; isConnected: boolean;
  onAvatarPress: () => void;
}) {
  const timerColor = turnTimeRemaining <= 10 ? Colors.danger : turnTimeRemaining <= 20 ? Colors.warning : Colors.success;

  const myBalls = ballGroup === 'solids'
    ? [1,2,3,4,5,6,7]
    : ballGroup === 'stripes'
      ? [9,10,11,12,13,14,15]
      : [];

  return (
    <View style={[pp.card, isMyTurn && pp.activeCard, !isConnected && pp.disconnectedCard]}>
      {/* Avatar */}
      <TouchableOpacity style={pp.avatarRow} onPress={onAvatarPress}>
        <View style={[pp.avatar, isMyTurn && { borderColor: Colors.gold }]}>
          <Text style={pp.avatarEmoji}>{avatarEmoji}</Text>
        </View>
        {!isConnected && <View style={pp.disconnectDot} />}
      </TouchableOpacity>

      {/* Name + ELO */}
      <Text style={[pp.name, isMe && { color: Colors.gold }]} numberOfLines={1}>{displayName}</Text>
      <Text style={pp.elo}>ELO {eloRating}</Text>

      {/* Turn timer */}
      {isMyTurn && (
        <View style={[pp.timerBadge, { backgroundColor: timerColor + '20', borderColor: timerColor }]}>
          <Text style={[pp.timerText, { color: timerColor }]}>{turnTimeRemaining}s</Text>
        </View>
      )}

      {/* Ball group dots */}
      {myBalls.length > 0 && (
        <View style={pp.ballDots}>
          {myBalls.map(id => (
            <View
              key={id}
              style={[pp.dot, ballsPocketed.includes(id) && pp.dotPocketed]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const pp = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg, padding: 12,
    borderWidth: 1.5, borderColor: Colors.gray700,
    alignItems: 'center', gap: 6,
    flex: 1,
  },
  activeCard:       { borderColor: Colors.gold, backgroundColor: Colors.bgCardLight },
  disconnectedCard: { opacity: 0.5 },
  avatarRow:  { position: 'relative' },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.bgCardLight,
    borderWidth: 2, borderColor: Colors.gray600,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji:    { fontSize: 28 },
  disconnectDot:  {
    position: 'absolute', top: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.danger, borderWidth: 2, borderColor: Colors.bgCard,
  },
  name:       { ...Typography.sm, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  elo:        { ...Typography.xs, color: Colors.gray500 },
  timerBadge: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  timerText:  { ...Typography.base, fontWeight: '800' },
  ballDots:   { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center' },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.gray700, borderWidth: 1, borderColor: Colors.gray600,
  },
  dotPocketed: { backgroundColor: Colors.success, borderColor: Colors.successDark },
});

// ── Chat panel ────────────────────────────────────────────────────────────────

function ChatPanel({ visible, onClose, onSend }: { visible: boolean; onClose: () => void; onSend: (msg: string) => void }) {
  if (!visible) return null;
  return (
    <View style={chat.overlay}>
      <TouchableOpacity style={chat.backdrop} onPress={onClose} />
      <View style={chat.panel}>
        <Text style={chat.title}>Quick Chat</Text>
        {QUICK_CHAT.map(msg => (
          <TouchableOpacity key={msg} style={chat.msgBtn} onPress={() => { onSend(msg); onClose(); }}>
            <Text style={chat.msgText}>{msg}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const chat = StyleSheet.create({
  overlay:  { ...StyleSheet.absoluteFillObject, zIndex: 50, flexDirection: 'row' },
  backdrop: { flex: 1 },
  panel: {
    width: 200, backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl, borderBottomLeftRadius: Radius.xl,
    padding: 16, gap: 8,
    borderWidth: 1, borderColor: Colors.gray700,
  },
  title:   { ...Typography.md, fontWeight: '800', color: Colors.white, marginBottom: 4 },
  msgBtn:  { backgroundColor: Colors.bgCardLight, borderRadius: Radius.md, padding: 10 },
  msgText: { ...Typography.sm, color: Colors.gray300 },
});

// ── Power Indicator ───────────────────────────────────────────────────────────

function PowerIndicator({ power }: { power: number }) {
  const color = power > 0.7 ? Colors.danger : power > 0.4 ? Colors.warning : Colors.success;
  return (
    <View style={pi.track}>
      <View style={[pi.fill, { width: `${power * 100}%`, backgroundColor: color }]} />
      <Text style={pi.label}>{Math.round(power * 100)}%</Text>
    </View>
  );
}

const pi = StyleSheet.create({
  track: {
    height: 8, backgroundColor: Colors.gray800, borderRadius: 4,
    overflow: 'hidden', position: 'relative', marginVertical: 4,
  },
  fill:  { height: '100%', borderRadius: 4 },
  label: { position: 'absolute', right: 4, top: -2, ...Typography.xs, color: Colors.white },
});

// ── Main Game Screen ──────────────────────────────────────────────────────────

export default function GameScreen() {
  const { roomId }  = useLocalSearchParams<{ roomId: string }>();
  const router      = useRouter();
  const { width, height } = useWindowDimensions();

  const match        = useGameStore(s => s.match);
  const myUserId     = useGameStore(s => s.myUserId);
  const isConnected  = useGameStore(s => s.isConnected);
  const lastFoul     = useGameStore(s => s.lastFoul);
  const matchResult  = useGameStore(s => s.matchResult);
  const errorMsg     = useGameStore(s => s.errorMsg);
  const authUser     = useAuthStore(s => s.user);
  const feltId       = useSettingsStore(s => s.feltId);
  const aimAssist    = useSettingsStore(s => s.aimAssist);

  const [aimAngle,   setAimAngle]   = useState(0);
  const [power,      setPower]      = useState(0.5);
  const [isJoining,  setIsJoining]  = useState(true);
  const [showChat,   setShowChat]   = useState(false);
  const [showProfile, setShowProfile] = useState<{ userId: string } | null>(null);

  // Gesture tracking
  const isDragging      = useRef(false);
  const lastTouchAngle  = useRef(aimAngle);

  // Table layout: width minus panel
  const tableW = width - PANEL_W;
  const tableH = height;
  const layout = getTableLayout(tableW, tableH);

  const feltConfig = Felt[feltId as FeltId] ?? Felt.green;

  // ── Connect ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authUser) { router.replace('/'); return; }
    useGameStore.getState().setMyUserId(authUser._id);

    colyseusClient.joinRoom(roomId as string).then(() => {
      colyseusClient.sendReady();
    }).catch(err => {
      Alert.alert('Connection failed', err instanceof Error ? err.message : 'Unknown error', [
        { text: 'Back', onPress: () => router.back() },
      ]);
    }).finally(() => setIsJoining(false));

    return () => {
      colyseusClient.leave();
      del('/api/matches/queue').catch(() => {});
    };
  }, []);

  // ── Cue ball pan gesture (touch cue + drag) ────────────────────────────────

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => isMyTurn && !match?.isBallInHand,
    onMoveShouldSetPanResponder:  () => isMyTurn && !match?.isBallInHand,

    onPanResponderGrant: (evt) => {
      const cueBall = match?.balls.find((b: BallState) => b.id === 0 && !b.isPocketed);
      if (!cueBall) return;
      const cueCx = layout.offsetX + cueBall.x * layout.scale;
      const cueCy = layout.offsetY + cueBall.y * layout.scale;
      const lx = evt.nativeEvent.pageX;
      const ly = evt.nativeEvent.pageY;
      const dx = lx - cueCx;
      const dy = ly - cueCy;
      // Only start drag if near the cue ball
      if (Math.sqrt(dx * dx + dy * dy) < 40) {
        isDragging.current = true;
      }
    },

    onPanResponderMove: (evt) => {
      if (!isDragging.current) return;
      const cueBall = match?.balls.find((b: BallState) => b.id === 0 && !b.isPocketed);
      if (!cueBall) return;
      const cueCx = layout.offsetX + cueBall.x * layout.scale;
      const cueCy = layout.offsetY + cueBall.y * layout.scale;
      const newAngle = Math.atan2(evt.nativeEvent.pageY - cueCy, evt.nativeEvent.pageX - cueCx);
      setAimAngle(newAngle);
      lastTouchAngle.current = newAngle;

      // Derive power from drag distance
      const dist = Math.sqrt(
        Math.pow(evt.nativeEvent.pageX - cueCx, 2) +
        Math.pow(evt.nativeEvent.pageY - cueCy, 2),
      );
      const newPower = Math.min(1, Math.max(0.05, dist / 200));
      setPower(newPower);
    },

    onPanResponderRelease: () => {
      if (isDragging.current && canShoot) {
        colyseusClient.sendShot({ aimAngle, power, spinX: 0, spinY: 0 });
        isDragging.current = false;
      } else {
        isDragging.current = false;
      }
    },
  });

  // ── Ball-in-hand pan ───────────────────────────────────────────────────────

  const ballInHandPan = PanResponder.create({
    onStartShouldSetPanResponder: () => !!match?.isBallInHand && isMyTurn,
    onMoveShouldSetPanResponder:  () => !!match?.isBallInHand && isMyTurn,
    onPanResponderRelease: (evt) => {
      const mmX = (evt.nativeEvent.pageX - layout.offsetX) / layout.scale;
      const mmY = (evt.nativeEvent.pageY - layout.offsetY) / layout.scale;
      colyseusClient.placeBall(
        Math.max(100, Math.min(2440, mmX)),
        Math.max(100, Math.min(1170, mmY)),
      );
    },
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const balls        = match?.balls ?? [];
  const cueBall      = balls.find((b: BallState) => b.id === 0 && !b.isPocketed) ?? null;
  const isMyTurn     = !!match && match.currentTurn === myUserId;
  const canShoot     = isMyTurn && match?.turnPhase === 'aiming' && !match?.isBallInHand;
  const isBallInHand = match?.isBallInHand ?? false;

  const playerEntries = Object.entries(match?.players ?? {});
  const me    = playerEntries.find(([id]) => id === myUserId);
  const other = playerEntries.find(([id]) => id !== myUserId);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isJoining) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.loadingText}>Connecting to table…</Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar hidden />

      {/* ── Table area (70%) ─────────────────────────────────────── */}
      <View
        style={[styles.tableArea, { width: tableW }]}
        {...(isBallInHand ? ballInHandPan.panHandlers : panResponder.panHandlers)}
      >
        <TableRenderer
          layout={layout}
          balls={balls}
          aimAngle={canShoot ? aimAngle : undefined}
          aimLine={canShoot && aimAssist.extendedAimLine}
          feltColor={feltConfig.color}
          feltColorDark={feltConfig.dark}
          showObjectTrajectory={aimAssist.objectTrajectory}
        />

        {/* Overlays */}
        {match?.status === 'countdown' && (
          <View style={styles.overlay}>
            <Text style={styles.countdown}>{match.countdown}</Text>
            <Text style={styles.countdownSub}>Get ready!</Text>
          </View>
        )}
        {match?.status === 'paused' && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>⏸ Opponent disconnected</Text>
            <Text style={styles.overlaySub}>30s before forfeit</Text>
          </View>
        )}
        {isBallInHand && isMyTurn && (
          <View style={styles.ballInHandBanner}>
            <Text style={styles.ballInHandText}>👆 Tap anywhere to place cue ball</Text>
          </View>
        )}
        {lastFoul && (
          <View style={styles.foulBanner}>
            <Text style={styles.foulText}>⚠️ FOUL — {lastFoul.replace(/_/g, ' ').toUpperCase()}</Text>
          </View>
        )}
        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
        {!isMyTurn && match?.status === 'in_progress' && (
          <View style={styles.waitingBanner}>
            <Text style={styles.waitingText}>Opponent's turn…</Text>
          </View>
        )}
      </View>

      {/* ── Right panel (30%) ────────────────────────────────────── */}
      <View style={styles.rightPanel}>

        {/* Opponent (top) */}
        {other && (
          <PlayerPanel
            displayName={other[1].displayName}
            eloRating={other[1].eloRating}
            ballGroup={other[1].ballGroup}
            ballsPocketed={Array.from(other[1].ballsPocketed as unknown as number[])}
            turnTimeRemaining={other[1].turnTimeRemaining}
            isMyTurn={match?.currentTurn === other[0]}
            isMe={false}
            isConnected={other[1].isConnected}
            onAvatarPress={() => setShowProfile({ userId: other[0] })}
          />
        )}

        {/* Shot info + controls centre */}
        <View style={styles.controls}>
          <Text style={styles.shotCount}>Shot #{match?.shotCount ?? 0}</Text>

          {canShoot && (
            <>
              <PowerIndicator power={power} />
              <Text style={styles.aimHint}>Hold cue ball + drag to aim</Text>
              <Text style={styles.releaseHint}>Release to shoot</Text>
            </>
          )}

          {/* Manual shoot button (fallback) */}
          {canShoot && (
            <TouchableOpacity
              style={styles.shootBtn}
              onPress={() => colyseusClient.sendShot({ aimAngle, power, spinX: 0, spinY: 0 })}
            >
              <Text style={styles.shootBtnText}>🎱 SHOOT</Text>
            </TouchableOpacity>
          )}

          {/* Chat button */}
          <TouchableOpacity style={styles.chatBtn} onPress={() => setShowChat(true)}>
            <Text style={styles.chatIcon}>💬</Text>
          </TouchableOpacity>

          {/* Leave button */}
          <TouchableOpacity
            style={styles.leaveBtn}
            onPress={() => Alert.alert('Leave match?', 'This will count as a forfeit.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Leave',  style: 'destructive', onPress: () => { colyseusClient.leave(); router.replace('/'); } },
            ])}
          >
            <Text style={styles.leaveBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Me (bottom) */}
        {me && (
          <PlayerPanel
            displayName={me[1].displayName}
            eloRating={me[1].eloRating}
            ballGroup={me[1].ballGroup}
            ballsPocketed={Array.from(me[1].ballsPocketed as unknown as number[])}
            turnTimeRemaining={me[1].turnTimeRemaining}
            isMyTurn={match?.currentTurn === me[0]}
            isMe={true}
            isConnected={me[1].isConnected}
            onAvatarPress={() => router.push('/profile')}
          />
        )}
      </View>

      {/* Chat overlay */}
      <ChatPanel
        visible={showChat}
        onClose={() => setShowChat(false)}
        onSend={(msg) => console.log('Chat:', msg)} // Phase 6: send via Colyseus
      />

      {/* Match result */}
      {matchResult && (
        <MatchResultOverlay
          result={matchResult}
          myUserId={myUserId}
          onRematch={() => { useGameStore.getState().reset(); router.replace('/'); }}
          onHome={() => router.replace('/')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, flexDirection: 'row', backgroundColor: '#0A1A0C' },
  loading:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, gap: 16 },
  loadingText: { ...Typography.base, color: Colors.gray400 },

  tableArea: { flex: 1, position: 'relative', overflow: 'hidden' },

  // Right panel
  rightPanel: {
    width: PANEL_W,
    backgroundColor: Colors.bgCard,
    borderLeftWidth: 1, borderLeftColor: Colors.gray800,
    padding: 10, gap: 10,
    justifyContent: 'space-between',
  },

  // Controls centre
  controls:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  shotCount:   { ...Typography.xs, color: Colors.gray500 },
  aimHint:     { ...Typography.xs, color: Colors.gray400, textAlign: 'center' },
  releaseHint: { ...Typography.xs, color: Colors.gold, textAlign: 'center', fontStyle: 'italic' },

  shootBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingVertical: 12, paddingHorizontal: 20,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 8,
  },
  shootBtnText: { ...Typography.base, fontWeight: '800', color: Colors.bg },

  chatBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.bgCardLight, borderWidth: 1, borderColor: Colors.gray700,
    alignItems: 'center', justifyContent: 'center',
  },
  chatIcon: { fontSize: 20 },

  leaveBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.dangerDark + '40', borderWidth: 1, borderColor: Colors.dangerDark,
    alignItems: 'center', justifyContent: 'center',
  },
  leaveBtnText: { color: Colors.danger, fontWeight: '700', fontSize: 14 },

  // Overlays
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  countdown:    { ...Typography.hero, fontSize: 80, fontWeight: '900', color: Colors.gold },
  countdownSub: { ...Typography.lg, color: Colors.goldLight },
  overlayText:  { ...Typography.xl, fontWeight: '700', color: Colors.white },
  overlaySub:   { ...Typography.base, color: Colors.gray400, marginTop: 6 },

  ballInHandBanner: {
    position: 'absolute', bottom: 16, left: 0, right: 0, alignItems: 'center', zIndex: 10,
  },
  ballInHandText: {
    backgroundColor: Colors.info, color: Colors.white,
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: Radius.full,
    ...Typography.sm, fontWeight: '600',
  },

  foulBanner: {
    position: 'absolute', top: 12, left: 12, right: 12,
    backgroundColor: Colors.dangerDark, borderRadius: Radius.md,
    padding: 10, alignItems: 'center', zIndex: 15,
  },
  foulText: { ...Typography.sm, fontWeight: '800', color: Colors.danger + 'FF' },

  waitingBanner: {
    position: 'absolute', bottom: 12, left: 0, right: 0, alignItems: 'center', zIndex: 5,
  },
  waitingText: {
    backgroundColor: 'rgba(17,34,20,0.9)', color: Colors.gray400,
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: Radius.full, ...Typography.sm,
  },

  errorBanner: {
    position: 'absolute', top: 12, left: 12, right: 12,
    backgroundColor: '#7C2D12', borderRadius: Radius.md,
    padding: 8, alignItems: 'center', zIndex: 16,
  },
  errorText: { color: '#FDBA74', ...Typography.sm, fontWeight: '600' },
});
