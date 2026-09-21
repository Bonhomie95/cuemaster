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
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Canvas } from "./src/render/Canvas";
import { Scene } from "./src/render/Scene";
import { session, skins } from "./src/game/session";
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        active && s.selected,
        pressed && { opacity: 0.65 },
        disabled && { opacity: 0.35 },
      ]}
    >
      {children || <Text style={s.buttonText}>{label}</Text>}
    </Pressable>
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
  return (
    <View style={s.powerColumn}>
      <View
        accessibilityLabel="Pull down and release to shoot"
        hitSlop={18}
        {...responder.panHandlers}
        style={[
          s.powerTrack,
          compact && { height: 132 },
          (session.running || session.cpuTurn || session.progress.finished) && { opacity: 0.35 },
        ]}
      >
        <LinearGradient colors={["#54e9e0", "#42d89c", "#ffd05b", "#ff694c"]}
          style={[StyleSheet.absoluteFill, { borderRadius: 18, opacity: 0.45 + power * 0.55 }]} />
        <View style={[s.powerFill, { height: `${power * 100}%` }]} />
        {[0, 2, 4, 6, 8].map((n) => (
          <View
            key={n}
            style={[
              s.powerTick,
              { top: 10 + (n * (travel + 1)) / 8, width: 4 },
            ]}
          />
        ))}
        <View style={[s.powerKnob, { top: 8 + power * travel }]}>
          <View style={s.knobLine} />
        </View>
      </View>
      <Text style={s.powerValue}>
        {Math.round(power * 100)}
        <Text style={{ fontSize: 10, color: C.muted }}> %</Text>
      </Text>
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
function FineAim() {
  const start = React.useRef(0);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !session.running && !session.cpuTurn,
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
    <View
      {...pan.panHandlers}
      accessibilityLabel="Drag horizontally to fine tune aim"
      hitSlop={12}
      style={s.fineAim}
    >
      <Text style={s.fineArrow}>‹</Text>
      {Array.from({ length: 21 }, (_, i) => (
        <View
          key={i}
          style={{
            width: 1,
            height: i % 5 === 0 ? 12 : 6,
            backgroundColor: i === 10 ? C.gold : "#617065",
          }}
        />
      ))}
      <Text style={s.fineArrow}>›</Text>
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
      if (e.type === "ball" && e.time - last < 0.014) return;
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
class SceneBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    if (this.state.error)
      return (
        <View style={s.error}>
          <Text style={s.title}>The table couldn’t load.</Text>
          <Text style={s.description}>{this.state.error}</Text>
        </View>
      );
    return this.props.children;
  }
}
export default function TableGame({
  onExit,
  paidMatch = false,
  entryFee = 0,
  exitBusy = false,
  exitError = "",
  playerName = "YOU",
  playerAvatar = 0,
  modeLabel = "LOCAL PRACTICE",
  allowedSkins = [0],
}: {
  onExit?: () => void;
  paidMatch?: boolean;
  entryFee?: number;
  exitBusy?: boolean;
  exitError?: string;
  playerName?: string;
  playerAvatar?: number;
  modeLabel?: string;
  allowedSkins?: number[];
}) {
  return (
    <SafeAreaProvider>
      <Game
        onExit={onExit}
        paidMatch={paidMatch}
        entryFee={entryFee}
        exitBusy={exitBusy}
        exitError={exitError}
        playerName={playerName}
        playerAvatar={playerAvatar}
        modeLabel={modeLabel}
        allowedSkins={allowedSkins}
      />
    </SafeAreaProvider>
  );
}
function Avatar({
  opponent = false,
  variant = 0,
}: {
  opponent?: boolean;
  variant?: number;
}) {
  return (
    <View
      accessibilityLabel={opponent ? "Local opponent avatar" : "Your avatar"}
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
        style={{ width: 48, height: 48 }}
      />
    </View>
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
function PlayerBalls({ player }: { player: number }) {
  const group = session.progress.groups[player];
  const balls = session.world.balls
    .filter((b) => groupOf(b.id) === group && group !== null)
    .sort((a, b) => a.id - b.id);
  const left = balls.filter((b) => !b.pocketed).length;
  return (
    <View style={{ gap: 4, alignItems: player ? "flex-end" : "flex-start" }}>
      <Text style={s.groupLabel}>
        {group
          ? `${group.toUpperCase()} · ${left ? `${left} LEFT` : "ON THE 8"}`
          : "OPEN TABLE"}
      </Text>
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
function ClockBall({ player }: { player: number }) {
  const active = session.progress.turn === player;
  const total = cueById(session.cueIds[player]).seconds;
  const seconds = active ? session.secondsLeft : total;
  const ticking =
    active &&
    session.matchRules &&
    !session.running &&
    !session.progress.finished &&
    !session.progress.breakChoice;
  const urgent = clockUrgent(seconds, total, ticking);
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
  }, [seconds, urgent, pulse]);
  const color = urgent ? (seconds <= 3 ? "#ff543f" : "#ffb82e") : "#24dbb3";
  return (
    <Animated.View
      accessibilityLabel={`Player ${player + 1} shot clock: ${seconds} seconds${ticking ? " remaining" : " · waiting"}`}
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: active ? color : "#819ba7",
        backgroundColor: "#203b4e",
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: pulse }],
      }}
    >
      <View
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          height: `${(seconds / total) * 100}%`,
          backgroundColor: active ? color : "#62849b",
        }}
      />
      <View
        style={{
          width: 29,
          height: 29,
          borderRadius: 15,
          backgroundColor: "#fffdf3",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "#10253a",
            fontSize: 18,
            fontWeight: "900",
            fontVariant: ["tabular-nums"],
          }}
        >
          {seconds}
        </Text>
      </View>
      <View
        style={{
          position: "absolute",
          top: 5,
          left: 8,
          width: 12,
          height: 4,
          borderRadius: 4,
          backgroundColor: "#ffffffb0",
          transform: [{ rotate: "-30deg" }],
        }}
      />
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
  playerName,
  playerAvatar,
  modeLabel,
  allowedSkins,
}: {
  onExit?: () => void;
  paidMatch?: boolean;
  entryFee?: number;
  exitBusy?: boolean;
  exitError?: string;
  playerName: string;
  playerAvatar: number;
  modeLabel: string;
  allowedSkins: number[];
}) {
  const insets = useSafeAreaInsets();
  useSyncExternalStore(session.subscribe, session.snapshot);
  const { width, height } = useWindowDimensions();
  const [panel, setPanel] = useState<
    "skins" | "drills" | "spin" | "settings" | "quit" | null
  >(null);
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
  const [loaded, setLoaded] = useState(false);
  const turn = session.progress.turn;
  const compact = height < 560;
  const skin = skins[session.skin];
  const tableHeight =
    Platform.OS === "web"
      ? Math.min(height, width * 0.5625)
      : height - insets.top - insets.bottom;
  return (
    <View
      style={[
        s.root,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <StatusBar hidden />
      <Audio />
      <View style={[s.stage, { height: tableHeight, maxWidth: 1700 }]}>
        <GroupAnnouncement />
        <View style={s.matchHeader}>
          <Button label="Table settings" onPress={() => setPanel("settings")}>
            <Text style={{ color: C.ink, fontSize: 22 }}>☰</Text>
          </Button>
          <View style={[s.playerCard, turn === 0 && s.activePlayerCard]}>
            {paidMatch ? <ClockBall player={0} /> : null}
            <Avatar variant={playerAvatar} />
            <View>
              <Text numberOfLines={1} style={[s.playerName, { maxWidth: 110 }]}>
                {playerName.toUpperCase()} {turn === 0 ? " ◂" : ""}
              </Text>
              <Text
                style={{ fontSize: 11, color: "#d8efff", fontWeight: "700" }}
              >
                {cueById(session.cueIds[0]).name}
              </Text>
              <PlayerBalls player={0} />
            </View>
          </View>
          <View style={s.matchCenter}>
            <Text style={s.matchBrand}>CUEMASTER</Text>
            <Text numberOfLines={2} style={s.matchMode}>{modeLabel.toUpperCase()}</Text>
          </View>
          <View style={[s.playerCard, { flexDirection: "row-reverse" }, turn === 1 && s.activePlayerCard]}>
            {paidMatch ? <ClockBall player={1} /> : null}
            <Avatar opponent variant={session.cpu?.avatar ?? (playerAvatar === 0 ? 1 : 0)} />
            <View style={{ alignItems: "flex-end" }}>
              <Text numberOfLines={1} style={[s.playerName,{maxWidth:135}]}>{turn === 1 ? "▸ " : ""}{session.cpu ? session.cpu.name.toUpperCase() : "PLAYER 2"}</Text>
              <Text
                style={{ fontSize: 11, color: "#d8efff", fontWeight: "700" }}
              >
                {cueById(session.cueIds[1]).name}
              </Text>
              <PlayerBalls player={1} />
            </View>
          </View>
          <Button
            label="Switch camera"
            active={session.camera === "aim"}
            onPress={() => {
              session.camera = session.camera === "table" ? "aim" : "table";
              session.notify();
            }}
          >
            <Text style={s.cameraIcon}>◎</Text>
          </Button>
        </View>
        <View
          style={[
            s.canvas,
            {
              top: 86,
              bottom: 58,
              left: 52,
              right: 52,
            },
          ]}
        >
          <SceneBoundary>
            <Canvas
              camera={{ position: [0, 3, 1.86], fov: 42, near: 0.05, far: 30 }}
              dpr={[1, 1.7]}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: "high-performance",
              }}
              onCreated={() => setLoaded(true)}
            >
              <Scene />
            </Canvas>
          </SceneBoundary>
        </View>
        {!loaded && (
          <View style={s.loading}>
            <Text style={s.description}>Preparing your table…</Text>
          </View>
        )}
        <View style={s.shotPower}>
          <Power compact />
        </View>
        <View style={s.shotSpin}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Adjust spin"
            disabled={session.running || session.cpuTurn}
            onPress={() => setPanel("spin")}
            style={{ padding: 8 }}
          >
            <Spin size={38} />
          </Pressable>
        </View>
        <View style={s.returnTray} accessibilityLiveRegion="polite">
          <Text style={s.returnLabel}>POTTED</Text>
          <View style={s.ballRow}>
            {session.progress.returned.length ? (
              session.progress.returned.map((id) => (
                <BallBadge
                  key={id}
                  id={id}
                  recent={session.progress.shotPots.includes(id)}
                />
              ))
            ) : (
              <Text style={s.returnEmpty}>Balls appear here when pocketed</Text>
            )}
          </View>
          {(session.progress.scratch ||
            (paidMatch && !!session.progress.foul)) && (
            <Text style={s.scratchLabel}>
              {session.placement || session.running
                ? `${session.progress.foul || "SCRATCH"} · BALL IN HAND`
                : `LAST SHOT · ${session.progress.foul || "SCRATCH"}`}
            </Text>
          )}
          {session.progress.finished && (
            <Text style={s.scratchLabel}>RACK COMPLETE</Text>
          )}
        </View>
        <View style={s.shotFooter}>
          <Text style={s.shotStatus}>
            {session.running
              ? session.progress.shotPots.length
                ? `POTTED: ${session.progress.shotPots.join(", ")}`
                : "BALLS IN PLAY"
              : session.cpuTurn
                ? `${session.cpu!.name.toUpperCase()} IS AIMING…`
              : session.placement
                ? session.headStringPlacement
                  ? "DRAG ON / BEHIND LINE · RELEASE TO PLACE"
                  : "PLACE THE CUE BALL"
                : session.progress.finished
                  ? "RESET TABLE TO PLAY AGAIN"
                  : `${turn === 0 ? "YOUR" : "PLAYER 2’S"} TURN`}
          </Text>
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
            <FineAim />
          )}
          <Text style={s.tableBadge}>{skin.name.toUpperCase()} · 9 FT</Text>
        </View>
        {session.progress.finished && !session.running && (
          <View style={s.finishOverlay}>
            <View style={s.finishCard} accessibilityLiveRegion="polite">
              <Text style={s.finishTitle}>
                {paidMatch
                  ? localWinner(session.progress) === 0
                    ? "You win"
                    : `${session.cpu?.name || "Player 2"} wins`
                  : "Rack complete"}
              </Text>
              <Text style={s.description}>
                {session.progress.returned.includes(8)
                  ? "The 8 ball was pocketed."
                  : "Every object ball is pocketed."}
              </Text>
              {!paidMatch && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Play again"
                  style={s.playAgain}
                  onPress={() => session.reset("break")}
                >
                  <Text style={s.playAgainText}>PLAY AGAIN · FULL RACK</Text>
                </Pressable>
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
            </View>
          </View>
        )}
        {width < height && Platform.OS !== "web" && (
          <View style={s.rotate}>
            <Text style={s.title}>A wider perspective.</Text>
            <Text style={s.description}>Rotate your phone to play.</Text>
          </View>
        )}
      </View>
      <Modal
        transparent
        visible={!!session.progress.breakChoice && !session.running && !session.cpuTurn}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={s.scrim}>
          <ScrollView style={[s.panel, { maxHeight: "90%", flexGrow: 0 }]}>
            <Text style={s.eyebrow}>
              {session.progress.turn === 0 ? playerName : "PLAYER 2"} · YOUR
              CHOICE
            </Text>
            <Text style={s.panelTitle}>
              {session.progress.breakChoice === "eight"
                ? "8 ball on the break"
                : session.progress.breakChoice === "illegal"
                  ? "Illegal break"
                  : "Foul on the break"}
            </Text>
            <Text style={s.description}>
              {session.progress.breakChoice === "eight"
                ? session.progress.foul
                  ? "The break was a foul. The incoming player can spot the 8 and take the cue ball behind the head string, or break again."
                  : "This is not a win or a loss. Spot the 8 and continue, or break again. The table remains open."
                : session.progress.breakChoice === "illegal"
                  ? "No ball was pocketed and fewer than four object balls reached a rail. The incoming player chooses what happens next."
                  : `${session.progress.foul}. Accept the position or take the cue ball behind the head string.`}
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
                label="Re-rack · I break"
                onPress={() => session.resolveBreak("rerack")}
              />
            )}
            {session.progress.breakChoice === "illegal" && (
              <Button
                label="Re-rack · original player breaks"
                onPress={() => session.resolveBreak("opponent-break")}
              />
            )}
            {session.progress.breakChoice === "foul" && (
              <Button
                label="Cue ball in hand · behind head string"
                onPress={() => session.resolveBreak("hand")}
              />
            )}
          </ScrollView>
        </View>
      </Modal>
      <Modal
        transparent
        visible={panel === "spin"}
        animationType="fade"
        onRequestClose={() => setPanel(null)}
      >
        <Pressable
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
        transparent
        visible={panel !== null && panel !== "spin"}
        animationType="fade"
        onRequestClose={() => setPanel(null)}
      >
        <View style={s.scrim}>
          <ScrollView
            style={[s.panel, { padding: 0, maxHeight: "92%", flexGrow: 0 }]}
            contentContainerStyle={{ padding: compact ? 20 : 30 }}
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
                <View style={s.actions}>
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
                  {paidMatch
                    ? `You will lose this game. Your ${entryFee} coin entry fee will not be refunded.`
                    : "You will leave this rack and lose your current progress."}
                </Text>
                <Button label="Keep playing" onPress={() => setPanel(null)} />
                <Button
                  label={exitBusy ? "Saving…" : "Quit match and leave"}
                  onPress={() => {
                    if (!exitBusy) onExit?.();
                  }}
                />
              </>
            )}
            {panel === "settings" && (
              <>
                <Text style={s.panelTitle}>Table menu</Text>
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
    width: 286,
    padding: 20,
    gap: 12,
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
  returnTray: {
    position: "absolute",
    bottom: 31,
    left: 65,
    right: 65,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    height: 24,
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
  matchHeader: {
    position: "absolute",
    top: 8,
    left: 14,
    right: 14,
    height: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 3,
  },
  playerCard: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    flex: 1,
    maxWidth: 320,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#486477",
    backgroundColor: "#102c40",
    justifyContent: "center",
  },
  activePlayerCard: {
    borderColor: "#4ee7bb",
    backgroundColor: "#143e49",
    boxShadow: "0 3px 14px #00000040",
  },
  playerName: {
    color: "#f4f6fb",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  playerState: {
    color: "#5de5ba",
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 5,
  },
  matchCenter: { alignItems: "center", justifyContent: "center", gap: 5, width: 108 },
  matchBrand: {
    color: "#ffd05b",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  matchMode: { color: "#e0f3fc", fontSize: 10, letterSpacing: 0.8, textAlign: "center" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  shotPower: { position: "absolute", left: 15, top: "36%" },
  shotSpin: { position: "absolute", right: 8, top: "43%" },
  shotFooter: {
    position: "absolute",
    bottom: 4,
    left: 74,
    right: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shotStatus: { color: "#9eafc3", fontSize: 10, letterSpacing: 1 },
  tableBadge: { color: "#708198", fontSize: 10, letterSpacing: 1 },
  root: {
    flex: 1,
    backgroundColor: "#080c15",
    alignItems: "center",
    justifyContent: "center",
  },
  stage: { width: "100%", backgroundColor: C.bg, overflow: "hidden" },
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
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
  cameraIcon: { fontSize: 26, lineHeight: 28, color: C.ink },
  rightTools: { position: "absolute", right: 32, top: "34%" },
  powerColumn: { alignItems: "center", gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: "600", letterSpacing: 2, color: C.gold },
  powerTrack: {
    width: 12,
    height: 178,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#85cde9",
    backgroundColor: "#0b120e",
    overflow: "visible",
  },
  powerFill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    opacity: 0.24,
    borderRadius: 18,
  },
  powerTick: {
    position: "absolute",
    right: 3,
    height: 1,
    backgroundColor: "#b6e6f6",
  },
  powerKnob: {
    position: "absolute",
    width: 24,
    height: 18,
    left: -7,
    borderRadius: 9,
    backgroundColor: "#ffcd42",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: "#efe1bd",
  },
  knobLine: { height: 2, width: 9, backgroundColor: "#614100" },
  powerValue: { fontSize: 12, color: C.ink, fontVariant: ["tabular-nums"] },
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
  fineAim: {
    width: 185,
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fineArrow: { color: C.muted, fontSize: 17 },
  aimHelp: { fontSize: 6, color: "#6d8072", letterSpacing: 1.2 },
  loading: { position: "absolute", top: "48%", alignSelf: "center" },
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
    backgroundColor: "#050a07cc",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  panel: {
    backgroundColor: C.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#3b483b",
    padding: 30,
    width: "100%",
    maxWidth: 640,
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
    fontSize: 26,
    marginBottom: 8,
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
