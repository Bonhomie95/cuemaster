import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
} from "react-native";
import { cueArt } from "./art";
import { cues } from "../game/cues";
import { Player } from "./api";
import { Press, Enter } from "./motion";
export default function CueShop({
  player,
  busy,
  onEquip,
  onClose,
}: {
  player: Player;
  busy: boolean;
  onEquip: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={s.title}>
          Your cues · {player.coins.toLocaleString()} coins
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close cue shop"
          onPress={onClose}
          style={{ padding: 10 }}
        >
          <Text style={s.title}>×</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        contentContainerStyle={{ gap: 16, alignItems: "center" }}
      >
        {cues.map((c, i) => {
          const owned = c.id === "club" || player.ownedCues?.includes(c.id),
            selected = (player.selectedCue || "club") === c.id;
          return (
            <Enter key={c.id} index={i} style={s.card}>
              <View style={s.art}>
                <Image
                  source={cueArt[c.id]}
                  resizeMode="contain"
                  style={{ width: "150%", height: 74 }}
                  accessibilityLabel={`${c.name} cue`}
                />
              </View>
              <Text style={s.title}>{c.name}</Text>
              <Text style={s.copy}>
                {c.seconds}s per shot · {Math.round(c.aim * 100)}cm aim guide
              </Text>
              <Text style={s.copy}>
                {owned ? "Owned" : `${c.price} coins · permanent unlock`}
              </Text>
              <Press
                accessibilityRole="button"
                accessibilityLabel={`${owned ? "Equip" : "Buy"} ${c.name}`}
                disabled={
                  busy || selected || (!owned && player.coins < c.price)
                }
                onPress={() => onEquip(c.id)}
                style={[
                  s.button,
                  // Only a cue you can actually take is gold.
                  selected || (!owned && player.coins < c.price)
                    ? s.quiet
                    : s.primary,
                  busy && { opacity: 0.5 },
                ]}
              >
                <Text
                  style={[
                    s.buttonText,
                    (selected || (!owned && player.coins < c.price)) && {
                      color: "#9fb6c7",
                    },
                  ]}
                >
                  {selected
                    ? "Equipped"
                    : owned
                      ? "Equip"
                      : player.coins < c.price
                        ? "Not enough coins"
                        : `Buy · ${c.price} coins`}
                </Text>
              </Press>
            </Enter>
          );
        })}
      </ScrollView>
      <Text style={s.copy}>
        Local matches use your equipped cue. Player 2 uses Club Maple. Cue
        changes apply to the next match; free practice has no timer.
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  title: { fontSize: 18, color: "#eee8d8", fontWeight: "600" },
  card: {
    width: 250,
    backgroundColor: "#04121def",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#ffffff1c",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  art: {
    height: 74,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    transform: [{ rotate: "-14deg" }],
  },
  copy: { fontSize: 12, color: "#c4ccbe", marginVertical: 8 },
  button: {
    minHeight: 44,
    justifyContent: "center",
    padding: 14,
    borderRadius: 11,
    borderWidth: 1,
    marginTop: 10,
  },
  primary: { backgroundColor: "#e1c18a", borderColor: "#ffd9a5" },
  quiet: { backgroundColor: "#0a1f2edd", borderColor: "#ffffff24" },
  buttonText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    color: "#19281f",
  },
});
