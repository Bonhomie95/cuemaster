import React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { Player } from "./api";
import { icons } from "./art";
import { Press, Enter } from "./motion";

type Icon = React.ComponentProps<typeof Feather>["name"];
export type MoreTarget =
  | "profile"
  | "leaderboard"
  | "invite"
  | "events"
  | "practice"
  | "tables"
  | "cues"
  | "rewards"
  | "settings"
  | "help";

/**
 * Everything that is not about playing right now lives here, one tap from every screen, so the
 * home can stay three columns of things to do today.
 */
export default function MorePage({
  player,
  onOpen,
}: {
  player: Player;
  onOpen: (target: MoreTarget) => void;
}) {
  const tiles: {
    id: MoreTarget;
    title: string;
    detail: string;
    icon?: Icon;
    art?: any;
    accent: string;
  }[] = [
    {
      id: "profile",
      title: "Profile",
      detail: `Level ${player.level} · your stats and look`,
      icon: "user",
      accent: "#24dbb3",
    },
    {
      id: "leaderboard",
      title: "Leaderboard",
      detail: `${player.trophies || 0} trophies · see who's on top`,
      icon: "bar-chart-2",
      accent: "#ffd05b",
    },
    {
      id: "invite",
      title: "Invite friends",
      detail: "You both get coins and rubies",
      icon: "user-plus",
      accent: "#4aa8ff",
    },
    {
      id: "events",
      title: "Tournaments",
      detail: "Events and prizes",
      icon: "award",
      accent: "#ff8a5c",
    },
    {
      id: "practice",
      title: "Practice",
      detail: "Drills, trick shots, Daily Shot",
      icon: "target",
      accent: "#b98cff",
    },
    {
      id: "rewards",
      title: "Crates",
      detail: player.crates
        ? `${player.crates} waiting to open`
        : "Win matches to fill your slots",
      art: icons.crate.gold,
      accent: "#ffb82e",
    },
    {
      id: "tables",
      title: "Tables",
      detail: "Six cities to unlock",
      icon: "grid",
      accent: "#3fd0d8",
    },
    {
      id: "cues",
      title: "Cues",
      detail: "More time on the clock, longer aim",
      icon: "edit-2",
      accent: "#ff5f6d",
    },
    {
      id: "help",
      title: "How to play",
      detail: "Controls, rules, rewards",
      icon: "help-circle",
      accent: "#9fc0d6",
    },
    {
      id: "settings",
      title: "Settings",
      detail: "Sound, account, support",
      icon: "settings",
      accent: "#9fc0d6",
    },
  ];
  return (
    <ScrollView contentContainerStyle={s.grid}>
      {tiles.map((t, i) => (
        <Enter key={t.id} index={i} style={s.cell}>
          <Press
            accessibilityRole="button"
            accessibilityLabel={t.title}
            onPress={() => onOpen(t.id)}
            style={s.tile}
          >
            <LinearGradient
              pointerEvents="none"
              colors={[`${t.accent}2e`, "#00000000"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[s.icon, { backgroundColor: `${t.accent}22` }]}>
              {t.art ? (
                <Image source={t.art} style={{ width: 34, height: 34 }} />
              ) : (
                <Feather name={t.icon!} size={19} color={t.accent} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{t.title}</Text>
              <Text style={s.detail} numberOfLines={1}>
                {t.detail}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color="#7f9bb0" />
          </Press>
        </Enter>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 16,
    maxWidth: 1100,
    alignSelf: "center",
  },
  cell: { flexGrow: 1, flexBasis: 240 },
  tile: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ffffff1f",
    backgroundColor: "#04121def",
    overflow: "hidden",
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#fffdf3", fontSize: 15, fontWeight: "800" },
  detail: { color: "#a9c4d6", fontSize: 11, marginTop: 2 },
});
