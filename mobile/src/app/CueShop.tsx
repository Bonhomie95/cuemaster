import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { cues } from "../game/cues";
import { Player } from "./api";
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
        {cues.map((c) => {
          const owned = c.id === "club" || player.ownedCues?.includes(c.id),
            selected = (player.selectedCue || "club") === c.id;
          return (
            <View key={c.id} style={s.card}>
              <View
                style={{
                  height: 5,
                  backgroundColor: c.color,
                  borderRadius: 3,
                  marginVertical: 15,
                }}
              />
              <Text style={s.title}>{c.name}</Text>
              <Text style={s.copy}>
                {c.seconds}s per shot · {Math.round(c.aim * 100)}cm aim guide
              </Text>
              <Text style={s.copy}>
                {owned ? "Owned" : `${c.price} coins · permanent unlock`}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${owned ? "Equip" : "Buy"} ${c.name}`}
                disabled={
                  busy || selected || (!owned && player.coins < c.price)
                }
                onPress={() => onEquip(c.id)}
                style={[
                  s.button,
                  (busy || selected || (!owned && player.coins < c.price)) && {
                    opacity: 0.4,
                  },
                ]}
              >
                <Text>
                  {selected
                    ? "Equipped"
                    : owned
                      ? "Equip"
                      : player.coins < c.price
                        ? "Not enough coins"
                        : `Buy · ${c.price} coins`}
                </Text>
              </Pressable>
            </View>
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
    backgroundColor: "#192b25",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#65735e",
  },
  copy: { fontSize: 12, color: "#c4ccbe", marginVertical: 8 },
  button: {
    backgroundColor: "#d8c59f",
    padding: 14,
    borderRadius: 10,
    marginTop: 10,
  },
});
