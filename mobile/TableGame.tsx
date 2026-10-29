import { clockUrgent } from "./src/game/shotClock";
import { cueById } from "./src/game/cues";
import { localWinner } from "./src/game/localMatch";
import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  StyleSheet,
  Image,
  Animated,
  Easing,
  Text,
  View,
  Pressable,
  PanResponder,
  useWindowDimensions,
  Platform,
  Modal,
  ScrollView,
  FlatList,
  AppState,
  BackHandler,
  Share,
  TextInput,
  LayoutChangeEvent,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { tableHost, useTableHost, stageHeight } from "./src/render/TableHost";
import CompatibilityTable from "./src/render/CompatibilityTable";
import { session, skins, encodeReplay } from "./src/game/session";
import { flag, type Player } from "./src/app/api";
import { Press, Enter } from "./src/app/motion";
import { online } from "./src/game/online";
import {
  VsIntro,
  ResultCard,
  ResultView,
  EmoteBar,
  EmoteBubble,
  AwayBanner,
  Tutorial,
} from "./src/app/MatchOverlays";
/** A finished paid rack, as the server settled it. */
export type MatchResult = ResultView;
import { groupOf } from "./src/game/progress";
import { ballColors } from "./src/render/textures";
const C = {
  bg: "#081e30",
  panel: "#153b50",
  ink: "#f2eedf",
  muted: "#c5dfeb",
  gold: "#ffd05b",
  line: "#568296",
};
function Button({
  label,
  onPress,
  children,
  active = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  children?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={[s.button, active && s.selected, disabled && { opacity: 0.35 }]}
    >
      {children || <Text style={s.buttonText}>{label}</Text>}
    </Press>
  );
}
function Power({ compact = false }: { compact?: boolean }) {
  const travel = compact ? 100 : 145;
  const [power, setPower] = useState(0);
  const start = React.useRef(0);
  const gestureTurn = React.useRef(0);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          !session.running &&
          !session.cpuTurn &&
          !session.placement &&
          !session.progress.finished &&
          !session.progress.breakChoice,
        onPanResponderGrant: (e) => {
          start.current = e.nativeEvent.pageY;
          gestureTurn.current = session.turnSerial;
          session.power = 0;
          setPower(0);
        },
        onPanResponderMove: (e) => {
          const p = Math.max(
            0,
            Math.min(1, (e.nativeEvent.pageY - start.current) / travel),
          );
          session.power = p;
          setPower(p);
        },
        onPanResponderRelease: () => {
          if (
            session.power > 0.025 &&
            gestureTurn.current === session.turnSerial
          )
            session.shoot();
          session.power = 0;
          setPower(0);
        },
        onPanResponderTerminate: () => {
          session.power = 0;
          setPower(0);
        },
      }),
    [travel],
  );
  const pulling = power > 0.02;
  const disabled =
    session.running || session.cpuTurn || session.progress.finished;
  return (
    <View style={s.powerColumn}>
      <View
        accessibilityLabel="Pull down and release to shoot"
        accessibilityValue={{ now: Math.round(power * 100), min: 0, max: 100 }}
        hitSlop={22}
        {...responder.panHandlers}
        style={[
          s.powerTrack,
          { height: travel + 30 },
          disabled && { opacity: 0.3 },
        ]}
      >
        {/* The track reads empty at rest; the bright fill is the whole affordance. */}
        <View style={[s.powerFillClip, { height: `${6 + power * 94}%` }]}>
          <LinearGradient
            colors={["#24dbb3", "#ffd05b", "#ff694c"]}
            locations={[0, 0.55, 1]}
            style={{ width: "100%", height: travel + 30 }}
          />
        </View>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={[s.powerTick, { top: ((travel + 30) * n) / 4 }]}
          />
        ))}
        <View style={[s.powerKnob, { top: power * travel }]} />
      </View>
      {pulling ? (
        <Text style={s.powerValue}>{Math.round(power * 100)}%</Text>
      ) : (
        <Text style={s.controlCaption}>POWER</Text>
      )}
    </View>
  );
}
function Spin({
  size = 42,
  editable = false,
  onRelease,
}: {
  size?: number;
  editable?: boolean;
  onRelease?: () => void;
}) {
  const [, refresh] = useState(0);
  const update = (x: number, y: number) => {
    if (session.cpuTurn) return;
    let a = (x - size / 2) / (size * 0.35),
      b = -(y - size / 2) / (size * 0.35),
      n = Math.hypot(a, b);
    if (n > 1) {
      a /= n;
      b /= n;
    }
    session.side = a;
    session.top = b;
    refresh((v) => v + 1);
  };
  return (
    <View
      accessibilityLabel="Cue ball spin picker"
      onStartShouldSetResponder={() => editable}
      onMoveShouldSetResponder={() => editable}
      onResponderGrant={(e) =>
        update(e.nativeEvent.locationX, e.nativeEvent.locationY)
      }
      onResponderRelease={() => {
        session.notify();
        onRelease?.();
      }}
      onResponderMove={(e) =>
        update(e.nativeEvent.locationX, e.nativeEvent.locationY)
      }
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#e8e7d9",
        borderWidth: 2,
        borderColor: "#9caa9c",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: size * 0.7,
          height: size * 0.7,
          borderRadius: size,
          borderWidth: 1,
          borderColor: "#b6c0af",
          borderStyle: "dashed",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          width: 1,
          height: size * 0.85,
          backgroundColor: "#bcc3b5",
          position: "absolute",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          height: 1,
          width: size * 0.85,
          backgroundColor: "#bcc3b5",
          position: "absolute",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: size * 0.13,
          height: size * 0.13,
          borderRadius: size,
          borderWidth: 2,
          borderColor: "#fcf2dd",
          backgroundColor: "#b08c55",
          left: size / 2 + session.side * size * 0.35 - size * 0.065 - 2,
          top: size / 2 - session.top * size * 0.35 - size * 0.065 - 2,
        }}
      />
    </View>
  );
}
function FineAim({ narrow = false }: { narrow?: boolean }) {
  const start = React.useRef(0);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          !session.running && !session.cpuTurn,
        onPanResponderGrant: () => {
          start.current = session.angle;
        },
        onPanResponderMove: (_, g) => {
          if (session.cpuTurn || session.running) return;
          session.angle = start.current + g.dx * 0.0013;
        },
      }),
    [],
  );
  return (
    <View style={s.fineAimWrap}>
      <Text style={s.controlCaption}>FINE AIM</Text>
      <View
        {...pan.panHandlers}
        accessibilityLabel="Drag horizontally to fine tune aim"
        hitSlop={14}
        style={[s.fineAim, narrow && { width: 150 }]}
      >
        <Feather name="chevron-left" size={15} color="#9fc2d6" />
        {Array.from({ length: 17 }, (_, i) => (
          <View
            key={i}
            style={{
              width: 1,
              height: i === 8 ? 13 : i % 4 === 0 ? 9 : 5,
              borderRadius: 1,
              backgroundColor: i === 8 ? C.gold : "#ffffff4d",
            }}
          />
        ))}
        <Feather name="chevron-right" size={15} color="#9fc2d6" />
      </View>
    </View>
  );
}
function Audio() {
  useEffect(() => {
    const players = {
      ball: createAudioPlayer(require("./assets/audio/ball.wav")),
      rail: createAudioPlayer(require("./assets/audio/rail.wav")),
      cue: createAudioPlayer(require("./assets/audio/cue.wav")),
      pocket: createAudioPlayer(require("./assets/audio/pocket.wav")),
    };
    setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
    let last = -1;
    session.onEvent = (e) => {
      if (!session.sound) return;
      // abs(): a replay restarts world time at zero.
      if (e.type === "ball" && Math.abs(e.time - last) < 0.014) return;
      last = e.time;
      const p = players[e.type as keyof typeof players];
      if (p) {
        p.volume = Math.min(0.8, 0.12 + e.speed * 0.065);
        p.seekTo(0)
          .then(() => p.play())
          .catch(() => {});
      }
      if (Platform.OS !== "web" && (e.type === "cue" || e.type === "pocket"))
        Haptics.impactAsync(
          e.type === "cue"
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
        ).catch(() => {});
    };
    const sub = AppState.addEventListener("change", () => {
      session.accumulator = 0;
    });
    return () => {
      session.onEvent = null;
      sub.remove();
      Object.values(players).forEach((p) => p.remove());
    };
  }, []);
  return null;
}
type TableProps = {
  onExit?: () => void;
  paidMatch?: boolean;
  entryFee?: number;
  exitBusy?: boolean;
  exitError?: string;
  playerName?: string;
  playerAvatar?: number;
  playerCountry?: string;
  playerLevel?: number;
  playerStats?: Player["stats"];
  modeLabel?: string;
  allowedSkins?: number[];
  /** An online match: the opponent, the clock and the result come from the server. */
  online?: boolean;
  /** A settled house-rival or pass-and-play rack. */
  result?: MatchResult | null;
  onPlayAgain?: () => void;
};
export default function TableGame(props: TableProps) {
  return (
    <SafeAreaProvider>
      <Game {...props} />
    </SafeAreaProvider>
  );
}
function Avatar({
  opponent = false,
  variant = 0,
  onPress,
}: {
  opponent?: boolean;
  variant?: number;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={opponent ? "Opponent stats" : "Your stats"}
      hitSlop={6}
      onPress={onPress}
      style={[
        s.avatar,
        {
          borderColor: opponent ? "#8e918e" : "#9aae9e",
          backgroundColor: opponent ? "#353454" : "#24473f",
        },
      ]}
    >
      <Image
        source={
          variant === 1
            ? require("./assets/avatars/opponent-natural.png")
            : require("./assets/avatars/player-natural.png")
        }
        style={{ width: 43, height: 43 }}
      />
    </Pressable>
  );
}
function BallBadge({
  id,
  potted = false,
  recent = false,
}: {
  id: number;
  potted?: boolean;
  recent?: boolean;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (recent)
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.3,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 230,
          useNativeDriver: true,
        }),
      ]).start();
  }, [recent, scale]);
  return (
    <Animated.View
      accessibilityLabel={`${id} ${id > 8 ? "striped" : "solid"} ball${potted ? ", potted" : ""}`}
      style={[
        s.ballBadge,
        {
          backgroundColor: id > 8 ? "#f3eee3" : ballColors[id],
          opacity: potted ? 0.32 : 1,
          transform: [{ scale }],
          borderColor: recent ? "#ffe2a3" : "#c1cbd0",
        },
      ]}
    >
      {id > 8 && (
        <View style={[s.ballStripe, { backgroundColor: ballColors[id] }]} />
      )}
      <Text style={s.ballDigit}>{id}</Text>
      {potted && <View style={s.potSlash} />}
    </Animated.View>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}
function StatsSheet({
  name,
  avatar,
  stats = { finishes: 0, shots: 0 },
}: {
  name: string;
  avatar: number;
  stats?: Player["stats"];
}) {
  const wins = (stats.cpuWins || 0) + (stats.localWins || 0),
    losses = (stats.cpuLosses || 0) + (stats.localLosses || 0),
    played = wins + losses,
    streak = stats.cpuStreak || 0;
  return (
    <>
      <View style={s.statHead}>
        <Avatar variant={avatar} />
        <View>
          <Text style={s.panelTitle}>{name}</Text>
          <Text style={s.description}>
            {streak > 0
              ? `On a ${streak}-match winning streak`
              : streak < 0
                ? `${-streak} ${-streak === 1 ? "loss" : "losses"} in a row`
                : "No active streak"}
          </Text>
        </View>
      </View>
      <View style={s.statGrid}>
        <Stat
          label="COINS WON"
          value={(stats.coinsWon || 0).toLocaleString()}
        />
        <Stat label="MATCHES" value={played} />
        <Stat label="WON" value={wins} />
        <Stat label="LOST" value={losses} />
        <Stat
          label="WIN RATE"
          value={played ? `${Math.round((wins / played) * 100)}%` : "–"}
        />
        <Stat label="BEST STREAK" value={stats.bestStreak || 0} />
        <Stat label="WORST STREAK" value={-(stats.worstStreak || 0)} />
        <Stat label="CRATES OPENED" value={stats.cratesOpened || 0} />
      </View>
    </>
  );
}
const FOULS: Record<string, string> = {
  "No object-ball contact": "NO CONTACT",
  "Wrong ball contacted first": "WRONG BALL FIRST",
  "No rail after contact": "NO RAIL",
};
const foulShort = (foul: string) =>
  foul ? FOULS[foul] || foul.toUpperCase() : "SCRATCH";
function groupText(player: number) {
  const group = session.progress.groups[player];
  if (!group) return "OPEN TABLE";
  const left = session.world.balls.filter(
    (b) => groupOf(b.id) === group && !b.pocketed,
  ).length;
  return `${group.toUpperCase()} · ${left ? `${left} LEFT` : "ON THE 8"}`;
}
function PlayerBalls({
  player,
  compact = false,
}: {
  player: number;
  compact?: boolean;
}) {
  const group = session.progress.groups[player];
  const balls = session.world.balls
    .filter((b) => groupOf(b.id) === group && group !== null)
    .sort((a, b) => a.id - b.id);
  const left = balls.filter((b) => !b.pocketed).length;
  return (
    <View style={{ gap: 4, alignItems: player ? "flex-end" : "flex-start" }}>
      {!compact && <Text style={s.groupLabel}>{groupText(player)}</Text>}
      <View style={s.ballRow}>
        {group
          ? balls.map((b) => (
              <BallBadge
                key={b.id}
                id={b.id}
                potted={b.pocketed}
                recent={session.progress.shotPots.includes(b.id)}
              />
            ))
          : Array.from({ length: 7 }, (_, i) => (
              <View key={i} style={s.emptyBall} />
            ))}
        {group && left === 0 && (
          <BallBadge
            id={8}
            potted={session.world.balls.find((b) => b.id === 8)?.pocketed}
          />
        )}
      </View>
    </View>
  );
}
/** Countdown sound, haptic and pulse for the active player's clock. */
function useClockAlerts(player: number, seconds: number, urgent: boolean) {
  const pulse = React.useRef(new Animated.Value(1)).current;
  const tick = React.useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  useEffect(() => {
    tick.current = createAudioPlayer(require("./assets/audio/countdown.wav"));
    tick.current.volume = 0.4;
    return () => {
      tick.current?.remove();
      tick.current = null;
    };
  }, []);
  useEffect(() => {
    if (!urgent || seconds <= 0 || AppState.currentState !== "active") return;
    if (Platform.OS === "web" && document.visibilityState !== "visible") return;
    const sound = tick.current;
    if (session.sound && sound)
      sound
        .seekTo(0)
        .then(() => {
          if (
            tick.current === sound &&
            session.sound &&
            !session.running &&
            !session.progress.finished &&
            !session.progress.breakChoice &&
            session.progress.turn === player
          )
            sound.play();
        })
        .catch(() => {});
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const animation = Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1.12,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
      pulse.setValue(1);
    };
  }, [seconds, urgent, pulse, player]);
  return pulse;
}
const RING = 46,
  RING_WIDTH = 3;
/** A 180° arc piece: the top and right borders of a circle, rotated so it spans 0°..180°. */
function Arc({
  color,
  rotate,
  opacity,
}: {
  color: string;
  rotate: Animated.AnimatedInterpolation<string>;
  opacity?: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <Animated.View
      style={{
        width: RING,
        height: RING,
        borderRadius: RING / 2,
        borderWidth: RING_WIDTH,
        borderTopColor: color,
        borderRightColor: color,
        borderBottomColor: "transparent",
        borderLeftColor: "transparent",
        opacity,
        transform: [{ rotate }],
      }}
    />
  );
}
/**
 * The shot clock as a ring around the avatar that shrinks clockwise from the top as time runs
 * out. Drawn with two clipped half-arcs, so it needs no SVG dependency.
 */
function ClockRing({
  player,
  enabled,
  children,
}: {
  player: number;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const active = session.progress.turn === player;
  const total = cueById(session.cueIds[player]).seconds;
  const seconds = active ? session.secondsLeft : total;
  const ticking =
    enabled &&
    active &&
    session.matchRules &&
    !session.running &&
    !session.progress.finished &&
    !session.progress.breakChoice;
  const urgent = clockUrgent(seconds, total, ticking);
  const pulse = useClockAlerts(player, seconds, urgent && enabled);
  const color = !enabled
    ? "transparent"
    : !active
      ? "#62849b"
      : urgent
        ? seconds <= 3
          ? "#ff543f"
          : "#ffb82e"
        : "#24dbb3";
  // The arc sweeps continuously on the native thread: one linear animation per turn from the
  // current remaining time to zero, restarted whenever the deadline changes.
  const angle = React.useRef(new Animated.Value(360)).current;
  const deadline = ticking ? session.turnDeadline : 0;
  useEffect(() => {
    angle.stopAnimation();
    if (!enabled) return void angle.setValue(0);
    if (!deadline) return void angle.setValue(360);
    const left = Math.max(0, deadline - Date.now());
    angle.setValue((left / (total * 1000)) * 360);
    // A zero-length native animation throws on Android; the ring is already at its end.
    if (left < 50) return;
    Animated.timing(angle, {
      toValue: 0,
      duration: left,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [angle, enabled, deadline, total]);
  const rightRotate = angle.interpolate({
    inputRange: [0, 180, 360],
    outputRange: ["-135deg", "45deg", "45deg"],
  });
  const leftRotate = angle.interpolate({
    inputRange: [180, 360],
    outputRange: ["45deg", "225deg"],
    extrapolate: "clamp",
  });
  const leftOpacity = angle.interpolate({
    inputRange: [180, 181],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  return (
    <Animated.View
      accessibilityLabel={
        enabled
          ? `Player ${player + 1} shot clock: ${seconds} seconds${ticking ? " remaining" : " · waiting"}`
          : undefined
      }
      style={{
        width: RING,
        height: RING,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: pulse }],
      }}
    >
      {enabled && (
        <View
          style={{
            position: "absolute",
            width: RING,
            height: RING,
            borderRadius: RING / 2,
            borderWidth: RING_WIDTH,
            borderColor: "#ffffff1c",
          }}
        />
      )}
      <View
        style={{
          position: "absolute",
          left: RING / 2,
          width: RING / 2,
          height: RING,
          overflow: "hidden",
        }}
      >
        <View style={{ marginLeft: -RING / 2 }}>
          <Arc color={color} rotate={rightRotate} />
        </View>
      </View>
      <View
        style={{
          position: "absolute",
          left: 0,
          width: RING / 2,
          height: RING,
          overflow: "hidden",
        }}
      >
        <Arc color={color} rotate={leftRotate} opacity={leftOpacity} />
      </View>
      {children}
      {enabled && ticking && urgent && (
        <View style={s.ringBadge}>
          <Text style={[s.ringBadgeText, { color }]}>{seconds}</Text>
        </View>
      )}
    </Animated.View>
  );
}
function GroupAnnouncement() {
  const group = session.progress.groups[0];
  const [shown, setShown] = useState<typeof group>(null);
  const motion = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    motion.stopAnimation();
    motion.setValue(0);
    setShown(group);
    if (!group) return;
    const animation = Animated.sequence([
      Animated.timing(motion, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.delay(2100),
      Animated.timing(motion, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) setShown(null);
    });
    return () => animation.stop();
  }, [group, motion]);
  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="assertive"
      style={{
        position: "absolute",
        top: 94,
        alignSelf: "center",
        zIndex: 20,
        opacity: motion,
        transform: [
          {
            translateY: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [-16, 0],
            }),
          },
        ],
        backgroundColor: "#10211ff5",
        borderColor: "#dcc28c",
        borderWidth: 1,
        borderRadius: 18,
        paddingVertical: 14,
        paddingHorizontal: 28,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: "#f8e4b3",
          fontSize: 23,
          fontWeight: "900",
          letterSpacing: 2,
        }}
      >
        YOU ARE {shown.toUpperCase()}
      </Text>
      <Text style={{ color: "#eee9dd", fontSize: 12, marginTop: 5 }}>
        {shown === "solids"
          ? "Balls 1–7 · Opponent has stripes (9–15)"
          : "Balls 9–15 · Opponent has solids (1–7)"}
      </Text>
    </Animated.View>
  );
}
function Game({
  onExit,
  paidMatch = false,
  entryFee = 0,
  exitBusy = false,
  exitError = "",
  playerName = "YOU",
  playerAvatar = 0,
  playerCountry = "",
  playerLevel = 1,
  playerStats,
  modeLabel = "LOCAL PRACTICE",
  allowedSkins = [0],
  online: isOnline = false,
  result = null,
  onPlayAgain,
}: TableProps) {
  const insets = useSafeAreaInsets();
  useSyncExternalStore(session.subscribe, session.snapshot);
  useSyncExternalStore(online.subscribe, online.snapshot);
  // House-rival racks open with the same VS card as online ones; the clock waits for it.
  const [cpuIntro] = useState(() =>
    session.cpu && session.shots === 0 ? Date.now() + 2400 : 0,
  );
  useEffect(() => {
    if (cpuIntro)
      session.turnDeadline = cpuIntro + session.activeCue.seconds * 1000;
  }, [cpuIntro]);
  // The server sends the result as the last shot starts; reveal it when the phone has shown it.
  const [, setTick] = useState(0);
  const live = isOnline ? online.result : null;
  useEffect(() => {
    if (!live || Date.now() >= live.revealAt) return;
    const t = setTimeout(
      () => setTick((n) => n + 1),
      live.revealAt - Date.now(),
    );
    return () => clearTimeout(t);
  }, [live]);
  const liveResult: MatchResult | null =
    live && Date.now() >= live.revealAt
      ? {
          won: live.won,
          draw: live.draw,
          title: live.draw
            ? "Match abandoned"
            : live.won
              ? "You win"
              : `${session.opponentName} wins`,
          note:
            live.reason === "resign"
              ? live.won
                ? `${session.opponentName} resigned.`
                : "You resigned."
              : live.reason === "disconnect"
                ? live.won
                  ? `${session.opponentName} did not come back.`
                  : "You were away too long."
                : live.reason === "idle"
                  ? live.won
                    ? `${session.opponentName} let the clock run out three times.`
                    : "Three turns ran out in a row."
                  : live.draw
                    ? "Both players left. Entries refunded."
                    : "",
          pot: live.pot,
          xp: live.xp,
          trophies: live.trophies,
          refunded: live.refunded,
          crate: live.crate,
        }
      : null;
  const shownResult = isOnline ? liveResult : result;
  const win = useWindowDimensions();
  // Landscape-locked: the reported orientation can lag on device, so derive it from the sizes.
  const width = Math.max(win.width, win.height),
    height = Math.min(win.width, win.height);
  const [panel, setPanel] = useState<
    "skins" | "drills" | "spin" | "settings" | "quit" | "you" | "rival" | null
  >(null);
  const [code, setCode] = useState("");
  const [fineAim, setFineAim] = useState(false);
  useEffect(() => {
    const h = BackHandler.addEventListener("hardwareBackPress", () => {
      setPanel("quit");
      return true;
    });
    return () => h.remove();
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web" || !paidMatch) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [paidMatch]);
  const host = useTableHost();
  // Until the shared 3D scene has drawn its first frame (the first seconds after launch, or
  // after a retry) the 2D table stands in, so a match never opens onto an empty stage.
  const compatibility = host.compatibility || !host.ready,
    renderError = host.error;
  useEffect(() => {
    tableHost.setActive(true);
    return () => tableHost.setActive(false);
  }, []);
  const turn = session.progress.turn;
  const compact = height < 560;
  const tableHeight = stageHeight(width, height);
  // The table is full bleed to the glass; only the HUD keeps clear of the notch and the home
  // indicator. Scene fits the rack inside these margins, so widening them here moves the table,
  // it never crops it.
  // Measured, not assumed: Android's taller text made the player cards cover the top pockets.
  // Everything the player needs sits in two side columns, so the table takes the full height
  // and only the measured column widths come off its length.
  const [bands, setBands] = useState({ top: 54 });
  const measure = (edge: "top") => (e: LayoutChangeEvent) => {
    const v = Math.round(e.nativeEvent.layout.height);
    setBands((b) => (b[edge] === v ? b : { ...b, [edge]: v }));
  };
  // Both players share one slim bar above the table and the shot controls ride the side rails,
  // the reference game's layout, so the table keeps as much of the screen as its shape allows.
  session.hud = {
    // A clear band of cloth-free space under the player strips; they must never touch the rail.
    top: 8 + insets.top + bands.top + 22,
    bottom: 6 + insets.bottom + 10,
    left: 26 + insets.left + 48,
    right: 22 + insets.right + 58,
  };
  return (
    <View style={s.root} pointerEvents="box-none">
      <StatusBar hidden />
      <Audio />
      <View
        style={[s.stage, { height: tableHeight, maxWidth: 1700 }]}
        pointerEvents="box-none"
      >
        <GroupAnnouncement />
        {isOnline && online.match && (
          <VsIntro
            until={online.match.introUntil}
            me={{
              name: playerName,
              avatar: playerAvatar,
              country: playerCountry,
              caption: `LV ${playerLevel}`,
            }}
            them={{
              name: online.match.opponent.name,
              avatar: online.match.opponent.avatar,
              country: online.match.opponent.country,
              caption: `LV ${online.match.opponent.level} · ${online.match.opponent.trophies} trophies`,
            }}
            title={`${online.match.venue.name.toUpperCase()} · ${online.match.private ? "FRIENDLY" : "ONLINE"}`}
            stake={`WINNER TAKES ◉ ${online.match.pot.toLocaleString()}`}
          />
        )}
        {!!cpuIntro && session.cpu && (
          <VsIntro
            until={cpuIntro}
            me={{
              name: playerName,
              avatar: playerAvatar,
              country: playerCountry,
              caption: `LV ${playerLevel}`,
            }}
            them={{
              name: session.cpu.name,
              avatar: session.cpu.avatar,
              caption: `House rival · ${session.cpu.tier}`,
            }}
            title={modeLabel.toUpperCase()}
            stake={`WINNER TAKES ◉ ${(entryFee * 2).toLocaleString()}`}
          />
        )}
        <Tutorial
          active={
            session.shots === 0 &&
            !session.cpuTurn &&
            !session.running &&
            Date.now() > Math.max(cpuIntro, online.match?.introUntil ?? 0)
          }
        />
        {isOnline && !!online.opponentAwayUntil && !online.result && (
          <AwayBanner
            until={online.opponentAwayUntil}
            name={session.opponentName}
          />
        )}
        {isOnline && online.bubble && (
          <EmoteBubble
            text={online.bubble.text}
            at={online.bubble.at}
            side={online.bubble.mine ? "left" : "right"}
          />
        )}
        <View
          style={[
            s.topBar,
            {
              top: 8 + insets.top,
              left: 14 + insets.left,
              right: 14 + insets.right,
            },
          ]}
          onLayout={measure("top")}
        >
          <View style={s.barSide}>
            <Button label="Table settings" onPress={() => setPanel("settings")}>
              <Feather name="menu" size={20} color={C.ink} />
            </Button>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your player card"
              onPress={() => setPanel("you")}
              style={({ pressed }) => [
                s.playerStrip,
                turn === 0 && s.activePlayerCard,
                pressed && { opacity: 0.8 },
              ]}
            >
              <ClockRing player={0} enabled={paidMatch}>
                <Avatar variant={playerAvatar} />
              </ClockRing>
              <View style={s.stripText}>
                <Text numberOfLines={1} style={s.playerName}>
                  {playerName.toUpperCase()}
                  {turn === 0 ? " ◂" : ""}
                </Text>
                <PlayerBalls player={0} compact />
              </View>
            </Pressable>
          </View>
          <View style={s.barCentre} pointerEvents="box-none">
            <View style={s.barStatus} pointerEvents="none">
              <Text
                style={[s.shotStatus, session.replaying && { color: C.gold }]}
              >
                {session.replaying
                  ? "▶ REPLAY"
                  : session.running
                    ? session.progress.shotPots.length
                      ? `POTTED: ${session.progress.shotPots.join(", ")}`
                      : ""
                    : session.cpuTurn
                      ? `${session.opponentName.toUpperCase()}’S SHOT`
                      : session.placement
                        ? session.headStringPlacement
                          ? "BEHIND THE LINE"
                          : "BALL IN HAND"
                        : session.progress.finished
                          ? "RACK OVER"
                          : `${turn === 0 ? "YOUR" : `${session.opponentName.toUpperCase()}’S`} TURN`}
              </Text>
              {!session.replaying &&
                (session.progress.scratch ||
                  (paidMatch && !!session.progress.foul)) && (
                  <Text style={s.scratchLabel}>
                    {foulShort(session.progress.foul)}
                  </Text>
                )}
              {!paidMatch && !session.running && !!session.coach && (
                <Text
                  style={s.coachLabel}
                  numberOfLines={2}
                  accessibilityLiveRegion="polite"
                >
                  COACH · {session.coach}
                </Text>
              )}
            </View>
          </View>
          <View style={[s.barSide, { justifyContent: "flex-end" }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Opponent player card"
              disabled={!session.cpu && !session.remote}
              onPress={() => setPanel("rival")}
              style={({ pressed }) => [
                s.playerStrip,
                turn === 1 && s.activePlayerCard,
                pressed && { opacity: 0.8 },
                // Drills and practice have no second player.
                !paidMatch && !session.cpu && { opacity: 0 },
              ]}
              pointerEvents={!paidMatch && !session.cpu ? "none" : "auto"}
            >
              <View style={[s.stripText, { alignItems: "flex-end" }]}>
                <Text numberOfLines={1} style={s.playerName}>
                  {turn === 1 ? "▸ " : ""}
                  {session.opponentName.toUpperCase()}
                </Text>
                <PlayerBalls player={1} compact />
              </View>
              <ClockRing player={1} enabled={paidMatch}>
                <Avatar
                  opponent
                  variant={
                    session.cpu?.avatar ??
                    session.remote?.avatar ??
                    (playerAvatar === 0 ? 1 : 0)
                  }
                />
              </ClockRing>
            </Pressable>
            <Button
              label="Switch camera"
              disabled={compatibility}
              active={session.camera === "aim"}
              onPress={() => {
                session.camera = session.camera === "table" ? "aim" : "table";
                session.notify();
              }}
            >
              <Feather
                name="video"
                size={19}
                color={session.camera === "aim" ? C.gold : C.ink}
              />
            </Button>
          </View>
        </View>
        {compatibility && (
          <View style={[s.canvas, { top: 0, bottom: 0, left: 0, right: 0 }]}>
            <CompatibilityTable />
          </View>
        )}
        {host.compatibility && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry 3D table"
            onPress={() => tableHost.retry()}
            style={{
              position: "absolute",
              top: 60 + insets.top,
              alignSelf: "center",
              padding: 8,
            }}
          >
            <Text style={[s.description, { fontSize: 10 }]}>
              Compatibility view · Retry 3D
            </Text>
          </Pressable>
        )}
        {renderError ? (
          <View
            style={[
              s.error,
              StyleSheet.absoluteFill,
              { backgroundColor: C.bg },
            ]}
          >
            <Text style={s.title}>The table couldn’t load.</Text>
            <Text style={s.description}>{renderError}</Text>
            <Button
              label="Use compatibility table"
              onPress={() => tableHost.useCompatibility()}
            />
            <Button label="Reload table" onPress={() => tableHost.retry()} />
          </View>
        ) : null}
        <View style={[s.shotPower, { left: 12 + insets.left }]}>
          <Power compact />
        </View>
        <View style={[s.shotSpin, { right: 10 + insets.right }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Adjust spin"
            disabled={session.running || session.cpuTurn}
            onPress={() => setPanel("spin")}
            style={({ pressed }) => [
              s.spinButtonFrame,
              pressed && { opacity: 0.75 },
              (session.running || session.cpuTurn) && { opacity: 0.35 },
            ]}
          >
            <Spin size={34} />
          </Pressable>
          <Text style={s.controlCaption}>SPIN</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle fine aim"
            onPress={() => setFineAim((v) => !v)}
            style={({ pressed }) => [
              s.spinButtonFrame,
              { marginTop: 14 },
              pressed && { opacity: 0.75 },
              fineAim && { borderColor: C.gold },
            ]}
          >
            <Feather
              name="crosshair"
              size={20}
              color={fineAim ? C.gold : C.ink}
            />
          </Pressable>
          <Text style={s.controlCaption}>AIM</Text>
          {isOnline && !online.result && (
            <View style={{ marginTop: 14, alignItems: "center" }}>
              <EmoteBar
                emotes={online.emotes}
                onPick={(i) => online.emote(i)}
              />
              <Text style={s.controlCaption}>CHAT</Text>
            </View>
          )}
        </View>
        <View
          style={[s.bottomCentre, { bottom: 6 + insets.bottom }]}
          pointerEvents="box-none"
        >
          {session.drill === "break" &&
          session.shots === 0 &&
          !session.cpuTurn &&
          !session.running &&
          !session.progress.breakChoice ? (
            <Button
              label="Place break cue"
              onPress={() => {
                session.placement = true;
                session.headStringPlacement = true;
                session.notify();
              }}
            />
          ) : (
            fineAim && <FineAim narrow={width < 960} />
          )}
          {!paidMatch &&
            (session.canReplay || session.progress.returned.length > 0) && (
              <View
                style={s.pottedRow}
                accessibilityLiveRegion="polite"
                accessibilityLabel={
                  session.progress.returned.length
                    ? `Potted: ${session.progress.returned.join(", ")}`
                    : "No balls potted yet"
                }
              >
                {!paidMatch && session.canReplay && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Watch replay of the last shot"
                    hitSlop={8}
                    onPress={() => session.startReplay()}
                    style={({ pressed }) => [
                      s.replayPill,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={s.replayPillText}>▶ REPLAY</Text>
                  </Pressable>
                )}
                {session.progress.returned.map((id) => (
                  <BallBadge
                    key={id}
                    id={id}
                    recent={session.progress.shotPots.includes(id)}
                  />
                ))}
              </View>
            )}
        </View>
        {paidMatch && shownResult && (
          <ResultCard
            result={shownResult}
            primary={
              isOnline
                ? online.opponentLeft
                  ? undefined
                  : () => online.rematch()
                : onPlayAgain
            }
            primaryLabel={
              isOnline
                ? online.rematchOffered
                  ? "Accept rematch"
                  : online.rematchAsked
                    ? "Waiting…"
                    : "Rematch"
                : "Play again"
            }
            primaryDisabled={isOnline && online.rematchAsked}
            status={
              isOnline
                ? online.opponentLeft
                  ? `${session.opponentName} left the table.`
                  : online.rematchOffered
                    ? `${session.opponentName} wants a rematch!`
                    : online.error
                : undefined
            }
            secondaryLabel="Leave table"
            onSecondary={() => onExit?.()}
          />
        )}
        {paidMatch &&
          !shownResult &&
          session.progress.finished &&
          !session.running && (
            <View style={s.finishOverlay} pointerEvents="none">
              <Enter style={s.finishCard}>
                <Text style={s.finishTitle}>Rack over</Text>
                <Text style={s.description}>Settling the result…</Text>
              </Enter>
            </View>
          )}
        {!paidMatch && session.progress.finished && !session.running && (
          <View style={s.finishOverlay}>
            <Enter style={s.finishCard} accessibilityLiveRegion="polite">
              <Text style={s.finishTitle}>
                {paidMatch
                  ? localWinner(session.progress) === 0
                    ? "You win"
                    : `${session.cpu?.name || "Player 2"} wins`
                  : "Rack complete"}
              </Text>
              <Text style={s.description}>
                {session.progress.returned.includes(8)
                  ? "8 ball down."
                  : "Every object ball is pocketed."}
              </Text>
              {!paidMatch && (
                <Press
                  accessibilityRole="button"
                  accessibilityLabel="Play again"
                  style={s.playAgain}
                  onPress={() => session.reset("break")}
                >
                  <Text style={s.playAgainText}>PLAY AGAIN · FULL RACK</Text>
                </Press>
              )}
              {onExit && (
                <Button
                  label={
                    exitBusy
                      ? "Saving…"
                      : paidMatch
                        ? "Choose another venue"
                        : "Return to club"
                  }
                  onPress={() => {
                    if (!exitBusy) onExit();
                  }}
                />
              )}
              {session.drill !== "break" && (
                <Button
                  label="Repeat drill"
                  onPress={() => session.reset(session.drill)}
                />
              )}
            </Enter>
          </View>
        )}
        {win.width < win.height && Platform.OS !== "web" && (
          <View style={s.rotate}>
            <Text style={s.title}>A wider perspective.</Text>
            <Text style={s.description}>Rotate your phone to play.</Text>
          </View>
        )}
      </View>
      <Modal
        supportedOrientations={["landscape"]}
        transparent
        visible={
          !!session.progress.breakChoice && !session.running && !session.cpuTurn
        }
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={s.scrim}>
          <ScrollView style={[s.panel, { maxHeight: "90%", flexGrow: 0 }]}>
            <Text style={s.eyebrow}>
              {session.progress.turn === 0
                ? playerName
                : session.opponentName.toUpperCase()}
            </Text>
            <Text style={s.panelTitle}>
              {session.progress.breakChoice === "eight"
                ? "8 on the break"
                : session.progress.breakChoice === "illegal"
                  ? "Dry break"
                  : "Break foul"}
            </Text>
            <Text style={s.description}>
              {session.progress.breakChoice === "eight"
                ? session.progress.foul
                  ? "Spot the 8 or re-rack."
                  : "Spot the 8 or re-rack."
                : session.progress.breakChoice === "illegal"
                  ? "Under four balls to a rail."
                  : foulShort(session.progress.foul)}
            </Text>
            {session.progress.breakChoice === "eight" ? (
              <Button
                label={
                  session.progress.foul
                    ? "Spot 8 · cue ball in hand"
                    : "Spot 8 · continue"
                }
                onPress={() => session.resolveBreak("spot")}
              />
            ) : (
              <Button
                label="Accept table"
                onPress={() => session.resolveBreak("accept")}
              />
            )}
            {session.progress.breakChoice !== "foul" && (
              <Button
                label="Re-rack, I break"
                onPress={() => session.resolveBreak("rerack")}
              />
            )}
            {session.progress.breakChoice === "illegal" && (
              <Button
                label="Re-rack, they break"
                onPress={() => session.resolveBreak("opponent-break")}
              />
            )}
            {session.progress.breakChoice === "foul" && (
              <Button
                label="Ball in hand"
                onPress={() => session.resolveBreak("hand")}
              />
            )}
          </ScrollView>
        </View>
      </Modal>
      <Modal
        supportedOrientations={["landscape"]}
        transparent
        visible={panel === "spin"}
        animationType="fade"
        onRequestClose={() => setPanel(null)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss spin picker"
          onPress={() => setPanel(null)}
          style={s.scrim}
        >
          <Spin
            size={compact ? 210 : 260}
            editable
            onRelease={() => setPanel(null)}
          />
        </Pressable>
      </Modal>
      <Modal
        supportedOrientations={["landscape"]}
        transparent
        visible={panel !== null && panel !== "spin"}
        animationType="fade"
        onRequestClose={() => setPanel(null)}
      >
        <View style={s.scrim}>
          <ScrollView
            style={[s.panel, { padding: 0, maxHeight: "92%", flexGrow: 0 }]}
            contentContainerStyle={{ padding: 18 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.panelTop}>
              <Text style={s.eyebrow}>
                {panel === "skins"
                  ? "THE COLLECTION"
                  : panel === "drills"
                    ? "THE PRACTICE ROOM"
                    : panel === "spin"
                      ? "CONTROL THE CUE BALL"
                      : panel === "you" || panel === "rival"
                        ? "PLAYER CARD"
                        : "YOUR TABLE"}
              </Text>
              <Button label="Close" onPress={() => setPanel(null)}>
                <Text style={s.close}>×</Text>
              </Button>
            </View>
            {panel === "skins" && (
              <>
                <Text style={s.panelTitle}>A different atmosphere.</Text>
                <Text style={s.description}>Six cities. Find your table.</Text>
                <FlatList
                  horizontal
                  data={skins}
                  keyExtractor={(item) => item.id}
                  style={{ marginTop: 24 }}
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item, index: i }) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${item.name}`}
                      key={item.id}
                      disabled={!allowedSkins.includes(i)}
                      onPress={() => {
                        session.skin = i;
                        session.notify();
                        setPanel(null);
                      }}
                      style={[
                        s.skinCard,
                        { width: 170, flex: 0, marginRight: 12 },
                        session.skin === i && { borderColor: C.gold },
                      ]}
                    >
                      <View
                        style={[
                          s.skinPreview,
                          {
                            backgroundColor: item.wood,
                            borderColor: item.metal,
                          },
                        ]}
                      >
                        <View
                          style={[s.skinCloth, { backgroundColor: item.cloth }]}
                        >
                          {[0, 1, 2, 3].map((j) => (
                            <View
                              key={j}
                              style={[
                                s.previewPocket,
                                {
                                  left: j % 2 ? "auto" : -3,
                                  right: j % 2 ? -3 : "auto",
                                  top: j < 2 ? -3 : "auto",
                                  bottom: j >= 2 ? -3 : "auto",
                                },
                              ]}
                            />
                          ))}
                        </View>
                      </View>
                      <Text style={s.skinName}>{item.name}</Text>
                      <Text style={s.skinCaption}>
                        {i === session.skin
                          ? "ON YOUR TABLE"
                          : !allowedSkins.includes(i)
                            ? "LEVEL LOCKED"
                            : "TRY THIS FINISH"}
                      </Text>
                    </Pressable>
                  )}
                />
              </>
            )}
            {panel === "drills" && (
              <>
                <Text style={s.panelTitle}>Make every shot count.</Text>
                <View style={s.drills}>
                  {[
                    {
                      id: "break",
                      name: "The opening break",
                      detail: "A full rack. A clean slate.",
                    },
                    {
                      id: "pocket",
                      name: "Pocket control",
                      detail: "A straight pot. Watch the ball racks update.",
                    },
                    {
                      id: "finish",
                      name: "Finish the rack",
                      detail: "Pot the 8 ball, then start your next rack.",
                    },
                    {
                      id: "cut",
                      name: "Find your angle",
                      detail: "Cut shots and pocket control.",
                    },
                    {
                      id: "spin",
                      name: "Master the cue ball",
                      detail: "A straight shot for draw and follow.",
                    },
                    {
                      id: "open",
                      name: "Open practice",
                      detail: "A little room to experiment.",
                    },
                  ].map((d) => (
                    <Pressable
                      key={d.id}
                      accessibilityRole="button"
                      accessibilityLabel={d.name}
                      onPress={() => {
                        session.reset(d.id);
                        setPanel(null);
                      }}
                      style={s.drill}
                    >
                      <View>
                        <Text style={s.drillName}>{d.name}</Text>
                        <Text style={s.description}>{d.detail}</Text>
                      </View>
                      <Text style={s.chevron}>↗</Text>
                    </Pressable>
                  ))}
                </View>
                {!paidMatch && (
                  <>
                    <Text style={[s.eyebrow, { marginTop: 18 }]}>
                      SHARE A RUN
                    </Text>
                    <Text style={s.description}>
                      A replay code re-runs the exact shots on anyone's table.
                      Shared runs never count as your own.
                    </Text>
                    <TextInput
                      accessibilityLabel="Replay code"
                      value={code}
                      onChangeText={setCode}
                      placeholder="Paste a CM1 code"
                      placeholderTextColor="#65758a"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={s.codeInput}
                    />
                    <View style={s.actions}>
                      <Button
                        label="Watch code"
                        disabled={!code.trim()}
                        onPress={() => {
                          if (session.playCode(code)) setPanel(null);
                          else setCode("");
                        }}
                      />
                      <Button
                        label="Share this run"
                        disabled={!session.replayShots.length}
                        onPress={() => {
                          void Share.share({
                            message: encodeReplay(
                              session.drill,
                              session.replayShots,
                            ),
                          });
                        }}
                      />
                    </View>
                  </>
                )}
                <View style={s.actions}>
                  {!paidMatch && (
                    <Button
                      label="Watch replay"
                      disabled={!session.canReplay}
                      onPress={() => {
                        session.startReplay();
                        setPanel(null);
                      }}
                    />
                  )}
                  <Button
                    label="Repeat last shot"
                    disabled={session.running || !session.saved}
                    onPress={() => {
                      session.repeat();
                      setPanel(null);
                    }}
                  />
                  <Button
                    label="Place cue ball"
                    disabled={session.running || session.cpuTurn}
                    onPress={() => {
                      session.placement = true;
                      session.message = "Tap a clear spot on the cloth.";
                      session.notify();
                      setPanel(null);
                    }}
                  />
                </View>
              </>
            )}
            {panel === "quit" && (
              <>
                <Text style={s.panelTitle}>Quit match?</Text>
                {!!exitError && <Text style={s.description}>{exitError}</Text>}
                <Text style={s.description}>
                  {isOnline
                    ? `Resigning counts as a loss. ${session.opponentName} takes the ${entryFee * 2}-coin pot.`
                    : paidMatch
                      ? `Counts as a loss. ${entryFee} coins stay paid.`
                      : "You will leave this rack and lose your current progress."}
                </Text>
                <Button label="Keep playing" onPress={() => setPanel(null)} />
                <Button
                  label={exitBusy ? "Saving…" : isOnline ? "Resign" : "Quit"}
                  onPress={() => {
                    if (!exitBusy) onExit?.();
                  }}
                />
              </>
            )}
            {panel === "you" && (
              <StatsSheet
                name={playerName}
                avatar={playerAvatar}
                stats={playerStats}
              />
            )}
            {panel === "rival" && session.remote && (
              <>
                <View style={s.statHead}>
                  <Avatar opponent variant={session.remote.avatar} />
                  <View>
                    <Text style={s.panelTitle}>
                      {session.remote.name} {flag(session.remote.country)}
                    </Text>
                    <Text style={s.description}>Online player</Text>
                  </View>
                </View>
                <View style={s.statGrid}>
                  <Stat label="LEVEL" value={session.remote.level} />
                  <Stat label="TROPHIES" value={session.remote.trophies} />
                  <Stat
                    label="ONLINE WINS"
                    value={online.match?.opponent.wins ?? 0}
                  />
                  <Stat
                    label="SHOT CLOCK"
                    value={`${cueById(session.cueIds[1]).seconds}s`}
                  />
                </View>
              </>
            )}
            {panel === "rival" && session.cpu && (
              <>
                <View style={s.statHead}>
                  <Avatar opponent variant={session.cpu.avatar} />
                  <View>
                    <Text style={s.panelTitle}>{session.cpu.name}</Text>
                    <Text style={s.description}>{session.cpu.motto}</Text>
                  </View>
                </View>
                <View style={s.statGrid}>
                  <Stat label="TIER" value={session.cpu.tier} />
                  <Stat label="STYLE" value={session.cpu.style || "steady"} />
                  <Stat
                    label="SKILL"
                    value={`${Math.round(session.cpu.skill * 100)}%`}
                  />
                  <Stat
                    label="SHOT CLOCK"
                    value={`${cueById(session.cueIds[1]).seconds}s`}
                  />
                </View>
                <Text style={s.description}>
                  A house player run by the game. Their skill follows your
                  recent results.
                </Text>
              </>
            )}
            {panel === "settings" && (
              <>
                <Text style={s.panelTitle}>Table menu</Text>
                <Text style={s.description}>{modeLabel}</Text>
                {onExit && (
                  <Button label="Quit match" onPress={() => setPanel("quit")} />
                )}
                {!paidMatch && (
                  <View style={s.actions}>
                    <Button
                      label="Table collection"
                      onPress={() => setPanel("skins")}
                    />
                    <Button
                      label="Practice drills"
                      onPress={() => setPanel("drills")}
                    />
                  </View>
                )}
                <View style={s.actions}>
                  {!paidMatch && (
                    <Button
                      label="New full rack"
                      onPress={() => {
                        session.reset("break");
                        setPanel(null);
                      }}
                    />
                  )}
                  <Button
                    label={session.sound ? "Sound on" : "Sound off"}
                    active={session.sound}
                    onPress={() => {
                      session.sound = !session.sound;
                      session.notify();
                    }}
                  />
                  {!paidMatch && (
                    <Button
                      label="Reset table"
                      onPress={() => {
                        session.reset();
                        setPanel(null);
                      }}
                    />
                  )}
                </View>
                <View style={s.diagnostics}>
                  <Text style={s.eyebrow}>LOCAL PERFORMANCE</Text>
                  <Text style={s.description}>
                    {session.fps || "—"} fps ·{" "}
                    {session.p95 ? session.p95.toFixed(1) : "—"} ms p95 frame
                    time
                  </Text>
                  {session.lastPerformance && (
                    <Text style={s.description}>
                      Last shot: {session.lastPerformance.fps.toFixed(1)} fps ·{" "}
                      {session.lastPerformance.p95.toFixed(1)} ms p95 ·{" "}
                      {session.lastPerformance.over20ms}/
                      {session.lastPerformance.frames} frames over 20 ms
                    </Text>
                  )}
                  <Text style={s.description}>
                    Physics: 240 Hz with adaptive contact substeps.
                  </Text>
                  <Text style={s.description}>
                    Offline practice prototype · device certification pending.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  finishOverlay: {
    position: "absolute",
    top: 88,
    bottom: 62,
    left: 54,
    right: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#07101a66",
  },
  finishCard: {
    width: 230,
    padding: 16,
    gap: 10,
    borderRadius: 18,
    backgroundColor: "#142334f5",
    borderWidth: 1,
    borderColor: "#637786",
    alignItems: "stretch",
  },
  finishTitle: {
    color: "#fff8e8",
    fontSize: 25,
    fontWeight: "700",
    textAlign: "center",
  },
  playAgain: {
    minHeight: 48,
    borderRadius: 9,
    backgroundColor: "#e1c287",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  playAgainText: {
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.8,
    color: "#142334",
  },
  ballRow: { flexDirection: "row", gap: 2, alignItems: "center" },
  ballBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  ballStripe: { position: "absolute", height: 8, left: 0, right: 0 },
  ballDigit: {
    fontSize: 8,
    fontWeight: "800",
    color: "#121820",
    backgroundColor: "#fff9e9",
    width: 10,
    height: 10,
    lineHeight: 10,
    textAlign: "center",
    borderRadius: 7,
  },
  potSlash: {
    position: "absolute",
    width: 24,
    height: 2,
    backgroundColor: "#e5efff",
    transform: [{ rotate: "-45deg" }],
  },
  emptyBall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#405168",
    backgroundColor: "#0b111e",
  },
  groupLabel: {
    color: "#d1e9f3",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginTop: 3,
  },
  pottedRack: {
    position: "absolute",
    right: 8,
    top: "64%",
    bottom: 70,
    width: 154,
    alignItems: "center",
    gap: 6,
  },
  pottedColumn: {
    flex: 1,
    flexWrap: "wrap",
    alignContent: "center",
    justifyContent: "flex-start",
    gap: 4,
  },
  returnLabel: {
    color: "#bec9d8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  returnEmpty: { color: "#b6d1df", fontSize: 10 },
  scratchLabel: {
    color: "#ffc784",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 6,
  },
  sideColumn: {
    position: "absolute",
    width: 154,
    alignItems: "center",
    gap: 8,
    zIndex: 3,
  },
  playerCard: {
    width: 154,
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ffffff1f",
    backgroundColor: "#0a1a27d9",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardSub: { fontSize: 10, color: "#9fc2d6", fontWeight: "600" },
  activePlayerCard: {
    borderColor: "#24dbb3aa",
    backgroundColor: "#0d2a2ee6",
    boxShadow: "0 2px 16px #00000055",
  },
  playerName: {
    maxWidth: 230,
    color: "#fffdf3",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  playerState: {
    color: "#5de5ba",
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 5,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
  },
  avatarHead: {
    position: "absolute",
    width: 23,
    height: 29,
    top: 8,
    borderRadius: 10,
  },
  avatarHair: {
    position: "absolute",
    width: 25,
    height: 10,
    top: 5,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: "#251e1b",
  },
  avatarShoulders: {
    position: "absolute",
    width: 44,
    height: 24,
    bottom: -10,
    borderRadius: 18,
  },
  avatarEyes: { position: "absolute", top: 21, flexDirection: "row", gap: 7 },
  avatarEye: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#24212a",
  },
  shotPower: { position: "absolute", left: 26, top: "34%" },
  shotSpin: {
    position: "absolute",
    right: 22,
    top: "42%",
    alignItems: "center",
    gap: 8,
  },
  topBar: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    zIndex: 3,
  },
  bottomBar: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    zIndex: 3,
  },
  barSide: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  playerStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ffffff1f",
    backgroundColor: "#0a1a27d9",
  },
  stripText: { gap: 5 },
  barCentre: { flex: 1, minWidth: 0, alignItems: "center", gap: 2 },
  bottomCentre: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 3,
  },
  barStatus: { alignItems: "center", gap: 3 },
  groupInline: { color: "#9fc2d6", fontSize: 10, fontWeight: "700" },
  pottedRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  statusCorner: { position: "absolute", width: 154, gap: 3 },
  aimCorner: {
    position: "absolute",
    width: 154,
    alignItems: "center",
    gap: 6,
  },
  shotStatus: { color: "#b9c9d9", fontSize: 11, letterSpacing: 1.2 },
  coachLabel: {
    color: "#ffd98a",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: 2,
    maxWidth: 330,
  },
  codeInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#ffffff2a",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#f4f1e8",
    fontSize: 12,
  },
  replayPill: {
    marginLeft: 12,
    paddingHorizontal: 12,
    minHeight: 30,
    justifyContent: "center",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#ffd05b88",
    backgroundColor: "#ffd05b1f",
  },
  replayPillText: {
    color: "#ffd05b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  tableBadge: { color: "#708198", fontSize: 10, letterSpacing: 1 },
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  stage: { width: "100%", overflow: "hidden" },
  header: {
    position: "absolute",
    top: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 3,
  },
  brand: { flexDirection: "row", gap: 10, alignItems: "center" },
  brandIcon: {
    width: 37,
    height: 37,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  brandNumber: {
    fontSize: 24,
    color: C.ink,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  wordmark: { fontSize: 17, fontWeight: "700", letterSpacing: 2, color: C.ink },
  brandDot: { fontSize: 11, color: C.muted },
  brandSub: { fontSize: 7, letterSpacing: 2.4, color: C.muted, marginTop: 5 },
  mode: { alignItems: "center", gap: 6 },
  modeLabel: { fontSize: 10, letterSpacing: 2.2, color: C.ink },
  modeDetail: { fontSize: 7, letterSpacing: 1.7, color: C.muted },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 3,
    backgroundColor: C.gold,
    position: "absolute",
    left: -13,
    top: 3,
  },
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#ffffff1f",
    borderRadius: 22,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#164565",
  },
  buttonText: {
    color: C.ink,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.1,
  },
  selected: { borderColor: C.gold },
  tableHeading: {
    position: "absolute",
    top: 92,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 7,
  },
  title: {
    fontSize: 29,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    color: C.ink,
  },
  subtitle: { fontSize: 7, letterSpacing: 2.4, color: C.muted },
  canvas: { position: "absolute" },
  leftTools: {
    position: "absolute",
    left: 28,
    top: "40%",
    alignItems: "center",
  },
  spinButton: { alignItems: "center", gap: 8, marginBottom: 20 },
  toolLabel: { fontSize: 7, letterSpacing: 1.4, color: C.muted, marginTop: 6 },
  spinButtonFrame: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff1f",
    backgroundColor: "#0a1a27d9",
  },
  rightTools: { position: "absolute", right: 32, top: "34%" },
  powerColumn: { alignItems: "center", gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: "600", letterSpacing: 2, color: C.gold },
  statHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  ringBadge: {
    position: "absolute",
    bottom: -4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: "#061420",
  },
  ringBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 18,
    marginBottom: 12,
  },
  stat: {
    minWidth: 118,
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#0a1a27b3",
    borderWidth: 1,
    borderColor: "#ffffff14",
  },
  statValue: { color: "#fffdf3", fontSize: 18, fontWeight: "800" },
  statLabel: {
    color: "#89a6bb",
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: "700",
    marginTop: 2,
  },
  powerTrack: {
    width: 11,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#061420cc",
    overflow: "visible",
  },
  // The fill is clipped so the gradient keeps its colours as the bar grows.
  powerFillClip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 7,
    overflow: "hidden",
  },
  powerTick: {
    position: "absolute",
    left: 14,
    width: 5,
    height: 1,
    backgroundColor: "#ffffff30",
  },
  powerKnob: {
    position: "absolute",
    width: 25,
    height: 25,
    left: -8,
    borderRadius: 13,
    backgroundColor: "#fffdf3",
    borderWidth: 3,
    borderColor: "#ffd05b",
    boxShadow: "0 2px 8px #00000066",
  },
  powerValue: {
    fontSize: 13,
    fontWeight: "800",
    color: C.gold,
    fontVariant: ["tabular-nums"],
  },
  controlCaption: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: "#89a6bb",
  },
  tiny: {
    fontSize: 6,
    lineHeight: 10,
    letterSpacing: 1.2,
    color: C.muted,
    textAlign: "center",
  },
  bottom: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  bottomLeft: { gap: 10 },
  bottomRight: { gap: 10, alignItems: "flex-end" },
  bottomNote: { fontSize: 7, letterSpacing: 0.9, color: C.muted },
  skinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#9da795",
  },
  chevron: { color: C.gold, fontSize: 17 },
  centerBottom: { alignItems: "center", gap: 9, flex: 1 },
  message: { color: "#bcc9bc", fontSize: 12, letterSpacing: 0.2 },
  fineAimWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  fineAim: {
    width: 196,
    height: 26,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#ffffff1a",
    backgroundColor: "#0a1a27b3",
  },
  aimHelp: { fontSize: 6, color: "#6d8072", letterSpacing: 1.2 },
  pottedTray: {
    position: "absolute",
    right: 42,
    top: 106,
    flexDirection: "row",
    gap: 4,
  },
  miniBall: {
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  miniNumber: {
    fontSize: 10,
    color: "#161e18",
    backgroundColor: "#eeeddb",
    width: 10,
    height: 10,
    borderRadius: 5,
    textAlign: "center",
  },
  scrim: {
    flex: 1,
    backgroundColor: "#050a0799",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  panel: {
    backgroundColor: C.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3b483b",
    padding: 16,
    width: "100%",
    maxWidth: 320,
  },
  panelTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  close: { color: C.ink, fontSize: 22 },
  panelTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    color: C.ink,
    fontSize: 20,
    marginBottom: 6,
  },
  description: { fontSize: 12, lineHeight: 20, color: C.muted },
  skinList: { flexDirection: "row", gap: 12, marginTop: 24 },
  skinCard: {
    flex: 1,
    borderRadius: 9,
    padding: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  skinPreview: {
    height: 85,
    padding: 9,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 15,
  },
  skinCloth: { flex: 1, borderRadius: 3 },
  previewPocket: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#040907",
  },
  skinName: {
    color: C.ink,
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  skinCaption: { fontSize: 6, letterSpacing: 1.1, color: C.gold, marginTop: 8 },
  drills: { marginVertical: 10 },
  drill: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  drillName: { fontSize: 14, color: C.ink, marginBottom: 2 },
  actions: { flexDirection: "row", gap: 12, marginTop: 15 },
  spinPanel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    gap: 20,
  },
  diagnostics: { marginTop: 24, gap: 8 },
  rotate: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 15,
  },
  error: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
  },
});
