import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import {
  api,
  DailyClaim,
  DailyMission,
  DailyReward,
  Granted,
  Player,
  SpinResult,
  Today,
  WheelSegment,
} from "./api";
import { showRewardedVideo } from "./ads";
import { celebrate, tap, warn } from "./feedback";
import { Press, Enter, CountUp, Pulse, PageFade } from "./motion";
import IconButton from "./IconButton";

/**
 * The daily-return screens: login streak, free gift, spin wheel, missions and the CueMaster
 * Pass, plus `DailyHub`, which puts them behind four tabs.
 *
 * Nothing here decides a reward. Every claim goes to the server, which rolls and pays it and
 * answers with the new balance and the whole board (`Today`); these screens only draw that.
 * Crates are shown by type, never by contents.
 *
 * Built for a landscape phone: about 330pt of height under the club's top bar, so everything
 * lays out in rows, sizes itself from the short edge of the window, and scrolls rather than
 * falling off the bottom.
 */

type Icon = React.ComponentProps<typeof Feather>["name"];
const C = {
  gold: "#ffd05b",
  teal: "#24dbb3",
  ruby: "#ff5f6d",
  purple: "#b98cff",
  text: "#fffdf3",
  muted: "#a9c4d6",
  dim: "#7f96a8",
  ink: "#10233a",
  line: "#ffffff1c",
};
const TIER: Record<string, string> = {
  practice: "#7f96a8",
  club: "#24dbb3",
  silver: "#9fb6c7",
  gold: "#ffb82e",
  champion: "#b98cff",
  master: "#ff5f6d",
};
const tint = (tier?: string) => (tier && TIER[tier]) || C.dim;

export type DailyProps = {
  /** Called with the updated player after every claim, so balances elsewhere move too. */
  onPlayer: (player: Player) => void;
  /**
   * Pass `today` with `onToday` to share one board between several components (as `DailyHub`
   * does); omit both and the component loads `/me/today` itself.
   */
  today?: Today | null;
  onToday?: (today: Today) => void;
};

function useBoard({ today, onToday, onPlayer }: DailyProps) {
  const shared = !!onToday;
  const [own, setOwn] = useState<Today | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(false);
  const setBoard = (t: Today) => (shared ? onToday!(t) : setOwn(t));
  const reload = async () => {
    const t = await api<Today>("/me/today");
    setBoard(t);
    return t;
  };
  useEffect(() => {
    if (!shared) reload().catch((e) => setError((e as Error).message));
  }, [shared]);
  /** A claim's answer moves the balance and the board together. */
  const apply = (r: { player: Player; today: Today }) => {
    onPlayer(r.player);
    setBoard(r.today);
  };
  /** One action at a time; after a refusal the board is reloaded, so the screen shows the truth. */
  async function run(fn: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      warn();
      setError((e as Error).message);
      reload().catch(() => {});
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return {
    today: shared ? (today ?? null) : own,
    busy,
    error,
    setError,
    run,
    apply,
    reload,
  };
}

function useNow(every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

/** Whole units, like the crate timers: a gift that says "3h" and opens at 2h 59m looks broken. */
function left(ms: number) {
  if (ms <= 0) return "now";
  const d = Math.floor(ms / 86400000),
    h = Math.floor((ms % 86400000) / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}
const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;
type Part = { icon: Icon; color: string; text: string };
/** A reward's parts, crate first. `short` drops the units the icon already says, for tight cells. */
function parts(r: DailyReward, short = false) {
  const out: Part[] = [];
  if (r.crate)
    out.push({
      icon: "package",
      color: tint(r.crate.tier),
      text: short ? r.crate.name.replace(/ crate$/i, "") : r.crate.name,
    });
  if (r.coins)
    out.push({
      icon: "circle",
      color: C.gold,
      text: short ? r.coins.toLocaleString() : plural(r.coins, "coin", "coins"),
    });
  if (r.rubies)
    out.push({
      icon: "hexagon",
      color: C.ruby,
      text: short ? `${r.rubies}` : plural(r.rubies, "ruby", "rubies"),
    });
  return out;
}
const rewardText = (r: DailyReward) =>
  parts(r)
    .map((p) => p.text)
    .join(" + ");
/** What a claim paid, in one line. A crate that became coins says so and says how many. */
function grantedText(g: Granted) {
  const paid = [
    g.coins ? `+${plural(g.coins, "coin", "coins")}` : "",
    g.rubies ? `+${plural(g.rubies, "ruby", "rubies")}` : "",
    g.crate ? `${g.crate.name} added to your slots` : "",
    g.passXp ? `+${g.passXp} pass XP` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return g.fallback
    ? `${paid}. Your crate slots were full, so the ${g.fallback.name} paid ${plural(g.fallback.coins, "coin", "coins")}.`
    : paid;
}

function Button({
  label,
  icon,
  onPress,
  primary = false,
  disabled = false,
  compact = false,
}: {
  label: string;
  icon?: Icon;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const gold = primary && !disabled;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        compact && s.buttonCompact,
        gold ? s.primary : s.ghost,
        disabled && { opacity: 0.45 },
      ]}
    >
      {!!icon && (
        <Feather
          name={icon}
          size={compact ? 12 : 14}
          color={gold ? C.ink : "#cfe0ee"}
        />
      )}
      <Text style={[s.buttonText, gold && { color: C.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

function Message({ error, note }: { error?: string; note?: string }) {
  if (error)
    return (
      <Text accessibilityRole="alert" style={s.error}>
        <Feather name="alert-circle" size={12} color="#ffb6b6" /> {error}
      </Text>
    );
  return note ? (
    <Enter key={note} from={6}>
      <Text style={s.note}>{note}</Text>
    </Enter>
  ) : null;
}

function Loading({ error }: { error?: string }) {
  return error ? (
    <Message error={error} />
  ) : (
    <ActivityIndicator color="#ffd184" style={{ margin: 24 }} />
  );
}

/** A reward as an icon chip and a short label: the first part leads, the rest follow. */
function Prize({
  reward,
  size = 36,
  short = false,
}: {
  reward: DailyReward;
  size?: number;
  short?: boolean;
}) {
  const [main, ...more] = parts(reward, short);
  if (!main) return null;
  return (
    <View style={{ alignItems: "center", gap: short ? 2 : 3 }}>
      <View
        style={[
          s.chip,
          {
            width: size,
            height: size,
            borderRadius: size * 0.3,
            backgroundColor: `${main.color}22`,
            borderColor: `${main.color}66`,
          },
        ]}
      >
        <Feather name={main.icon} size={size * 0.5} color={main.color} />
      </View>
      <Text style={s.prize} numberOfLines={1}>
        {main.text}
      </Text>
      {more.map((p) => (
        <Text key={p.icon} style={[s.prizeMore, { color: p.color }]}>
          {short ? (
            <>
              <Feather name={p.icon} size={9} color={p.color} /> +{p.text}
            </>
          ) : (
            `+ ${p.text}`
          )}
        </Text>
      ))}
    </View>
  );
}

/** With every crate slot full, say plainly what each crate reward pays instead. */
function FullSlots({
  today,
  rewards,
}: {
  today: Today;
  rewards: DailyReward[];
}) {
  if (today.slots.held < today.slots.max) return null;
  const crates = new Map(
    rewards.flatMap((r) => (r.crate ? [[r.crate.tier, r.crate] as const] : [])),
  );
  if (!crates.size) return null;
  return (
    <Text style={s.small}>
      <Feather name="info" size={11} color="#90aabd" /> Your crate slots are
      full, so crates pay coins instead:{" "}
      {[...crates.values()]
        .map(
          (c) =>
            `${c.name.replace(/ crate$/i, "")} ${c.fallbackCoins.toLocaleString()}`,
        )
        .join(" · ")}
      .
    </Text>
  );
}

/** A bar that grows to its value, so progress arrives instead of appearing. */
function Bar({
  value,
  color,
  height = 6,
}: {
  value: number;
  color: string;
  height?: number;
}) {
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(fill, {
      toValue: Math.max(0, Math.min(1, value)),
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [value, fill]);
  return (
    <View style={[s.track, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: color,
          width: fill.interpolate({
            inputRange: [0, 1],
            outputRange: ["0%", "100%"],
          }),
        }}
      />
    </View>
  );
}

/** Seven days in a row; the seventh is the big one. A missed day starts the week again. */
export function StreakCalendar(props: DailyProps) {
  const { today, busy, error, run, apply } = useBoard(props);
  const [note, setNote] = useState("");
  const win = useWindowDimensions();
  const tile = Math.max(
    120,
    Math.min(190, Math.min(win.width, win.height) - 252),
  );
  if (!today) return <Loading error={error} />;
  const { day, claimedToday, rewards } = today.streak;
  const claim = () =>
    run(async () => {
      const r = await api<DailyClaim & { day: number }>(
        "/me/streak/claim",
        "POST",
        {},
      );
      apply(r);
      celebrate();
      setNote(`Day ${r.day}: ${grantedText(r.granted)}`);
    });
  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <View style={s.grow}>
          <Text style={s.eyebrow}>LOGIN STREAK</Text>
          <Text style={s.heading}>
            {claimedToday ? `Day ${day} collected` : `Day ${day} is waiting`}
          </Text>
        </View>
        <Text style={s.small}>
          {claimedToday
            ? `Day ${(day % rewards.length) + 1} unlocks tomorrow`
            : "Miss a day and the week starts again"}
        </Text>
      </View>
      <View style={s.week}>
        {rewards.map((reward, i) => {
          const n = i + 1,
            done = n < day || (n === day && claimedToday),
            ready = n === day && !claimedToday,
            big = n === rewards.length;
          return (
            <Enter key={n} index={i} style={{ flex: big ? 1.35 : 1 }}>
              <Pulse active={ready && !busy}>
                <View
                  accessible
                  accessibilityLabel={`Day ${n}: ${rewardText(reward)}${done ? ", collected" : ready ? ", ready" : ""}`}
                  style={[
                    s.day,
                    { height: tile },
                    big && s.dayBig,
                    done && s.dayDone,
                    ready && s.dayReady,
                  ]}
                >
                  {(big || ready) && (
                    <LinearGradient
                      pointerEvents="none"
                      colors={[`${C.gold}${ready ? "38" : "1f"}`, "#00000000"]}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Text
                    style={[s.dayLabel, (ready || big) && { color: C.gold }]}
                  >
                    DAY {n}
                  </Text>
                  <Prize reward={reward} size={tile > 140 ? 38 : 30} />
                  {done ? (
                    <Feather name="check-circle" size={18} color={C.teal} />
                  ) : ready ? (
                    <Button
                      primary
                      compact
                      icon="gift"
                      label="Claim"
                      disabled={busy}
                      onPress={claim}
                    />
                  ) : (
                    <Text style={s.dayNext}>{big ? "BIG DAY" : " "}</Text>
                  )}
                </View>
              </Pulse>
            </Enter>
          );
        })}
      </View>
      <FullSlots today={today} rewards={rewards} />
      <Message error={error} note={note} />
    </View>
  );
}

/** The free gift as a compact button with a live countdown. */
export function FreeGift(props: DailyProps) {
  const { today, busy, error, run, apply } = useBoard(props);
  const now = useNow();
  const [paid, setPaid] = useState(0);
  useEffect(() => {
    if (!paid) return;
    const timer = setTimeout(() => setPaid(0), 2600);
    return () => clearTimeout(timer);
  }, [paid]);
  if (!today) return null;
  const readyAt = today.gift.readyAt ? Date.parse(today.gift.readyAt) : 0;
  const ready = readyAt <= now;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={
        ready
          ? `Collect the free gift, ${today.gift.coins} coins`
          : `Next free gift in ${left(readyAt - now)}`
      }
      accessibilityState={{ disabled: !ready || busy }}
      disabled={!ready || busy}
      onPress={() =>
        run(async () => {
          const r = await api<DailyClaim>("/me/gift/claim", "POST", {});
          apply(r);
          celebrate();
          setPaid(r.granted.coins);
        })
      }
      style={[s.gift, ready && s.giftReady]}
    >
      <Pulse
        active={ready && !busy}
        style={[s.giftIcon, ready && { borderColor: C.gold }]}
      >
        <Feather name="gift" size={16} color={ready ? C.gold : C.dim} />
      </Pulse>
      <View style={{ flexShrink: 1 }}>
        <Text style={s.giftTitle} numberOfLines={1}>
          {ready ? `Free gift · ${today.gift.coins}` : "Free gift"}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            s.giftSub,
            !!paid && { color: C.teal },
            !!error && { color: "#ffb6b6" },
          ]}
        >
          {error
            ? error
            : paid
              ? `+${plural(paid, "coin", "coins")}`
              : ready
                ? "Tap to collect"
                : `Next in ${left(readyAt - now)}`}
        </Text>
      </View>
    </Press>
  );
}

const face = (seg: WheelSegment, i: number) =>
  seg.jackpot
    ? "#f2c14e"
    : seg.crate
      ? "#0f5547"
      : seg.rubies
        ? "#5e1a28"
        : i % 4 === 0
          ? "#0d2c45"
          : "#13405f";
const ink = (seg: WheelSegment) =>
  seg.jackpot ? C.ink : seg.crate ? C.teal : seg.rubies ? "#ffd7db" : C.gold;
const glyph = (seg: WheelSegment): Icon =>
  seg.jackpot
    ? "star"
    : seg.crate
      ? "package"
      : seg.rubies
        ? "hexagon"
        : "circle";
const faceText = (seg: WheelSegment) =>
  seg.crate
    ? seg.crate.name.replace(/ crate$/i, "")
    : seg.rubies
      ? `${seg.rubies}`
      : seg.coins.toLocaleString();

/**
 * The wheel, drawn with plain views: each segment is a border-trick triangle with its apex at
 * the centre, rotated into place inside a round mask that trims the corners into an arc.
 */
function Wheel({
  size,
  segments,
  turn,
  glow,
  canSpin,
  onSpin,
}: {
  size: number;
  segments: WheelSegment[];
  turn: Animated.Value;
  glow: Animated.Value;
  canSpin: boolean;
  onSpin: () => void;
}) {
  const r = size / 2,
    seg = 360 / segments.length,
    // Half the base of a triangle as tall as the radius whose apex angle is one segment.
    half = r * Math.tan(((seg / 2) * Math.PI) / 180),
    rim = Math.max(8, Math.round(size * 0.045)),
    ring = size + rim * 2,
    hub = Math.round(size * 0.22),
    font = Math.max(11, Math.round(size * 0.058)),
    bulb = Math.max(4, Math.round(rim * 0.45));
  const rotate = turn.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
  });
  return (
    <View style={{ width: ring, height: ring + 12 }}>
      <View
        style={[
          s.wheelShadow,
          { marginTop: 12, width: ring, height: ring, borderRadius: ring / 2 },
        ]}
      >
        <View
          style={{
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <LinearGradient
            pointerEvents="none"
            colors={["#ffe3a8", "#c8913f", "#7a5420"]}
            style={StyleSheet.absoluteFill}
          />
          {Array.from({ length: 16 }, (_, k) => (
            <View
              key={k}
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { transform: [{ rotate: `${k * 22.5}deg` }] },
              ]}
            >
              <Animated.View
                style={{
                  position: "absolute",
                  top: (rim - bulb) / 2,
                  left: ring / 2 - bulb / 2,
                  width: bulb,
                  height: bulb,
                  borderRadius: bulb / 2,
                  backgroundColor: "#fff6d8",
                  opacity: glow.interpolate({
                    inputRange: [0, 1],
                    outputRange: k % 2 ? [0.35, 1] : [1, 0.35],
                  }),
                }}
              />
            </View>
          ))}
          <Animated.View
            style={{
              width: size,
              height: size,
              borderRadius: r,
              overflow: "hidden",
              backgroundColor: "#061523",
              transform: [{ rotate }],
            }}
          >
            {segments.map((sg, i) => (
              <View
                key={i}
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  { transform: [{ rotate: `${i * seg}deg` }] },
                ]}
              >
                <View
                  style={{
                    position: "absolute",
                    left: r - half,
                    top: 0,
                    width: 0,
                    height: 0,
                    borderLeftWidth: half,
                    borderRightWidth: half,
                    borderTopWidth: r,
                    borderLeftColor: "transparent",
                    borderRightColor: "transparent",
                    borderTopColor: face(sg, i),
                  }}
                />
                <View
                  style={{
                    position: "absolute",
                    top: size * 0.07,
                    left: r - size * 0.16,
                    width: size * 0.32,
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Feather name={glyph(sg)} size={font + 2} color={ink(sg)} />
                  <Text
                    numberOfLines={1}
                    style={{
                      color: ink(sg),
                      fontSize: font,
                      fontWeight: "900",
                    }}
                  >
                    {faceText(sg)}
                  </Text>
                </View>
              </View>
            ))}
            {segments.map((_, i) => (
              <View
                key={`edge-${i}`}
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  { transform: [{ rotate: `${i * seg + seg / 2}deg` }] },
                ]}
              >
                <View
                  style={{
                    position: "absolute",
                    left: r - 0.75,
                    top: 0,
                    width: 1.5,
                    height: r,
                    backgroundColor: "#ffe3a840",
                  }}
                />
              </View>
            ))}
          </Animated.View>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Spin the wheel"
            accessibilityState={{ disabled: !canSpin }}
            disabled={!canSpin}
            onPress={onSpin}
            outer={{
              position: "absolute",
              left: (ring - hub) / 2,
              top: (ring - hub) / 2,
            }}
            style={[
              s.wheelHub,
              { width: hub, height: hub, borderRadius: hub / 2 },
            ]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={["#ffe9b5", "#eac183", "#a8742f"]}
              style={StyleSheet.absoluteFill}
            />
            <Text style={[s.hubText, { fontSize: Math.max(10, hub * 0.2) }]}>
              SPIN
            </Text>
          </Press>
        </View>
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: ring / 2 - 14,
          width: 28,
          alignItems: "center",
        }}
      >
        <View style={s.pin} />
        <View style={s.pointer} />
      </View>
    </View>
  );
}

/**
 * The daily wheel. The server rolls the prize first; the wheel then turns several times and
 * lands inside the segment it chose, and only then does the new balance show.
 */
export function SpinWheel(props: DailyProps) {
  const { today, busy, error, setError, run, apply, reload } = useBoard(props);
  const win = useWindowDimensions();
  const size = Math.round(
    Math.max(170, Math.min(270, Math.min(win.width, win.height) - 172)),
  );
  const now = useNow(30000);
  const turn = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const angle = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<SpinResult | null>(null);
  const seg = 360 / (today?.spin.segments.length || 8);

  // A tick each time a segment edge passes the pointer. Throttled, so the fast opening turns
  // read as a buzz rather than a queue of haptics.
  useEffect(() => {
    let notch: number | null = null,
      at = 0;
    const id = turn.addListener(({ value }) => {
      const n = Math.floor((value + seg / 2) / seg);
      if (notch === null) notch = n;
      if (n === notch) return;
      notch = n;
      const t = Date.now();
      if (t - at > 55) {
        at = t;
        tap();
      }
    });
    return () => turn.removeListener(id);
  }, [turn, seg]);

  // The rim lights chase while the wheel turns.
  useEffect(() => {
    if (!spinning) {
      glow.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [spinning, glow]);

  if (!today) return <Loading error={error} />;
  const { free, tokens, adSpinsLeft, ads, segments } = today.spin;
  const spins = free + tokens;
  const canSpin = spins > 0 && !spinning && !busy;

  function spin() {
    if (!canSpin) return;
    setWon(null);
    setError("");
    setSpinning(true);
    api<SpinResult>("/me/spin", "POST", {}).then(
      (r) => {
        // Several whole turns, then into the server's segment: off-centre, never on an edge.
        const rest = angle.current % 360;
        const target =
          angle.current -
          rest +
          360 * 6 +
          ((360 - r.index * seg) % 360) +
          (Math.random() - 0.5) * seg * 0.6;
        angle.current = target;
        Animated.timing(turn, {
          toValue: target,
          duration: 4200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          // Paid on the server already; the balance moves when the wheel stops, not before.
          apply(r);
          setWon(r);
          setSpinning(false);
          celebrate();
        });
      },
      (e) => {
        setSpinning(false);
        warn();
        setError((e as Error).message);
        reload().catch(() => {});
      },
    );
  }
  const watch = () =>
    run(async () => {
      setWon(null);
      const outcome = await showRewardedVideo({ purpose: "spin" });
      if (outcome === "unavailable")
        throw new Error("No video is available right now. Try again shortly.");
      if (outcome === "dismissed") return;
      // The spin is granted by the ad network's signed callback, so give it a moment to land.
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        if ((await reload()).spin.tokens > tokens) return;
      }
    });

  return (
    <View style={s.split}>
      <Enter>
        <Wheel
          size={size}
          segments={segments}
          turn={turn}
          glow={glow}
          canSpin={canSpin}
          onSpin={spin}
        />
      </Enter>
      <Enter index={1} style={[s.card, s.grow, { justifyContent: "center" }]}>
        <Text style={s.eyebrow}>DAILY SPIN</Text>
        <Text style={s.heading}>
          {spinning
            ? "Round it goes…"
            : free
              ? "Your free spin is ready"
              : tokens
                ? `${tokens} earned spin${tokens === 1 ? "" : "s"} ready`
                : "No spins left today"}
        </Text>
        <Text style={s.copy}>
          One free spin every day
          {ads ? ", and a short video earns another" : ""}. A fresh free spin in{" "}
          {left(Date.parse(today.resetsAt) - now)}.
        </Text>
        <View style={s.actions}>
          <Pulse active={canSpin}>
            <Button
              primary
              icon="refresh-cw"
              label={
                spinning ? "Spinning…" : spins > 1 ? `Spin · ${spins}` : "Spin"
              }
              disabled={!canSpin}
              onPress={spin}
            />
          </Pulse>
          {ads && (
            <Button
              icon="play-circle"
              label={
                busy
                  ? "Loading video…"
                  : adSpinsLeft
                    ? `Watch a video for another spin · ${adSpinsLeft} left`
                    : "Today's video spins are used"
              }
              disabled={busy || spinning || !adSpinsLeft}
              onPress={watch}
            />
          )}
        </View>
        {won && !spinning && (
          <Enter
            style={[s.result, won.prize.jackpot && { borderColor: C.gold }]}
          >
            <View
              style={[
                s.chip,
                {
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: `${ink(won.prize)}22`,
                  borderColor: `${ink(won.prize)}66`,
                },
              ]}
            >
              <Feather
                name={glyph(won.prize)}
                size={20}
                color={won.prize.jackpot ? C.gold : ink(won.prize)}
              />
            </View>
            <View style={s.grow}>
              <Text style={s.resultTitle}>
                {won.prize.jackpot ? "Jackpot! " : "You won "}
                {won.prize.label.replace(/ jackpot$/i, "")}
              </Text>
              <Text style={s.small}>{grantedText(won.granted)}</Text>
            </View>
          </Enter>
        )}
        <FullSlots today={today} rewards={segments} />
        <Message error={error} />
      </Enter>
    </View>
  );
}

const MISSION_ICON: Record<string, Icon> = {
  play3: "play",
  win1: "award",
  win3: "award",
  daily: "sun",
  drills2: "crosshair",
  crate1: "package",
  spin1: "disc",
  online1: "globe",
};

function MissionRow({
  mission: m,
  index,
  busy,
  onClaim,
}: {
  mission: DailyMission;
  index: number;
  busy: boolean;
  onClaim: () => void;
}) {
  const complete = m.progress >= m.goal;
  const color = m.claimed ? C.teal : complete ? C.gold : "#cfe0ee";
  return (
    <Enter
      index={index}
      style={[
        s.mission,
        complete && !m.claimed && { borderColor: `${C.gold}88` },
      ]}
    >
      <View
        style={[
          s.chip,
          {
            width: 34,
            height: 34,
            borderRadius: 11,
            backgroundColor: `${color}1c`,
            borderColor: `${color}55`,
          },
        ]}
      >
        <Feather
          name={MISSION_ICON[m.id] || "target"}
          size={16}
          color={color}
        />
      </View>
      <View style={[s.grow, { gap: 6 }]}>
        <View style={s.missionText}>
          <Text style={s.missionLabel} numberOfLines={1}>
            {m.label}
          </Text>
          <Text style={s.small} numberOfLines={1}>
            {rewardText(m.reward)} · +{m.passXp} pass XP
          </Text>
        </View>
        <Bar value={m.progress / m.goal} color={m.claimed ? C.teal : C.gold} />
      </View>
      <View style={s.missionEnd}>
        {m.claimed ? (
          <Feather name="check-circle" size={20} color={C.teal} />
        ) : complete ? (
          <Pulse active={!busy}>
            <Button
              primary
              compact
              icon="gift"
              label="Claim"
              disabled={busy}
              onPress={onClaim}
            />
          </Pulse>
        ) : (
          <Text style={s.count}>
            {m.progress}/{m.goal}
          </Text>
        )}
      </View>
    </Enter>
  );
}

/** Three missions a day, each claimed when done; all three unlock the bonus chest. */
export function Missions(props: DailyProps) {
  const { today, busy, error, run, apply } = useBoard(props);
  const [note, setNote] = useState("");
  const now = useNow(30000);
  if (!today) return <Loading error={error} />;
  const { list, bonus } = today.missions;
  const done = list.filter((m) => m.claimed).length;
  const claim = (path: string, label: string) =>
    run(async () => {
      const r = await api<DailyClaim>(path, "POST", {});
      apply(r);
      celebrate();
      setNote(`${label}: ${grantedText(r.granted)}`);
    });
  return (
    <View style={s.split}>
      <View style={[s.card, s.grow, { gap: 8 }]}>
        <View style={s.headRow}>
          <View style={s.grow}>
            <Text style={s.eyebrow}>DAILY MISSIONS</Text>
            <Text style={s.heading}>
              {done === list.length
                ? "All done for today"
                : `${done} of ${list.length} collected`}
            </Text>
          </View>
          <Text style={s.small}>
            New missions in {left(Date.parse(today.resetsAt) - now)}
          </Text>
        </View>
        {list.map((m, i) => (
          <MissionRow
            key={m.id}
            index={i}
            mission={m}
            busy={busy}
            onClaim={() => claim(`/me/missions/${m.id}/claim`, m.label)}
          />
        ))}
        <FullSlots
          today={today}
          rewards={[...list.map((m) => m.reward), bonus.reward]}
        />
        <Message error={error} note={note} />
      </View>
      <Enter index={3} style={[s.card, s.bonus]}>
        <Pulse active={bonus.ready && !bonus.claimed && !busy}>
          <View
            style={[
              s.chest,
              bonus.ready &&
                !bonus.claimed && {
                  borderColor: C.gold,
                  backgroundColor: `${C.gold}1f`,
                },
            ]}
          >
            <Feather
              name={bonus.claimed ? "check" : "gift"}
              size={30}
              color={bonus.claimed ? C.teal : bonus.ready ? C.gold : C.dim}
            />
          </View>
        </Pulse>
        <Text style={s.eyebrow}>DAILY BONUS</Text>
        <Text style={s.prize}>{rewardText(bonus.reward)}</Text>
        <Text style={s.small}>+{bonus.passXp} pass XP</Text>
        <View style={s.dots}>
          {list.map((m) => (
            <View key={m.id} style={[s.dot, m.claimed && s.dotOn]} />
          ))}
        </View>
        {bonus.claimed ? (
          <Text style={[s.small, { color: C.teal }]}>Collected</Text>
        ) : (
          <Button
            primary={bonus.ready}
            icon="gift"
            label={bonus.ready ? "Claim bonus" : "Finish all three"}
            disabled={!bonus.ready || busy}
            onPress={() => claim("/me/missions/bonus", "Daily bonus")}
          />
        )}
      </Enter>
    </View>
  );
}

type CellState = "upcoming" | "ready" | "claimed" | "locked";
function PassCell({
  reward,
  height,
  state,
  premium,
  onPress,
}: {
  reward: DailyReward;
  height: number;
  state: CellState;
  premium: boolean;
  onPress?: () => void;
}) {
  const chip = height > 90 ? 30 : 22;
  const accent = premium ? C.purple : C.gold;
  return (
    <Pulse active={state === "ready"}>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`${premium ? "Premium" : "Free"}: ${rewardText(reward)}${reward.crate ? `, or ${reward.crate.fallbackCoins} coins if your crate slots are full` : ""}, ${state}`}
        disabled={!onPress}
        onPress={onPress}
        style={[
          s.cell,
          {
            height,
            borderColor:
              state === "ready" ? accent : premium ? `${C.purple}40` : C.line,
            backgroundColor: premium ? "#170f2bd9" : "#0a1f2edd",
          },
          (state === "upcoming" || state === "claimed") && { opacity: 0.55 },
        ]}
      >
        <Prize reward={reward} size={chip} short />
        {/* Pinned to the bottom edge, so a two-part reward never pushes it out of the cell. */}
        <View pointerEvents="none" style={s.cellStatus}>
          {state === "ready" ? (
            <View style={[s.claimTag, { backgroundColor: accent }]}>
              <Text style={s.claimTagText}>CLAIM</Text>
            </View>
          ) : state === "claimed" ? (
            <Feather name="check-circle" size={13} color={C.teal} />
          ) : state === "locked" ? (
            <Feather name="lock" size={12} color={C.purple} />
          ) : null}
        </View>
      </Press>
    </Pulse>
  );
}

/**
 * The season's thirty tiers as one horizontal track, free row over premium row. Premium cells
 * show a lock until the pass is owned; pressing one hands over to `onBuyPremium`.
 */
export function PassTrack({
  onBuyPremium,
  ...props
}: DailyProps & { onBuyPremium?: () => void }) {
  const { today, busy, error, run, apply } = useBoard(props);
  const [note, setNote] = useState("");
  const scroll = useRef<ScrollView>(null);
  const now = useNow(60000);
  const win = useWindowDimensions();
  const roomy = Math.min(win.width, win.height) >= 520;
  const cell = roomy ? 104 : 82,
    col = roomy ? 92 : 78,
    gap = 6;
  const tier = today?.pass.tier ?? 0;
  // Open on the player's tier, not on tier one.
  useEffect(() => {
    if (!today) return;
    const timer = setTimeout(
      () =>
        scroll.current?.scrollTo({
          x: Math.max(0, (tier - 2) * (col + gap)),
          animated: true,
        }),
      350,
    );
    return () => clearTimeout(timer);
  }, [!!today]);
  if (!today) return <Loading error={error} />;
  const p = today.pass;
  const last = p.rewards.length;
  const into = p.xp - p.tier * p.xpPerTier;
  const value = p.rewards.reduce(
    (t, row) => ({
      coins: t.coins + row.premium.coins,
      rubies: t.rubies + row.premium.rubies,
      crates: t.crates + (row.premium.crate ? 1 : 0),
    }),
    { coins: 0, rubies: 0, crates: 0 },
  );
  const claim = (n: number, lane: "free" | "premium") =>
    run(async () => {
      const r = await api<DailyClaim>("/me/pass/claim", "POST", {
        tier: n,
        track: lane,
      });
      apply(r);
      celebrate();
      setNote(`Tier ${n}: ${grantedText(r.granted)}`);
    });
  const state = (n: number, lane: "free" | "premium"): CellState =>
    p.claimed[lane].includes(n)
      ? "claimed"
      : lane === "premium" && !p.premium
        ? "locked"
        : n <= p.tier
          ? "ready"
          : "upcoming";
  return (
    <View style={[s.card, { gap: 8, padding: 12 }]}>
      <View style={s.headRow}>
        <View>
          <Text style={s.eyebrow}>CUEMASTER PASS · SEASON {p.season}</Text>
          <Text style={s.heading}>
            Tier <CountUp value={p.tier} style={s.heading} /> of {last}
          </Text>
        </View>
        <View style={[s.grow, { gap: 5, minWidth: 140 }]}>
          <Bar value={p.tier >= last ? 1 : into / p.xpPerTier} color={C.gold} />
          {/* The track has no spare height, so claim notes and errors share this status line. */}
          <Text
            style={error ? s.error : note ? s.note : s.small}
            numberOfLines={2}
          >
            {error ||
              note ||
              `${
                p.tier >= last
                  ? "Every tier reached"
                  : `${into} / ${p.xpPerTier} XP to tier ${p.tier + 1}`
              } · Season ends in ${left(Date.parse(p.endsAt) - now)}${
                today.slots.held >= today.slots.max
                  ? " · Your crate slots are full, so crate tiers pay coins instead"
                  : ""
              }`}
          </Text>
        </View>
        {p.premium ? (
          <View style={s.owned}>
            <Feather name="star" size={13} color={C.purple} />
            <Text style={[s.laneText, { color: C.purple }]}>PREMIUM</Text>
          </View>
        ) : (
          <Button
            primary
            icon="star"
            label="Unlock premium"
            disabled={!onBuyPremium}
            onPress={() => onBuyPremium?.()}
          />
        )}
      </View>
      <View style={s.row}>
        <View style={{ gap }}>
          <View style={{ height: 22 }} />
          <View style={[s.lane, { height: cell }]}>
            <Text style={s.laneText}>FREE</Text>
          </View>
          <View style={[s.lane, s.lanePremium, { height: cell }]}>
            <Feather
              name={p.premium ? "star" : "lock"}
              size={13}
              color={C.purple}
            />
            <Text style={[s.laneText, { color: C.purple }]}>PREMIUM</Text>
            {!p.premium && (
              <Text style={s.laneValue}>
                {value.rubies} rubies{"\n"}
                {value.coins.toLocaleString()} coins{"\n"}
                {value.crates} crates
              </Text>
            )}
          </View>
        </View>
        <ScrollView
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap, paddingRight: 4 }}
        >
          {p.rewards.map((row, i) => {
            const reached = row.tier <= p.tier,
              current = row.tier === p.tier;
            return (
              <Enter key={row.tier} index={i} style={{ width: col, gap }}>
                {current && <View pointerEvents="none" style={s.now} />}
                <View style={s.marker}>
                  <View
                    style={[
                      s.markerLine,
                      { left: -gap / 2, right: -gap / 2 },
                      reached && { backgroundColor: `${C.gold}aa` },
                    ]}
                  />
                  <View
                    style={[
                      s.tierPill,
                      reached && s.tierPillOn,
                      current && s.tierPillNow,
                    ]}
                  >
                    <Text style={[s.tierText, reached && { color: C.ink }]}>
                      {row.tier}
                    </Text>
                  </View>
                </View>
                {(["free", "premium"] as const).map((lane) => {
                  const st = state(row.tier, lane);
                  return (
                    <PassCell
                      key={lane}
                      reward={row[lane]}
                      height={cell}
                      premium={lane === "premium"}
                      state={st}
                      onPress={
                        st === "ready" && !busy
                          ? () => claim(row.tier, lane)
                          : st === "locked"
                            ? onBuyPremium
                            : undefined
                      }
                    />
                  );
                })}
              </Enter>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

export type DailyTab = "daily" | "spin" | "missions" | "pass";
const TABS: { id: DailyTab; label: string; icon: Icon }[] = [
  { id: "daily", label: "Daily", icon: "calendar" },
  { id: "spin", label: "Spin", icon: "disc" },
  { id: "missions", label: "Missions", icon: "check-square" },
  { id: "pass", label: "Pass", icon: "award" },
];

/** What is waiting to be collected, by area, so a lobby button can carry a badge. */
export function readyToCollect(t: Today, now = Date.now()) {
  return {
    daily: !t.streak.claimedToday,
    gift: !t.gift.readyAt || Date.parse(t.gift.readyAt) <= now,
    spin: t.spin.free + t.spin.tokens > 0,
    missions:
      t.missions.list.some((m) => !m.claimed && m.progress >= m.goal) ||
      (t.missions.bonus.ready && !t.missions.bonus.claimed),
    pass: t.pass.rewards.some(
      (r) =>
        r.tier <= t.pass.tier &&
        (!t.pass.claimed.free.includes(r.tier) ||
          (t.pass.premium && !t.pass.claimed.premium.includes(r.tier))),
    ),
  };
}

/**
 * Daily streak, wheel, missions and pass behind four tabs, with the free gift always in reach.
 * It fills its parent and draws no backdrop: place it as a club page, or inside a full-screen
 * `Modal` (with `supportedOrientations={["landscape"]}`) over the club art.
 */
export function DailyHub({
  player,
  onPlayer,
  onClose,
  onBuyPremium,
  initialTab = "daily",
}: {
  player: Player;
  onPlayer: (player: Player) => void;
  onClose: () => void;
  /** Opens billing for the premium pass; the server reads ownership, so just reopen after. */
  onBuyPremium?: () => void;
  initialTab?: DailyTab;
}) {
  const [tab, setTab] = useState<DailyTab>(initialTab);
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState("");
  const [width, setWidth] = useState(760);
  const narrow = width < 700;
  const load = () => {
    setError("");
    api<Today>("/me/today").then(setToday, (e) => setError(e.message));
  };
  useEffect(load, []);
  const shared = { today, onToday: setToday, onPlayer };
  const ready = today && readyToCollect(today);
  return (
    <View style={s.hub} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={s.hubHead}>
        <View style={s.tabs}>
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <Press
                key={t.id}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: on }}
                onPress={() => setTab(t.id)}
                style={[s.tab, on && s.tabOn]}
              >
                <Feather
                  name={t.icon}
                  size={15}
                  color={on ? "#e9c88f" : "#b5c4d0"}
                />
                {!narrow && (
                  <Text style={[s.tabText, on && { color: "#e9c88f" }]}>
                    {t.label}
                  </Text>
                )}
                {!!ready?.[t.id] && <View style={s.badge} />}
              </Press>
            );
          })}
        </View>
        <View style={s.grow} />
        {today && <FreeGift {...shared} />}
        {!narrow && (
          <View style={s.balance}>
            <Feather name="circle" size={12} color={C.gold} />
            <CountUp value={player.coins} style={s.balanceText} />
            <Feather name="hexagon" size={12} color={C.ruby} />
            <CountUp value={player.rubies || 0} style={s.balanceText} />
          </View>
        )}
        <IconButton icon="x" label="Close daily rewards" onPress={onClose} />
      </View>
      {today ? (
        <ScrollView
          contentContainerStyle={s.hubBody}
          showsVerticalScrollIndicator={false}
        >
          <PageFade token={tab}>
            {tab === "daily" ? (
              <StreakCalendar {...shared} />
            ) : tab === "spin" ? (
              <SpinWheel {...shared} />
            ) : tab === "missions" ? (
              <Missions {...shared} />
            ) : (
              <PassTrack {...shared} onBuyPremium={onBuyPremium} />
            )}
          </PageFade>
        </ScrollView>
      ) : error ? (
        <View style={{ alignItems: "center", gap: 12, padding: 24 }}>
          <Message error={error} />
          <Button primary icon="refresh-cw" label="Try again" onPress={load} />
        </View>
      ) : (
        <Loading />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  hub: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  hubHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  hubBody: { paddingBottom: 12 },
  tabs: { flexDirection: "row", gap: 6 },
  tab: {
    minHeight: 38,
    minWidth: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabOn: { backgroundColor: "#d4b47a24", borderColor: "#d4b47a55" },
  tabText: { color: "#b5c4d0", fontSize: 13, fontWeight: "800" },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.gold,
    borderWidth: 1,
    borderColor: "#06131f",
  },
  balance: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#04121dcc",
  },
  balanceText: { color: C.text, fontSize: 13, fontWeight: "800" },
  card: {
    backgroundColor: "#04121def",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  grow: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", gap: 8 },
  split: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  eyebrow: {
    color: "#f3c576",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  heading: { color: C.text, fontSize: 17, fontWeight: "800" },
  copy: { color: C.muted, fontSize: 12, lineHeight: 18 },
  small: { color: "#90aabd", fontSize: 11 },
  note: { color: C.teal, fontSize: 12, fontWeight: "700" },
  error: { color: "#ffb6b6", fontSize: 12 },
  chip: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
  prize: {
    color: C.text,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  prizeMore: { fontSize: 10, fontWeight: "800", textAlign: "center" },
  button: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
  },
  buttonCompact: { minHeight: 30, paddingHorizontal: 9, gap: 5 },
  primary: { backgroundColor: "#eac183", borderColor: "#ffd9a5" },
  ghost: { backgroundColor: "#0a1f2edd", borderColor: "#ffffff24" },
  buttonText: { color: "#e6f0f7", fontWeight: "800", fontSize: 12 },
  track: { backgroundColor: "#ffffff14", overflow: "hidden" },
  week: { flexDirection: "row", gap: 8 },
  day: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#0a1f2edd",
    overflow: "hidden",
  },
  dayBig: { borderColor: `${C.gold}55` },
  dayDone: { borderColor: `${C.teal}55`, opacity: 0.75 },
  dayReady: { borderColor: C.gold },
  dayLabel: {
    color: C.dim,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  dayNext: { color: C.gold, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  gift: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
    maxWidth: 210,
    paddingLeft: 4,
    paddingRight: 12,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#04121dcc",
  },
  giftReady: { borderColor: `${C.gold}88`, backgroundColor: "#2a200acc" },
  giftIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#081b2a",
  },
  giftTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  giftSub: { color: "#90aabd", fontSize: 10, fontWeight: "700" },
  wheelShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  wheelHub: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff1cc",
  },
  hubText: { color: C.ink, fontWeight: "900", letterSpacing: 1 },
  pin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff1cc",
    borderWidth: 2,
    borderColor: C.gold,
  },
  pointer: {
    marginTop: -3,
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderTopWidth: 22,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: C.gold,
  },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#0a1f2edd",
  },
  resultTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
  mission: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#0a1f2edd",
  },
  missionText: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  missionLabel: {
    color: C.text,
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1,
  },
  missionEnd: { minWidth: 76, alignItems: "flex-end" },
  count: { color: C.muted, fontSize: 13, fontWeight: "800" },
  bonus: { width: 196, alignItems: "center", justifyContent: "center", gap: 6 },
  chest: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#0a1f2edd",
    alignItems: "center",
    justifyContent: "center",
  },
  dots: { flexDirection: "row", gap: 6, marginVertical: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ffffff26" },
  dotOn: { backgroundColor: C.teal },
  owned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: `${C.purple}66`,
    backgroundColor: "#170f2bd9",
  },
  lane: {
    width: 74,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#0a1f2e99",
  },
  lanePremium: { borderColor: `${C.purple}40`, backgroundColor: "#170f2b99" },
  laneText: {
    color: C.gold,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  laneValue: {
    color: "#d9c8ff",
    fontSize: 9,
    lineHeight: 12,
    textAlign: "center",
  },
  marker: { height: 22, alignItems: "center", justifyContent: "center" },
  markerLine: {
    position: "absolute",
    top: 10,
    height: 2,
    backgroundColor: "#ffffff1f",
  },
  tierPill: {
    minWidth: 26,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff30",
    backgroundColor: "#081b2a",
  },
  tierPillOn: { backgroundColor: C.gold, borderColor: "#ffe3a8" },
  tierPillNow: { borderColor: "#ffffff", borderWidth: 2 },
  tierText: { color: C.muted, fontSize: 10, fontWeight: "900" },
  now: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -3,
    right: -3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${C.gold}99`,
    backgroundColor: `${C.gold}0d`,
  },
  cell: {
    alignItems: "center",
    paddingTop: 7,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  cellStatus: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 5,
    alignItems: "center",
  },
  claimTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  claimTagText: {
    color: C.ink,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
