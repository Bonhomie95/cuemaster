import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { portraits } from "./art";
import { flag } from "./api";
import { Press, Enter, CountUp, Pulse } from "./motion";
import { celebrate } from "./feedback";

/**
 * The moments around a match: the VS card before the break, the result after the last ball,
 * and the small social signals in between (quick chat, an opponent who dropped). Kept out of
 * TableGame so the table screen stays about the table.
 */
export type Seat = {
  name: string;
  avatar: number;
  country?: string;
  caption: string;
};
const TIER_COLOR: Record<string, string> = {
  practice: "#7f96a8",
  club: "#24dbb3",
  silver: "#9fb6c7",
  gold: "#ffb82e",
  champion: "#b98cff",
  master: "#ff5f6d",
};

/** Two player cards slide in from the edges and meet at a VS mark. */
export function VsIntro({
  until,
  me,
  them,
  title,
  stake,
}: {
  until: number;
  me: Seat;
  them: Seat;
  title: string;
  stake: string;
}) {
  const [visible, setVisible] = useState(Date.now() < until);
  const enter = useRef(new Animated.Value(0)).current;
  const leave = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    Animated.spring(enter, {
      toValue: 1,
      useNativeDriver: true,
      speed: 11,
      bounciness: 7,
    }).start();
    const exit = setTimeout(
      () =>
        Animated.timing(leave, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }).start(() => setVisible(false)),
      Math.max(0, until - Date.now() - 320),
    );
    return () => clearTimeout(exit);
  }, [until]);
  if (!visible) return null;
  const slide = (from: number) => ({
    transform: [
      {
        translateX: enter.interpolate({
          inputRange: [0, 1],
          outputRange: [from, 0],
        }),
      },
    ],
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, s.vsRoot, { opacity: leave }]}
    >
      <LinearGradient
        colors={["#04101ae6", "#081e30f2", "#04101ae6"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={s.vsEyebrow}>{title}</Text>
      <View style={s.vsRow}>
        <Animated.View style={[s.vsCard, slide(-260)]}>
          <SeatCard seat={me} accent="#24dbb3" />
        </Animated.View>
        <Animated.View
          style={{
            opacity: enter,
            transform: [
              {
                scale: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [2.4, 1],
                }),
              },
            ],
          }}
        >
          <Text style={s.vs}>VS</Text>
        </Animated.View>
        <Animated.View style={[s.vsCard, slide(260)]}>
          <SeatCard seat={them} accent="#ff8a5c" />
        </Animated.View>
      </View>
      <Text style={s.vsStake}>{stake}</Text>
    </Animated.View>
  );
}
function SeatCard({ seat, accent }: { seat: Seat; accent: string }) {
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <View style={[s.vsAvatar, { borderColor: accent, shadowColor: accent }]}>
        <Image
          source={portraits[seat.avatar % portraits.length]}
          style={{ width: 76, height: 76, borderRadius: 38 }}
        />
      </View>
      <Text style={s.vsName} numberOfLines={1}>
        {seat.name} {seat.country !== undefined ? flag(seat.country) : ""}
      </Text>
      <Text style={s.vsCaption}>{seat.caption}</Text>
    </View>
  );
}

/** Thirty flecks of colour that fall once. Native-driven, so it costs the JS thread nothing. */
export function Confetti({ play }: { play: boolean }) {
  const pieces = useRef(
    Array.from({ length: 30 }, (_, i) => ({
      x: Math.random(),
      delay: Math.random() * 400,
      spin: (Math.random() - 0.5) * 900,
      drift: (Math.random() - 0.5) * 120,
      color: ["#ffd05b", "#24dbb3", "#ff5f6d", "#4aa8ff", "#b98cff"][i % 5],
      fall: new Animated.Value(0),
    })),
  ).current;
  useEffect(() => {
    if (!play) return;
    const animations = pieces.map((p) =>
      Animated.timing(p.fall, {
        toValue: 1,
        duration: 1800 + Math.random() * 900,
        delay: p.delay,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    );
    Animated.parallel(animations).start();
    return () => animations.forEach((a) => a.stop());
  }, [play]);
  if (!play) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            top: -20,
            left: `${p.x * 100}%`,
            width: 8,
            height: 12,
            borderRadius: 2,
            backgroundColor: p.color,
            transform: [
              {
                translateY: p.fall.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 520],
                }),
              },
              {
                translateX: p.fall.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, p.drift],
                }),
              },
              {
                rotate: p.fall.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", `${p.spin}deg`],
                }),
              },
            ],
            opacity: p.fall.interpolate({
              inputRange: [0, 0.8, 1],
              outputRange: [1, 1, 0],
            }),
          }}
        />
      ))}
    </View>
  );
}

export type ResultView = {
  won: boolean;
  draw?: boolean;
  title: string;
  note?: string;
  pot: number;
  xp: number;
  trophies?: number;
  refunded?: number;
  crate: { name: string; tier: string } | null;
};
/**
 * The end of a rack: what was won, in the order it matters (coins, crate, progress), and the
 * one obvious next step. A win gets confetti and a success haptic; a loss gets a quiet card.
 */
export function ResultCard({
  result,
  primary,
  primaryLabel,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  status,
}: {
  result: ResultView;
  primary?: () => void;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  secondaryLabel: string;
  onSecondary: () => void;
  status?: string;
}) {
  useEffect(() => {
    if (result.won) celebrate();
  }, [result.won]);
  const accent = result.won ? "#ffd05b" : result.draw ? "#9fc0d6" : "#7f96a8";
  return (
    <View style={s.resultRoot} accessibilityLiveRegion="polite">
      <Confetti play={result.won} />
      <Enter style={s.resultCard}>
        <LinearGradient
          pointerEvents="none"
          colors={[result.won ? "#ffd05b30" : "#ffffff10", "#00000000"]}
          style={StyleSheet.absoluteFill}
        />
        <Text style={[s.resultKicker, { color: accent }]}>
          {result.won ? "VICTORY" : result.draw ? "NO RESULT" : "DEFEAT"}
        </Text>
        <Text style={s.resultTitle}>{result.title}</Text>
        {!!result.note && <Text style={s.resultNote}>{result.note}</Text>}
        <View style={s.rewardRow}>
          {result.pot > 0 && (
            <Reward
              icon={<Text style={s.coin}>◉</Text>}
              value={<CountUp value={result.pot} style={s.rewardValue} />}
              label="COINS"
            />
          )}
          {!!result.refunded && (
            <Reward
              icon={<Feather name="rotate-ccw" size={18} color="#9fc0d6" />}
              value={<Text style={s.rewardValue}>{result.refunded}</Text>}
              label="REFUNDED"
            />
          )}
          {!!result.crate && (
            <Reward
              icon={
                <Pulse>
                  <Feather
                    name="package"
                    size={20}
                    color={TIER_COLOR[result.crate.tier] || "#ffd05b"}
                  />
                </Pulse>
              }
              value={
                <Text style={[s.rewardValue, { fontSize: 14 }]}>
                  {result.crate.name}
                </Text>
              }
              label="SEALED"
            />
          )}
          {result.xp > 0 && (
            <Reward
              icon={<Feather name="trending-up" size={18} color="#4aa8ff" />}
              value={<Text style={s.rewardValue}>+{result.xp}</Text>}
              label="XP"
            />
          )}
          {!!result.trophies && (
            <Reward
              icon={<Feather name="award" size={18} color="#b98cff" />}
              value={
                <Text style={s.rewardValue}>
                  {result.trophies > 0 ? "+" : ""}
                  {result.trophies}
                </Text>
              }
              label="TROPHIES"
            />
          )}
        </View>
        {!!status && <Text style={s.resultStatus}>{status}</Text>}
        <View style={s.resultActions}>
          {primary && (
            <Press
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
              disabled={primaryDisabled}
              onPress={primary}
              style={[s.primary, primaryDisabled && { opacity: 0.5 }]}
            >
              <Feather name="repeat" size={15} color="#10233a" />
              <Text style={s.primaryText}>{primaryLabel}</Text>
            </Press>
          )}
          <Press
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
            onPress={onSecondary}
            style={s.secondary}
          >
            <Text style={s.secondaryText}>{secondaryLabel}</Text>
          </Press>
        </View>
      </Enter>
    </View>
  );
}
function Reward({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <View style={s.reward}>
      <View style={s.rewardIcon}>{icon}</View>
      {value}
      <Text style={s.rewardLabel}>{label}</Text>
    </View>
  );
}

/** Six canned lines: friendly by construction, so there is nothing to moderate. */
export function EmoteBar({
  emotes,
  onPick,
}: {
  emotes: string[];
  onPick: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: "center" }}>
      {open && (
        <Enter style={s.emoteMenu}>
          {emotes.map((e, i) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`Say ${e}`}
              onPress={() => {
                onPick(i);
                setOpen(false);
              }}
              style={({ pressed }) => [s.emote, pressed && { opacity: 0.7 }]}
            >
              <Text style={s.emoteText}>{e}</Text>
            </Pressable>
          ))}
        </Enter>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick chat"
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [s.chatButton, pressed && { opacity: 0.75 }]}
      >
        <Feather name="message-circle" size={19} color="#f2eedf" />
      </Pressable>
    </View>
  );
}
/** A speech bubble that pops in under a player card and fades after a few seconds. */
export function EmoteBubble({
  text,
  at,
  side,
}: {
  text: string;
  at: number;
  side: "left" | "right";
}) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    const a = Animated.sequence([
      Animated.spring(fade, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 10,
      }),
      Animated.delay(2400),
      Animated.timing(fade, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);
    a.start();
    return () => a.stop();
  }, [at]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.bubble,
        side === "left" ? { left: 64 } : { right: 64 },
        {
          opacity: fade,
          transform: [
            {
              scale: fade.interpolate({
                inputRange: [0, 1],
                outputRange: [0.6, 1],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={s.bubbleText}>{text}</Text>
    </Animated.View>
  );
}
/** The opponent dropped: a countdown to the forfeit, so the wait has an end. */
export function AwayBanner({ until, name }: { until: number; name: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <View style={s.away} accessibilityLiveRegion="polite">
      <Feather name="wifi-off" size={14} color="#ffb82e" />
      <Text style={s.awayText}>
        {name} lost connection · {left}s to return or forfeit
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  vsRoot: { alignItems: "center", justifyContent: "center", zIndex: 40 },
  vsEyebrow: {
    color: "#ffd05b",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
    marginBottom: 14,
  },
  vsRow: { flexDirection: "row", alignItems: "center", gap: 34 },
  vsCard: { width: 200, alignItems: "center" },
  vsAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  vsName: {
    color: "#fffdf3",
    fontSize: 18,
    fontWeight: "900",
    maxWidth: 200,
  },
  vsCaption: { color: "#a9c4d6", fontSize: 11, fontWeight: "700" },
  vs: {
    color: "#fffdf3",
    fontSize: 44,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: 2,
    textShadowColor: "#ffd05b",
    textShadowRadius: 18,
  },
  vsStake: {
    color: "#24dbb3",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 18,
    letterSpacing: 1,
  },
  resultRoot: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#02070dbb",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
  },
  resultCard: {
    width: 440,
    maxWidth: "88%",
    padding: 20,
    gap: 8,
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#061523f5",
    overflow: "hidden",
  },
  resultKicker: { fontSize: 13, fontWeight: "900", letterSpacing: 4 },
  resultTitle: { color: "#fffdf3", fontSize: 26, fontWeight: "900" },
  resultNote: {
    color: "#a9c4d6",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
  rewardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginVertical: 6,
  },
  reward: {
    minWidth: 84,
    alignItems: "center",
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ffffff1c",
    backgroundColor: "#0a1f2edd",
  },
  rewardIcon: { height: 24, justifyContent: "center" },
  rewardValue: { color: "#fffdf3", fontSize: 18, fontWeight: "900" },
  rewardLabel: {
    color: "#8fa8bb",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  coin: { color: "#ffd05b", fontSize: 18 },
  resultStatus: { color: "#24dbb3", fontSize: 12, fontWeight: "700" },
  resultActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  primary: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#eac183",
    borderWidth: 1,
    borderColor: "#ffd9a5",
  },
  primaryText: { color: "#10233a", fontSize: 13, fontWeight: "900" },
  secondary: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffffff30",
    backgroundColor: "#0a1f2edd",
  },
  secondaryText: { color: "#e6f0f7", fontSize: 13, fontWeight: "800" },
  emoteMenu: {
    position: "absolute",
    bottom: 50,
    right: 0,
    width: 150,
    gap: 6,
    padding: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ffffff22",
    backgroundColor: "#061523f2",
  },
  emote: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#0d2536",
  },
  emoteText: { color: "#eef5fb", fontSize: 12, fontWeight: "700" },
  chatButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#568296",
    backgroundColor: "#153b50",
  },
  bubble: {
    position: "absolute",
    top: 58,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#fffdf3",
    zIndex: 25,
  },
  bubbleText: { color: "#10233a", fontSize: 13, fontWeight: "800" },
  away: {
    position: "absolute",
    top: 64,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffb82e66",
    backgroundColor: "#2a1d06ee",
    zIndex: 22,
  },
  awayText: { color: "#ffe2a3", fontSize: 12, fontWeight: "700" },
});
