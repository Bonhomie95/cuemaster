import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import type { LobbyProps } from "./Lobby";
import IconButton from "./IconButton";
type Icon = React.ComponentProps<typeof Feather>["name"];
export default function HomeLobby(p: LobbyProps) {
  const rail = useRef<ScrollView>(null);
  const [short, setShort] = useState(false);
  const [width, setWidth] = useState(896),
    [x, setX] = useState(0),
    [content, setContent] = useState(0);
  const tileWidth = Math.max(166, Math.min(235, (width - 80) / 4.2));
  const pageCount = Math.max(
    1,
    Math.ceil((content - width) / (tileWidth + 14)) + 1,
  );
  const done = p.player.completed.filter((k) =>
    k.startsWith("practice:"),
  ).length;
  const gifted = p.player.completed.includes(
    "daily:" + new Date().toISOString().slice(0, 10),
  );
  const next = p.catalog.venues.find((v) => v.level > p.player.level);
  const modes: {
    title: string;
    caption: string;
    icon: Icon;
    colors: [string, string];
    edge: string;
    action: () => void;
  }[] = [
    {
      title: "Play pool",
      caption: "FIND YOUR RIVAL",
      icon: "play",
      colors: ["#087e5c", "#035640"],
      edge: "#688d7d",
      action: p.onPlay,
    },
    {
      title: "Cues",
      caption: "TIME & AIM",
      icon: "edit-2",
      colors: ["#b16b08", "#754006"],
      edge: "#7b705b",
      action: p.onCues,
    },
    {
      title: "Practice",
      caption: "FIND YOUR FORM",
      icon: "crosshair",
      colors: ["#1678bb", "#154c86"],
      edge: "#536968",
      action: () => p.onPage("practice"),
    },
    {
      title: "Compete",
      caption: "PRESEASON OPEN",
      icon: "award",
      colors: ["#8544bb", "#562883"],
      edge: "#6d656d",
      action: () => p.onPage("events"),
    },
    {
      title: "Tables",
      caption: "YOUR COLLECTION",
      icon: "grid",
      colors: ["#0e8893", "#095661"],
      edge: "#526b60",
      action: () => p.onPage("tables"),
    },
    {
      title: "Free play",
      caption: "JUST YOU & THE TABLE",
      icon: "target",
      colors: ["#bc4e36", "#7b2d25"],
      edge: "#7b705b",
      action: p.onFree,
    },
  ];
  return (
    <View
      style={s.root}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        setShort(e.nativeEvent.layout.height < 330);
      }}
    >
      <View style={[s.brandArea, short && { minHeight: 52, maxHeight: 52 }]}>
        <View style={s.brandRow}>
          <Text style={s.brand}>CUE</Text>

          <Text style={[s.brand, { color: "#ffd05b" }]}>MASTER</Text>
        </View>
        {!short && <Text style={s.tagline}>THE NEXT SHOT IS YOURS</Text>}
      </View>
      <View style={[s.modeArea, short && { height: 106 }]}>
        <ScrollView
          ref={rail}
          horizontal
          showsHorizontalScrollIndicator={false}
          directionalLockEnabled
          snapToInterval={tileWidth + 14}
          decelerationRate="fast"
          onContentSizeChange={(w) => setContent(w)}
          onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={32}
          contentContainerStyle={s.modeRail}
        >
          {modes.map((m) => (
            <Pressable
              key={m.title}
              accessibilityRole="button"
              accessibilityLabel={m.title}
              onPress={m.action}
              style={({ pressed }) => [
                s.tile,
                short && { height: 94 },
                {
                  width: tileWidth,
                  borderColor: m.edge,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <LinearGradient colors={m.colors} style={s.tileFill}>
                <Feather
                  name={m.icon}
                  size={22}
                  color="#ffffff"
                  style={s.modeIcon}
                />
                <Text style={s.modeTitle}>{m.title}</Text>
                <View style={s.captionRow}>
                  <Text style={s.caption}>{m.caption}</Text>
                  <Feather name="chevron-right" color="#eafaf6" size={16} />
                </View>
              </LinearGradient>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={[s.dock, short && { minHeight: 72, maxHeight: 72 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            gifted ? "Daily gift collected" : "Collect daily gift"
          }
          disabled={p.busy || gifted}
          onPress={p.onGift}
          style={[s.gift, gifted && { opacity: 0.65 }]}
        >
          <LinearGradient colors={["#a76e0b", "#775005"]} style={s.giftFill}>
            <Feather
              name={gifted ? "check" : "gift"}
              color="#fff0bf"
              size={26}
            />
          </LinearGradient>
          <View>
            <Text style={s.smallTitle}>
              {gifted ? "Collected" : "Daily gift"}
            </Text>
            <Text style={s.smallCopy}>
              {gifted ? "See you tomorrow" : "+100 coins"}
            </Text>
          </View>
          {!gifted && <View style={s.dot} />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View practice progress"
          onPress={() => p.onPage("practice")}
          style={s.progressCard}
        >
          <View style={s.progressHead}>
            <Feather name="target" size={15} color="#83d7ba" />
            <Text style={s.smallTitle}>Practice journey</Text>
            <Text style={s.progressCount}>{done}/6</Text>
          </View>
          <View style={s.pips}>
            {p.catalog.challenges.map((c) => (
              <View
                key={c.id}
                style={[
                  s.pip,
                  p.player.completed.includes("practice:" + c.id) && {
                    backgroundColor: "#79c5a1",
                  },
                ]}
              />
            ))}
          </View>
          <Text style={s.smallCopy} numberOfLines={1}>
            {next
              ? `${next.name} · Level ${next.level}`
              : "All launch tables unlocked"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Explore CueMaster Masters"
          onPress={() =>
            p.onEvent(p.catalog.tournaments.find((t) => t.kind === "crypto")!)
          }
          style={s.special}
        >
          <Feather name="award" size={30} color="#e9c883" />
          <View>
            <Text style={s.specialKicker}>USDC SPECIAL · UPCOMING</Text>
            <Text style={s.smallTitle}>CueMaster Masters</Text>
          </View>
          <Feather name="chevron-right" size={16} color="#dfc592" />
        </Pressable>
      </View>
      <View style={s.pager}>
        <Text style={s.equipped}>{p.selected.name.toUpperCase()}</Text>
        <View style={s.pagerCenter}>
          {Array.from({ length: pageCount }, (_, i) => (
            <View
              key={i}
              style={[
                s.pageDot,
                (x >= content - width - 3
                  ? pageCount - 1
                  : Math.min(
                      pageCount - 1,
                      Math.round(x / (tileWidth + 14)),
                    )) === i && { backgroundColor: "#d5b775", width: 18 },
              ]}
            />
          ))}
        </View>
        <IconButton
          icon="chevron-left"
          label="Previous modes"
          disabled={x < 3}
          onPress={() =>
            rail.current?.scrollTo({
              x: Math.max(0, x - tileWidth - 14),
              animated: true,
            })
          }
        />
        <IconButton
          icon="chevron-right"
          label="More modes"
          disabled={x >= content - width - 3}
          onPress={() =>
            rail.current?.scrollTo({
              x: Math.min(content - width, x + tileWidth + 14),
              animated: true,
            })
          }
        />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0, justifyContent: "space-between" },
  brandArea: {
    flex: 1,
    minHeight: 68,
    maxHeight: 155,
    justifyContent: "center",
    alignItems: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    fontStyle: "normal",
    letterSpacing: 3,
    color: "#f5f1dc",
  },
  tagline: { fontSize: 10, letterSpacing: 3, color: "#b9c8bd", marginTop: 7 },
  modeArea: { height: 136 },
  modeRail: { paddingHorizontal: 24, paddingVertical: 6, gap: 14 },
  tile: {
    height: 124,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 3px 12px #00000024",
  },
  tileFill: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    overflow: "hidden",
  },
  modeIcon: { marginBottom: 10, opacity: 1 },
  modeTitle: {
    color: "#f8fff9",
    fontSize: 20,
    fontWeight: "800",
  },
  captionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 9,
  },
  caption: {
    fontSize: 10,
    fontWeight: "700",
    color: "#e0ece6",
    letterSpacing: 0.6,
  },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingHorizontal: 24,
    flex: 1,
    minHeight: 78,
    maxHeight: 115,
  },
  gift: { flexDirection: "row", gap: 10, alignItems: "center", minHeight: 54 },
  giftFill: {
    height: 48,
    width: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#81775c",
  },
  smallTitle: { fontSize: 12, fontWeight: "800", color: "#f1ecd9" },
  smallCopy: { fontSize: 11, color: "#deefff", marginTop: 5 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#f4d071",
    position: "absolute",
    top: 0,
    left: 44,
  },
  progressCard: {
    width: 205,
    padding: 12,
    backgroundColor: "#081916b8",
    borderWidth: 1,
    borderColor: "#73948538",
    borderRadius: 12,
  },
  progressHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  progressCount: { fontSize: 10, color: "#89d0ad", marginLeft: "auto" },
  pips: { flexDirection: "row", gap: 4, marginTop: 10 },
  pip: { height: 4, flex: 1, borderRadius: 2, backgroundColor: "#ffffff20" },
  special: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderWidth: 1,
    borderColor: "#cba35e65",
    borderRadius: 12,
    backgroundColor: "#1b251bbd",
  },
  specialKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#d7b66b",
    marginBottom: 6,
  },
  pager: {
    height: 44,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  equipped: { fontSize: 10, letterSpacing: 1.2, color: "#daf1fb" },
  pagerCenter: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  pageDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#ffffff38",
  },
});
