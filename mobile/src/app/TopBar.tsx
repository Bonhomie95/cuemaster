import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { Player } from "./api";
import { portraits, icons } from "./art";
import { Press, CountUp } from "./motion";

/**
 * The club's header pieces: who you are and how far to the next level on the left, what you
 * hold on the right. Each balance carries its own "+" because the top bar is where every
 * player looks when they are short.
 */
export function PlayerBadge({
  player,
  selected,
  onPress,
  compact = false,
}: {
  player: Player;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const progress = (player.xp % 100) / 100;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`Open profile. Level ${player.level}, ${player.xp % 100} of 100 XP to the next level.`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={s.badge}
    >
      <View>
        <Image
          source={portraits[player.avatar % portraits.length]}
          style={[s.avatar, selected && { borderColor: "#ffd05b" }]}
        />
        <View style={s.level}>
          <Text style={s.levelText}>{player.level}</Text>
        </View>
      </View>
      {!compact && (
        <View style={{ gap: 4 }}>
          <Text style={s.name} numberOfLines={1}>
            {player.name}
          </Text>
          <View style={s.track}>
            <LinearGradient
              colors={["#4aa8ff", "#24dbb3"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[s.fill, { width: `${Math.max(4, progress * 100)}%` }]}
            />
          </View>
        </View>
      )}
    </Press>
  );
}

export function CurrencyPill({
  kind,
  value,
  onPlus,
}: {
  kind: "coins" | "rubies";
  value: number;
  onPlus: () => void;
}) {
  const coins = kind === "coins";
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${value.toLocaleString()} ${kind}. Open the shop.`}
      onPress={onPlus}
      scale={0.95}
      style={s.pill}
    >
      <Image source={coins ? icons.coin : icons.ruby} style={s.icon} />
      <CountUp
        value={value}
        style={[s.value, { color: coins ? "#ffe9a8" : "#ffd7db" }]}
      />
      <View style={s.plus}>
        <Feather name="plus" size={12} color="#06231c" />
      </View>
    </Press>
  );
}

const s = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 9 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#ffffff40",
    backgroundColor: "#254338",
  },
  level: {
    position: "absolute",
    right: -5,
    bottom: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffd05b",
    borderWidth: 2,
    borderColor: "#081512",
  },
  levelText: { color: "#10233a", fontSize: 10, fontWeight: "900" },
  name: { color: "#fffdf3", fontSize: 13, fontWeight: "800", maxWidth: 110 },
  track: {
    width: 96,
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#ffffff1f",
  },
  fill: { height: 5, borderRadius: 3 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 34,
    paddingLeft: 4,
    paddingRight: 4,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#ffffff22",
    backgroundColor: "#04121dd9",
  },
  icon: { width: 28, height: 28 },
  value: {
    fontSize: 14,
    fontWeight: "900",
    minWidth: 34,
    fontVariant: ["tabular-nums"],
  },
  plus: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#24dbb3",
  },
});
