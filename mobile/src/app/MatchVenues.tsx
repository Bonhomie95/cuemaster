import React, { useState } from "react";
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
export default function MatchVenues({
  venues,
  player,
  busy,
  onEnter,
  onClose,
}: {
  venues: Venue[];
  player: Player;
  busy: boolean;
  onEnter: (v: Venue, mode: "local" | "cpu") => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"local" | "cpu">("cpu");
  const compact = useWindowDimensions().height < 500;
  return (
    <View style={s.root}>
      <View style={s.head}>
        <View>
          <Text style={s.title}>Choose your venue</Text>
          <Text style={s.copy}>
            {mode === "local" ? "Pass & play · two players" : "Head-to-head"} · {player.coins.toLocaleString()}{" "}
            coins
          </Text>
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
      <View style={{flexDirection:"row",gap:10,paddingHorizontal:24,marginTop:10}}>
        {(["cpu", "local"] as const).map(m=><Pressable key={m} accessibilityRole="button" accessibilityState={{selected:mode===m}} onPress={()=>setMode(m)} style={[s.button,{backgroundColor:mode===m?"#d5bd8d":"#60766c",paddingVertical:8}]}><Text style={s.buttonText}>{m==="cpu"?"Find opponent":"Pass & play"}</Text></Pressable>)}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.rail}
      >
        {venues.map((v) => {
          const locked = player.level < v.level,
            poor = player.coins < v.entry;
          return (
            <View key={v.id} style={s.card}>
              <Image
                source={venueArt[v.id]}
                style={[s.art, { height: compact ? 48 : 120 }]}
              />
              <Text style={s.name}>{v.name}</Text>
              <Text style={s.copy}>{v.subtitle}</Text>
              <Text style={s.fee}>◉ {v.entry.toLocaleString()} entry</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Enter ${v.name} for ${v.entry} coins`}
                disabled={busy || locked || poor}
                onPress={() => onEnter(v, mode)}
                style={[s.button, (busy || locked || poor) && { opacity: 0.4 }]}
              >
                <Text style={s.buttonText}>
                  {locked
                    ? `Level ${v.level} required`
                    : poor
                      ? "Not enough coins"
                      : busy
                        ? "Starting…"
                        : mode === "cpu" ? "Find opponent" : "Enter match"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <Text style={s.note}>
        One entry fee per rack, charged to your account. Quitting forfeits the
        match and fee. Clear your group, then pot the 8
        without scratching. Unranked play; no coin or crypto prizes.
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, paddingVertical: 12 },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: "600", color: "#f2efe3" },
  copy: { fontSize: 11, color: "#b8c6bc", marginTop: 5 },
  close: { padding: 12 },
  rail: { padding: 10, gap: 14, alignItems: "center" },
  card: {
    width: 220,
    padding: 12,
    backgroundColor: "#192b25",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#53695d",
  },
  art: { height: 65, width: "100%", borderRadius: 7 },
  name: { fontSize: 17, fontWeight: "600", color: "#f2efe3", marginTop: 8 },
  fee: { fontSize: 15, color: "#e5c78c", marginVertical: 10 },
  button: { backgroundColor: "#d5bd8d", padding: 12, borderRadius: 8 },
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
