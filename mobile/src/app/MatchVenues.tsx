import React, { useState, useSyncExternalStore } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Player, Venue } from "./api";
import { venueArt } from "./art";
import { Press, Enter } from "./motion";
import { online } from "../game/online";
export type VenueMode = "online" | "friend" | "cpu" | "local";
const MODES: { id: VenueMode; label: string; a11y: string }[] = [
  { id: "online", label: "Online", a11y: "Play a player online" },
  { id: "friend", label: "Friend", a11y: "Play a friend with a room code" },
  { id: "cpu", label: "House rival", a11y: "Play a computer rival" },
  { id: "local", label: "Pass & play", a11y: "Pass and play on one device" },
];
export default function MatchVenues({
  venues,
  player,
  busy,
  onEnter,
  onJoin,
  onClose,
}: {
  venues: Venue[];
  player: Player;
  busy: boolean;
  onEnter: (v: Venue, mode: VenueMode) => void;
  onJoin: () => void;
  onClose: () => void;
}) {
  useSyncExternalStore(online.subscribe, online.snapshot);
  const [mode, setMode] = useState<VenueMode>("online");
  // Landscape-locked, but the window can still report portrait numbers on device, which left
  // the venue cards taller than the screen. Derive the short edge rather than trusting height.
  const win = useWindowDimensions();
  const shortEdge = Math.min(win.width, win.height);
  const compact = shortEdge < 520;
  return (
    <View style={s.root}>
      <View style={s.head}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[s.title, compact && { fontSize: 18 }]}>
            Choose your venue
          </Text>
          {!compact && (
            <Text style={s.copy}>
              {mode === "local"
                ? "Pass & play · two players"
                : mode === "cpu"
                  ? "A house player run by the game"
                  : mode === "friend"
                    ? "Open a private table and share the code"
                    : online.online > 1
                      ? `${online.online.toLocaleString()} players online`
                      : "Real players · winner takes the pot"}{" "}
              · {player.coins.toLocaleString()} coins
            </Text>
          )}
        </View>
        <View style={s.headTools}>
          {MODES.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={m.a11y}
              accessibilityState={{ selected: mode === m.id }}
              onPress={() => setMode(m.id)}
              style={[
                s.button,
                mode === m.id ? s.primary : s.quiet,
                { paddingVertical: 9, paddingHorizontal: 13, minHeight: 38 },
              ]}
            >
              <Text
                style={[s.buttonText, mode !== m.id && { color: "#cfe0ee" }]}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
          {mode === "friend" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Join a friend's table with a code"
              onPress={onJoin}
              style={[
                s.button,
                s.join,
                { paddingVertical: 9, paddingHorizontal: 13, minHeight: 38 },
              ]}
            >
              <Text style={[s.buttonText, { color: "#10233a" }]}>
                Join with code
              </Text>
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close venues"
          onPress={onClose}
          style={s.close}
        >
          <Text style={s.title}>×</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={s.rail}
      >
        {venues.map((v, i) => {
          const locked = player.level < v.level,
            poor = player.coins < v.entry;
          return (
            <Enter key={v.id} index={i} style={s.card}>
              <Image
                source={venueArt[v.id]}
                style={[s.art, { height: compact ? 74 : 120 }]}
                resizeMode="cover"
              />
              <Text style={s.name}>{v.name}</Text>
              <Text style={s.copy}>{v.subtitle}</Text>
              <Text style={s.fee}>
                ◉ {v.entry.toLocaleString()} entry
                {mode !== "local" && (
                  <Text style={s.win}>
                    {"  "}· win {(v.entry * 2).toLocaleString()}
                  </Text>
                )}
              </Text>
              <Press
                accessibilityRole="button"
                accessibilityLabel={`Enter ${v.name} for ${v.entry} coins`}
                disabled={busy || locked || poor}
                onPress={() => onEnter(v, mode)}
                style={[
                  s.button,
                  // Locked and unaffordable rooms are states, not offers: they stay dark.
                  locked || poor ? s.quiet : s.primary,
                  busy && { opacity: 0.5 },
                ]}
              >
                <Text
                  style={[
                    s.buttonText,
                    (locked || poor) && { color: "#9fb6c7" },
                  ]}
                >
                  {locked
                    ? `Level ${v.level} required`
                    : poor
                      ? "Not enough coins"
                      : busy
                        ? "Starting…"
                        : mode === "online"
                          ? "Find opponent"
                          : mode === "friend"
                            ? "Invite a friend"
                            : mode === "cpu"
                              ? "Play a rival"
                              : "Enter match"}
                </Text>
              </Press>
            </Enter>
          );
        })}
      </ScrollView>
      <Text style={s.note}>
        One fee per rack. The winner takes both entries and seals a crate.
        Quitting forfeits.
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0, paddingVertical: 12 },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 12,
  },
  headTools: {
    flexDirection: "row",
    gap: 10,
    marginLeft: "auto",
    flexWrap: "wrap",
  },
  title: { fontSize: 22, fontWeight: "600", color: "#f2efe3" },
  copy: { fontSize: 11, color: "#b8c6bc", marginTop: 5 },
  close: { padding: 12 },
  rail: { padding: 10, gap: 14, alignItems: "stretch" },
  card: {
    width: 220,
    alignSelf: "stretch",
    justifyContent: "flex-start",
    padding: 12,
    backgroundColor: "#04121def",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffffff1c",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  art: { width: "100%", borderRadius: 7, flexShrink: 1, minHeight: 40 },
  name: { fontSize: 17, fontWeight: "600", color: "#f2efe3", marginTop: 8 },
  fee: { fontSize: 15, color: "#e5c78c", marginVertical: 8, marginTop: "auto" },
  win: { fontSize: 12, color: "#24dbb3", fontWeight: "700" },
  join: { backgroundColor: "#24dbb3", borderColor: "#7ff0d6" },
  button: {
    minHeight: 44,
    justifyContent: "center",
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
  },
  primary: { backgroundColor: "#e1c18a", borderColor: "#ffd9a5" },
  quiet: { backgroundColor: "#0a1f2edd", borderColor: "#ffffff24" },
  buttonText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    color: "#19281f",
  },
  note: {
    fontSize: 10,
    color: "#b8c6bc",
    paddingHorizontal: 24,
    lineHeight: 15,
  },
});
