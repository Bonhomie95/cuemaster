import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import type { LobbyProps } from "./Lobby";
import IconButton from "./IconButton";
import { Press, Enter, Pulse } from "./motion";
type Icon = React.ComponentProps<typeof Feather>["name"];

/**
 * Club home: one horizontal rail of modes, and a row of icon buttons for everything else.
 * Each mode carries its colour in an icon chip and a soft corner glow rather than a full
 * gradient block, so six tiles side by side stay calm.
 */
export default function HomeLobby(p: LobbyProps) {
  const rail = useRef<ScrollView>(null);
  const [short, setShort] = useState(false);
  const [width, setWidth] = useState(896),
    [x, setX] = useState(0),
    [content, setContent] = useState(0);
  const tileWidth = Math.max(170, Math.min(212, (width - 96) / 4.1));
  const step = tileWidth + 12;
  const pageCount = Math.max(1, Math.ceil((content - width) / step) + 1);
  const page =
    x >= content - width - 3
      ? pageCount - 1
      : Math.min(pageCount - 1, Math.round(x / step));
  const done = p.player.completed.filter((k) =>
    k.startsWith("practice:"),
  ).length;
  const gifted = p.player.completed.includes(
    "daily:" + new Date().toISOString().slice(0, 10),
  );
  const open = p.catalog.tournaments.find((t) => t.status === "open");
  const modes: {
    title: string;
    caption: string;
    icon: Icon;
    accent: string;
    action: () => void;
  }[] = [
    {
      title: "Play pool",
      caption: "FIND YOUR RIVAL",
      icon: "play",
      accent: "#24dbb3",
      action: p.onPlay,
    },
    {
      title: "Cues",
      caption: "TIME & AIM",
      icon: "edit-2",
      accent: "#ffb82e",
      action: p.onCues,
    },
    {
      title: "Practice",
      caption: "FIND YOUR FORM",
      icon: "crosshair",
      accent: "#4aa8ff",
      action: () => p.onPage("practice"),
    },
    {
      title: "Compete",
      caption: "PRESEASON OPEN",
      icon: "award",
      accent: "#b98cff",
      action: () => p.onPage("events"),
    },
    {
      title: "Tables",
      caption: "YOUR COLLECTION",
      icon: "grid",
      accent: "#3fd0d8",
      action: () => p.onPage("tables"),
    },
    {
      title: "Free play",
      caption: "JUST YOU & THE TABLE",
      icon: "target",
      accent: "#ff8a5c",
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
      <View style={[s.brandArea, short && { height: 44 }]}>
        <Text style={s.brand}>
          CUE<Text style={{ color: "#ffd05b" }}>MASTER</Text>
        </Text>
        {!short && <Text style={s.tagline}>THE NEXT SHOT IS YOURS</Text>}
      </View>

      <ScrollView
        ref={rail}
        horizontal
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        snapToInterval={step}
        decelerationRate="fast"
        onContentSizeChange={(w) => setContent(w)}
        onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
        style={[s.modeArea, short && { maxHeight: 118 }]}
        contentContainerStyle={s.modeRail}
      >
        {modes.map((m, i) => (
          <Enter key={m.title} index={i}>
            <Press
              scale={0.97}
              accessibilityRole="button"
              accessibilityLabel={`${m.title}. ${m.caption}`}
              onPress={m.action}
              style={[
                s.tile,
                short && { height: 106 },
                { width: tileWidth, borderColor: "#ffffff1a" },
              ]}
            >
              <LinearGradient
                pointerEvents="none"
                colors={["#0d2537", "#061521", "#020a11"]}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                pointerEvents="none"
                colors={[`${m.accent}52`, `${m.accent}14`, "#00000000"]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.05, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={s.topLight} />
              <View
                style={[
                  s.chip,
                  {
                    backgroundColor: `${m.accent}24`,
                    borderColor: `${m.accent}66`,
                    shadowColor: m.accent,
                  },
                ]}
              >
                <LinearGradient
                  pointerEvents="none"
                  colors={["#ffffff26", "#ffffff00"]}
                  style={StyleSheet.absoluteFill}
                />
                <Feather name={m.icon} size={19} color={m.accent} />
              </View>
              <View style={{ gap: 4 }}>
                <Text style={s.tileTitle}>{m.title}</Text>
                <Text style={s.tileCaption}>{m.caption}</Text>
              </View>
            </Press>
          </Enter>
        ))}
      </ScrollView>

      <View style={s.dock}>
        <Quick
          icon={gifted ? "check" : "gift"}
          label={gifted ? "Collected" : "Daily gift"}
          badge={!gifted}
          disabled={p.busy || gifted}
          onPress={p.onGift}
        />
        <Quick
          icon="gift"
          label={
            p.player.crates
              ? `${p.player.crates} crate${p.player.crates === 1 ? "" : "s"}`
              : "Crates"
          }
          badge={!!p.player.crates}
          onPress={p.onRewards}
        />
        <Quick
          icon="crosshair"
          label={`Drills ${done}/6`}
          onPress={() => p.onPage("practice")}
        />
        <Quick
          icon="award"
          label={open ? "Event open" : "Events"}
          badge={!!open}
          onPress={() => p.onPage("events")}
        />
        <Quick
          icon="grid"
          label={p.selected.name}
          onPress={() => p.onPage("tables")}
        />
        <View style={s.pager}>
          {Array.from({ length: pageCount }, (_, i) => (
            <View key={i} style={[s.dot, page === i && s.dotOn]} />
          ))}
          <IconButton
            icon="chevron-left"
            label="Previous modes"
            disabled={x < 3}
            onPress={() =>
              rail.current?.scrollTo({
                x: Math.max(0, x - step),
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
                x: Math.min(content - width, x + step),
                animated: true,
              })
            }
          />
        </View>
      </View>
    </View>
  );
}

function Quick({
  icon,
  label,
  badge = false,
  disabled = false,
  onPress,
}: {
  icon: Icon;
  label: string;
  badge?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      outer={{ minWidth: 56 }}
      style={[s.quick, disabled && { opacity: 0.45 }]}
    >
      <Pulse active={badge && !disabled} style={s.quickIcon}>
        <LinearGradient
          pointerEvents="none"
          colors={["#1d4160", "#0a1e2e", "#050f18"]}
          style={[StyleSheet.absoluteFill, { borderRadius: 23 }]}
        />
        <View pointerEvents="none" style={s.quickLight} />
        <Feather name={icon} size={18} color="#eef5fb" />
        {badge && <View style={s.badge} />}
      </Pulse>
      <Text style={s.quickLabel} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0, justifyContent: "center", gap: 16 },
  brandArea: { alignItems: "center", gap: 6 },
  brand: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 4,
    color: "#fffdf3",
    textShadowColor: "#00000088",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  tagline: {
    fontSize: 9,
    letterSpacing: 3,
    color: "#8fb0c4",
    fontWeight: "700",
  },
  modeArea: { maxHeight: 150, flexGrow: 0 },
  modeRail: { paddingHorizontal: 26, gap: 12, alignItems: "center" },
  tile: {
    height: 138,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    justifyContent: "space-between",
    overflow: "hidden",
    backgroundColor: "#04121df2",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  // A one-pixel lit edge along the top: the cheapest way to read as a raised surface.
  topLight: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: "#ffffff38",
  },
  chip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowOpacity: 0.5,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
  },
  tileTitle: { color: "#fffdf3", fontSize: 17, fontWeight: "800" },
  tileCaption: {
    color: "#93b3c8",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 26,
  },
  quick: { alignItems: "center", gap: 6, minWidth: 56 },
  quickIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff2b",
    backgroundColor: "#081b2ad9",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  quickLight: {
    position: "absolute",
    top: 1,
    left: 12,
    right: 12,
    height: 1,
    borderRadius: 1,
    backgroundColor: "#ffffff3d",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#ffd05b",
    borderWidth: 1,
    borderColor: "#06131f",
  },
  quickLabel: { color: "#a9c4d6", fontSize: 10, fontWeight: "700" },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#ffffff30" },
  dotOn: { width: 16, backgroundColor: "#ffd05b" },
});
