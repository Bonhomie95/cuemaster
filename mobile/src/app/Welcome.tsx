import React, { useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { api, flag, Player } from "./api";
import { portraits } from "./art";
import { Press, Enter } from "./motion";
import { celebrate } from "./feedback";

const COUNTRIES = ["NG", "GH", "KE", "ZA", "EG", "US", "GB", "IN", "AE", "FR"];
const FIRST = [
  "Silk",
  "Lagos",
  "Bank",
  "Top",
  "Kiss",
  "Rail",
  "Golden",
  "Swift",
];
const SECOND = [
  "Cue",
  "Ace",
  "Shot",
  "Spin",
  "Break",
  "Pocket",
  "Eight",
  "Hustler",
];
const suggest = () =>
  FIRST[Math.floor(Math.random() * FIRST.length)] +
  SECOND[Math.floor(Math.random() * SECOND.length)] +
  Math.floor(10 + Math.random() * 89);

/**
 * First thing a new player sees: a name, a flag and a face, because online opponents see all
 * three. Every field has a sensible default, so "Let's play" works on the first tap.
 */
export default function Welcome({
  player,
  visible,
  onDone,
}: {
  player: Player;
  visible: boolean;
  onDone: (p: Player | null) => void;
}) {
  const ideas = useMemo(() => [suggest(), suggest(), suggest()], []);
  const [name, setName] = useState(ideas[0]);
  const [country, setCountry] = useState(player.country || "");
  const [avatar, setAvatar] = useState(player.avatar || 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const p = await api<Player>("/me", "PATCH", {
        name: name.trim(),
        country,
        avatar,
      });
      celebrate();
      onDone(p);
    } catch (e) {
      setError(
        (e as Error).message.includes("check")
          ? "Use 2–24 letters, numbers or spaces."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      supportedOrientations={["landscape"]}
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={() => onDone(null)}
    >
      <View style={s.scrim}>
        <Enter style={s.card}>
          <ScrollView contentContainerStyle={s.inner}>
            <View style={s.head}>
              <View>
                <Text style={s.eyebrow}>WELCOME TO THE CLUB</Text>
                <Text style={s.title}>Who's at the table?</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip for now"
                onPress={() => onDone(null)}
                style={s.skip}
              >
                <Text style={s.skipText}>Skip</Text>
              </Pressable>
            </View>
            <View style={s.columns}>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={s.label}>YOUR NAME · RIVALS SEE THIS</Text>
                <TextInput
                  accessibilityLabel="Player name"
                  value={name}
                  onChangeText={setName}
                  maxLength={24}
                  autoCorrect={false}
                  style={s.input}
                />
                <View style={s.chips}>
                  {ideas.map((idea) => (
                    <Pressable
                      key={idea}
                      accessibilityRole="button"
                      accessibilityLabel={`Use the name ${idea}`}
                      onPress={() => setName(idea)}
                      style={[s.chip, name === idea && s.chipOn]}
                    >
                      <Text style={[s.chipText, name === idea && s.chipTextOn]}>
                        {idea}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.label}>PLAY FOR YOUR FLAG</Text>
                <View style={s.chips}>
                  {COUNTRIES.map((c) => (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      accessibilityLabel={`Country ${c}`}
                      accessibilityState={{ selected: country === c }}
                      onPress={() => setCountry(country === c ? "" : c)}
                      style={[s.flag, country === c && s.chipOn]}
                    >
                      <Text style={s.flagText}>{flag(c)}</Text>
                    </Pressable>
                  ))}
                  <TextInput
                    accessibilityLabel="Other country code"
                    value={COUNTRIES.includes(country) ? "" : country}
                    onChangeText={(v) =>
                      setCountry(
                        v
                          .toUpperCase()
                          .replace(/[^A-Z]/g, "")
                          .slice(0, 2),
                      )
                    }
                    placeholder="Other"
                    placeholderTextColor="#5d7a8d"
                    autoCapitalize="characters"
                    maxLength={2}
                    style={s.other}
                  />
                </View>
              </View>
              <View style={{ alignItems: "center", gap: 8 }}>
                <Text style={s.label}>YOUR LOOK</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {portraits.map((p, i) => (
                    <Pressable
                      key={i}
                      accessibilityRole="button"
                      accessibilityLabel={`Avatar ${i + 1}`}
                      accessibilityState={{ selected: avatar === i }}
                      onPress={() => setAvatar(i)}
                      style={[
                        s.face,
                        avatar === i && { borderColor: "#ffd05b" },
                      ]}
                    >
                      <Image source={p} style={s.faceImage} />
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            <Press
              accessibilityRole="button"
              accessibilityLabel="Save and play"
              disabled={busy || name.trim().length < 2}
              onPress={save}
              style={[
                s.primary,
                (busy || name.trim().length < 2) && { opacity: 0.5 },
              ]}
            >
              <Text style={s.primaryText}>
                {busy ? "Saving…" : "Let's play"}
              </Text>
              <Feather name="arrow-right" size={18} color="#10233a" />
            </Press>
          </ScrollView>
        </Enter>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "#02070dd9",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  card: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "96%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#061523f7",
  },
  inner: { padding: 18, gap: 10 },
  head: { flexDirection: "row", justifyContent: "space-between" },
  eyebrow: {
    color: "#ffd05b",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: { color: "#fffdf3", fontSize: 22, fontWeight: "900", marginTop: 2 },
  skip: { padding: 8 },
  skipText: { color: "#8fa8bb", fontSize: 13, fontWeight: "700" },
  columns: { flexDirection: "row", gap: 18 },
  label: {
    color: "#8fa8bb",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ffd05b66",
    backgroundColor: "#0d2536",
    color: "#fffdf3",
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ffffff24",
    backgroundColor: "#0a1f2e",
  },
  chipOn: { borderColor: "#ffd05b", backgroundColor: "#ffd05b22" },
  chipText: { color: "#cfe0ee", fontSize: 12, fontWeight: "700" },
  chipTextOn: { color: "#ffe9a8" },
  flag: {
    width: 38,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff24",
    backgroundColor: "#0a1f2e",
  },
  flagText: { fontSize: 18 },
  other: {
    width: 64,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#ffffff24",
    color: "#fffdf3",
    textAlign: "center",
    fontWeight: "800",
  },
  face: {
    borderRadius: 34,
    borderWidth: 3,
    borderColor: "#ffffff26",
  },
  faceImage: { width: 62, height: 62, borderRadius: 31 },
  error: { color: "#ffb6b6", fontSize: 12 },
  primary: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 12,
    backgroundColor: "#ffd05b",
    marginTop: 4,
  },
  primaryText: { color: "#10233a", fontSize: 16, fontWeight: "900" },
});
