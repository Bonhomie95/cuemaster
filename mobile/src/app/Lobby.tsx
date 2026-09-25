import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { Catalog, Player, Venue, Challenge, Tournament } from "./api";
import IconButton from "./IconButton";
import { Press, Enter } from "./motion";
export { default as IconButton } from "./IconButton";
import HomeLobby from "./HomeLobby";
import { venueArt } from "./art";
type Icon = React.ComponentProps<typeof Feather>["name"];
type Page = "home" | "tables" | "practice" | "events";
export type LobbyProps = {
  page: Page;
  player: Player;
  catalog: Catalog;
  selected: Venue;
  busy: boolean;
  onPage: (page: Page) => void;
  onPlay: () => void;
  onCues: () => void;
  onFree: () => void;
  onRewards: () => void;
  onEquip: (v: Venue) => void;
  onChallenge: (c: Challenge) => void;
  onEvent: (e: Tournament) => void;
  onGift: () => void;
};
function Badge({ icon, text }: { icon: Icon; text: string }) {
  return (
    <View style={s.badge}>
      <Feather name={icon} size={12} color="#e8c98f" />
      <Text style={s.badgeText}>{text}</Text>
    </View>
  );
}
/**
 * Card footer control. Only a real next step is gold: an already-equipped table or a locked
 * one reads as state, not as a call to action, so it stays dark.
 */
function CardAction({
  icon = "arrow-right",
  label,
  onPress,
  disabled = false,
  tone = "primary",
}: {
  icon?: Icon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "muted" | "locked";
}) {
  const gold = tone === "primary";
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || tone === "locked" }}
      onPress={onPress}
      disabled={disabled}
      style={[
        s.action,
        gold ? s.actionPrimary : s.actionQuiet,
        tone === "locked" && { opacity: 0.75 },
        disabled && !gold && { opacity: 0.85 },
        disabled && gold && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.actionText, !gold && { color: "#cfe0ee" }]}>{label}</Text>
      <Feather name={icon} size={18} color={gold ? "#142333" : "#8fa8bb"} />
    </Press>
  );
}
export default function Lobby(p: LobbyProps) {
  const scroll = useRef<ScrollView>(null);
  const [short, setShort] = useState(false);
  const [area, setArea] = useState(800),
    [offset, setOffset] = useState(0),
    [content, setContent] = useState(0);
  const cardWidth = Math.min(340, Math.max(250, area * 0.36));
  const completed = p.player.completed.filter((k) =>
    k.startsWith("practice:"),
  ).length;
  const gifted = p.player.completed.includes(
    "daily:" + new Date().toISOString().slice(0, 10),
  );
  const move = (direction: number) =>
    scroll.current?.scrollTo({
      x: Math.max(
        0,
        Math.min(content - area, offset + direction * (cardWidth + 16)),
      ),
      animated: true,
    });
  const headings = {
    home: "Choose your next shot",
    tables: "Your table collection",
    practice: "The practice lab",
    events: "The competition room",
  };
  const frame = { width: cardWidth };
  if (p.page === "home") return <HomeLobby {...p} />;
  return (
    <View
      style={s.root}
      onLayout={(e) => {
        setArea(e.nativeEvent.layout.width);
        setShort(e.nativeEvent.layout.height < 340);
      }}
    >
      <View style={s.headingRow}>
        <Text style={s.heading}>{headings[p.page]}</Text>
        <Badge icon="award" text={`LV ${p.player.level} · ${p.player.xp} XP`} />
      </View>
      <ScrollView
        key={p.page}
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        decelerationRate="fast"
        snapToInterval={cardWidth + 16}
        snapToAlignment="start"
        onContentSizeChange={(w) => {
          setContent(w);
          setOffset(0);
        }}
        onScroll={(e) => setOffset(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
        style={s.scroll}
        contentContainerStyle={s.track}
      >
        {p.page === "tables" &&
          p.catalog.venues.map((v, i) => (
            <Enter key={v.id} index={i} style={[s.card, frame]}>
              <Image
                source={venueArt[v.id]}
                style={[s.tableArt, short && { minHeight: 25 }]}
              />
              <View style={s.cardDetails}>
                <Badge
                  icon={
                    v.level > p.player.level
                      ? "lock"
                      : p.selected.id === v.id
                        ? "check"
                        : "unlock"
                  }
                  text={
                    v.level > p.player.level
                      ? `LEVEL ${v.level}`
                      : p.selected.id === v.id
                        ? "EQUIPPED"
                        : "UNLOCKED"
                  }
                />
                <Text
                  style={[s.title, short && { fontSize: 18 }]}
                  numberOfLines={1}
                >
                  {v.name}
                </Text>
                <Text style={s.copy} numberOfLines={1}>
                  {v.subtitle}
                </Text>
                <CardAction
                  icon={
                    v.level > p.player.level
                      ? "lock"
                      : p.selected.id === v.id
                        ? "check"
                        : "arrow-right"
                  }
                  tone={
                    v.level > p.player.level
                      ? "locked"
                      : p.selected.id === v.id
                        ? "muted"
                        : "primary"
                  }
                  label={
                    v.level > p.player.level
                      ? `Unlocks at level ${v.level}`
                      : p.selected.id === v.id
                        ? "Equipped"
                        : `Equip ${v.name}`
                  }
                  disabled={p.busy || p.selected.id === v.id}
                  onPress={() => p.onEquip(v)}
                />
              </View>
            </Enter>
          ))}
        {p.page === "practice" && (
          <>
            {p.catalog.challenges.map((c, i) => {
              const done = p.player.completed.includes("practice:" + c.id);
              return (
                <Enter key={c.id} index={i} style={[s.card, frame, s.padded]}>
                  <View style={s.between}>
                    <Text style={[s.number, short && { fontSize: 22 }]}>
                      0{i + 1}
                    </Text>
                    <Badge
                      icon={done ? "check-circle" : "target"}
                      text={done ? "COMPLETE" : c.difficulty.toUpperCase()}
                    />
                  </View>
                  <View style={s.bottom}>
                    <Text
                      style={[s.title, short && { fontSize: 18 }]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <Text style={s.copy} numberOfLines={short ? 1 : 2}>
                      {c.description}
                    </Text>
                    <Text style={s.reward}>
                      {done
                        ? "Reward collected"
                        : `+${c.xp} XP · ${c.coins} coins`}
                    </Text>
                    <CardAction
                      icon="play"
                      tone={done ? "muted" : "primary"}
                      label={done ? "Play again" : "Start challenge"}
                      disabled={p.busy}
                      onPress={() => p.onChallenge(c)}
                    />
                  </View>
                </Enter>
              );
            })}
            <View style={[s.card, frame, s.padded]}>
              <View style={s.artIcon}>
                <Feather name="crosshair" size={56} color="#78c9b9" />
              </View>
              <Text
                style={[s.title, short && { fontSize: 18 }]}
                numberOfLines={1}
              >
                Free practice
              </Text>
              <Text style={s.copy}>No score. Explore every angle.</Text>
              <CardAction icon="play" label="Play freely" onPress={p.onFree} />
            </View>
          </>
        )}
        {p.page === "events" &&
          p.catalog.tournaments.map((t, i) => (
            <Enter
              key={t.id}
              index={i}
              style={[
                s.card,
                frame,
                s.padded,
                t.kind === "crypto" && { borderColor: "#88724c" },
              ]}
            >
              <View style={s.between}>
                <Feather
                  name={t.kind === "crypto" ? "star" : "award"}
                  size={short ? 24 : 35}
                  color="#e4c48c"
                />
                <Badge
                  icon={t.status === "open" ? "zap" : "clock"}
                  text={t.status === "open" ? "OPEN" : "COMING SOON"}
                />
              </View>
              <View style={s.bottom}>
                <Text
                  style={[s.title, short && { fontSize: 18 }]}
                  numberOfLines={1}
                >
                  {t.name}
                </Text>
                <Text style={s.copy} numberOfLines={short ? 1 : 2}>
                  {t.subtitle}
                </Text>
                <Text style={s.reward} numberOfLines={short ? 1 : 2}>
                  {t.prize}
                </Text>
                <CardAction
                  icon="arrow-right"
                  label="View event"
                  onPress={() => p.onEvent(t)}
                />
              </View>
            </Enter>
          ))}
      </ScrollView>
      <View style={s.footer}>
        <Text style={s.hint}>SWIPE TO EXPLORE</Text>
        <View style={s.line}>
          <View
            style={[
              s.progress,
              {
                width: `${Math.min(100, (area / Math.max(content, area)) * 100)}%`,
                marginLeft: `${Math.min(100 - (area / Math.max(content, area)) * 100, (offset / Math.max(content, 1)) * 100)}%`,
              },
            ]}
          />
        </View>
        <IconButton
          icon="chevron-left"
          label="Previous options"
          onPress={() => move(-1)}
          disabled={offset < 3}
        />
        <IconButton
          icon="chevron-right"
          label="More options"
          onPress={() => move(1)}
          disabled={offset >= content - area - 3}
        />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  headingRow: {
    height: 42,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: { fontSize: 16, fontWeight: "700", color: "#eff2ec" },
  scroll: { flex: 1 },
  track: { paddingHorizontal: 24, gap: 16, paddingVertical: 6 },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#04121def",
    borderWidth: 1,
    borderColor: "#ffffff1c",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  padded: { padding: 12 },
  cover: { width: "100%", height: "100%" },
  artCard: { flex: 1, padding: 18, justifyContent: "space-between" },
  bottom: { marginTop: "auto" },
  title: { fontSize: 23, fontWeight: "600", color: "#f4f1e8", marginBottom: 6 },
  copy: { fontSize: 12, lineHeight: 17, color: "#d4e8f6", marginBottom: 6 },
  action: {
    height: 44,
    marginTop: 10,
    paddingHorizontal: 15,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionPrimary: { backgroundColor: "#e1c18a", borderColor: "#ffd9a5" },
  actionQuiet: { backgroundColor: "#0a1f2edd", borderColor: "#ffffff24" },
  actionText: { fontSize: 12, fontWeight: "700", color: "#142333" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#091722bf",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    letterSpacing: 0.7,
    fontWeight: "700",
    color: "#daca9d",
  },
  artIcon: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 55,
  },
  tableArt: { width: "100%", flex: 1, minHeight: 50 },
  cardDetails: { padding: 10, gap: 2 },
  number: { fontSize: 34, color: "#617d8e", fontWeight: "300" },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reward: { color: "#e2c68e", fontSize: 11, lineHeight: 16, marginTop: 6 },
  footer: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  hint: { color: "#c3dfed", fontSize: 10, letterSpacing: 1.4 },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: "#263b49",
    marginHorizontal: 12,
  },
  progress: { height: 2, backgroundColor: "#d8bb80" },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  iconSelected: { backgroundColor: "#dfbf8022" },
});
