import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ImageBackground,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import type { LobbyProps } from "./Lobby";
import { Press, Enter, Pulse } from "./motion";
import { api, Today } from "./api";
import { readyToCollect } from "./DailyRewards";
import { online } from "../game/online";
import { remind } from "./notify";
import { venueArt, icons, welcome } from "./art";
import type { VenueMode } from "./MatchVenues";
type Icon = React.ComponentProps<typeof Feather>["name"];

/**
 * The club home, laid out the way players of the big pool games expect: the ways to play as
 * large picture cards in the middle, the daily rewards down the left, the shop and collection
 * down the right. Everything that is ready to collect carries a dot, and a brand-new player's
 * first card says where to start.
 */
export default function HomeLobby(p: LobbyProps) {
  const rail = useRef<ScrollView>(null);
  const [size, setSize] = useState({ width: 760, height: 300 });
  // The day's board drives the badges; it is re-read whenever the player's balances change,
  // which is every time they come back from collecting something.
  const [today, setToday] = useState<Today | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let alive = true;
    void api<Today>("/me/today")
      .then((t) => {
        if (!alive) return;
        setToday(t);
        // The next refill of free coins becomes a reminder, without asking for permission here.
        if (t.gift.readyAt)
          void remind(
            "gift",
            new Date(t.gift.readyAt),
            "Free coins are ready",
            `${t.gift.coins} coins are waiting in the club.`,
            false,
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [p.player.coins, p.player.rubies, p.player.crates]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ready = today ? readyToCollect(today, now) : null;
  const giftLeft = today?.gift.readyAt
    ? Math.max(0, Date.parse(today.gift.readyAt) - now)
    : 0;
  const clock = (ms: number) => {
    const h = Math.floor(ms / 3600000),
      m = Math.floor((ms % 3600000) / 60000),
      sec = Math.floor((ms % 60000) / 1000);
    return h ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, "0")}`;
  };
  const played =
    (p.player.stats.cpuMatches || 0) + (p.player.stats.onlineMatches || 0);
  const open = p.catalog.tournaments.find((t) => t.status === "open");
  const cards: {
    title: string;
    caption: string;
    cta: string;
    art: any;
    accent: string;
    emblem: Icon;
    chip?: string;
    action: () => void;
  }[] = [
    {
      title: "Play Online",
      emblem: "globe",
      caption: "1 vs 1 · winner takes the pot",
      cta: "PLAY",
      art: venueArt.heritage,
      accent: "#24dbb3",
      chip:
        online.online > 1
          ? `${online.online.toLocaleString()} online`
          : undefined,
      action: () => p.onPlay("online"),
    },
    {
      title: "Play a Friend",
      emblem: "users",
      caption: "Private table · send a link",
      cta: "INVITE",
      art: venueArt.riviera,
      accent: "#4aa8ff",
      action: () => p.onPlay("friend"),
    },
    {
      title: "Vs Computer",
      emblem: "cpu",
      caption: "House rivals that match your form",
      cta: "PLAY",
      art: venueArt.midnight,
      accent: "#b98cff",
      action: () => p.onPlay("cpu"),
    },
    {
      title: "Practice",
      emblem: "target",
      caption: "Drills, trick shots, the Daily Shot",
      cta: "TRAIN",
      art: venueArt.regent,
      accent: "#ffb82e",
      action: () => p.onPage("practice"),
    },
    {
      title: "Tournaments",
      emblem: "award",
      caption: open ? "Open now · win coins" : "Events and prizes",
      cta: "ENTER",
      art: venueArt.jade,
      accent: "#ff8a5c",
      chip: open ? "OPEN" : undefined,
      action: () => p.onPage("events"),
    },
    {
      title: "Pass & Play",
      emblem: "repeat",
      caption: "Two players, one phone",
      cta: "PLAY",
      art: venueArt.champion,
      accent: "#3fd0d8",
      action: () => p.onPlay("local"),
    },
    {
      title: "Free Play",
      emblem: "crosshair",
      caption: "Just you and the table",
      cta: "OPEN",
      art: welcome,
      accent: "#9fc0d6",
      action: p.onFree,
    },
  ];
  const cardHeight = Math.max(150, size.height - 8);
  const cardWidth = Math.round(Math.min(250, Math.max(176, cardHeight * 0.78)));
  return (
    <View
      style={s.root}
      onLayout={(e) =>
        setSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height - 24,
        })
      }
    >
      <View style={s.column}>
        <Side
          icon="calendar"
          label={today ? `Day ${today.streak.day || 1}` : "Daily"}
          a11y="Daily rewards"
          badge={!!ready?.daily}
          onPress={() => p.onHub("daily")}
        />
        <Side
          icon="disc"
          label="Spin"
          a11y="Prize wheel"
          badge={!!ready?.spin}
          onPress={() => p.onHub("spin")}
        />
        <Side
          image={icons.coin}
          label={giftLeft ? clock(giftLeft) : "Free coins"}
          a11y="Free coins"
          badge={!!ready?.gift}
          onPress={() => p.onHub("daily")}
        />
        <Side
          icon="check-square"
          label={`Missions ${today ? today.missions.list.filter((m) => m.claimed).length : 0}/3`}
          a11y="Daily missions"
          badge={!!ready?.missions}
          onPress={() => p.onHub("missions")}
        />
      </View>
      <ScrollView
        ref={rail}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        style={{ flex: 1 }}
        contentContainerStyle={s.rail}
      >
        {cards.map((c, i) => (
          <Enter key={c.title} index={i}>
            <Press
              scale={0.97}
              accessibilityRole="button"
              accessibilityLabel={`${c.title}. ${c.caption}`}
              onPress={c.action}
              style={[
                s.card,
                {
                  width: cardWidth,
                  height: cardHeight,
                  borderColor: i === 0 ? `${c.accent}aa` : "#ffffff22",
                  shadowColor: i === 0 ? c.accent : "#000",
                },
              ]}
            >
              <ImageBackground
                source={c.art}
                resizeMode="cover"
                style={StyleSheet.absoluteFill}
                imageStyle={{ borderRadius: 18 }}
              />
              <LinearGradient
                pointerEvents="none"
                colors={[
                  `${c.accent}66`,
                  `${c.accent}14`,
                  "#04121de6",
                  "#04121d",
                ]}
                locations={[0, 0.38, 0.7, 1]}
                style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
              />
              <View style={s.cardTop}>
                <View
                  style={[
                    s.emblem,
                    {
                      backgroundColor: `${c.accent}33`,
                      borderColor: `${c.accent}88`,
                    },
                  ]}
                >
                  <Feather name={c.emblem} size={18} color={c.accent} />
                </View>
                {!!c.chip && (
                  <View style={[s.chip, { borderColor: `${c.accent}88` }]}>
                    <View style={[s.dot, { backgroundColor: c.accent }]} />
                    <Text style={s.chipText}>{c.chip}</Text>
                  </View>
                )}
                {i === 0 && played === 0 && (
                  <Pulse style={[s.start, { backgroundColor: c.accent }]}>
                    <Text style={s.startText}>START HERE</Text>
                  </Pulse>
                )}
              </View>
              <View style={{ gap: 4 }}>
                <Text style={s.title}>{c.title}</Text>
                <Text style={s.caption} numberOfLines={2}>
                  {c.caption}
                </Text>
                <View style={[s.cta, { backgroundColor: c.accent }]}>
                  <Text style={s.ctaText}>{c.cta}</Text>
                  <Feather name="play" size={12} color="#06231c" />
                </View>
              </View>
            </Press>
          </Enter>
        ))}
      </ScrollView>
      <View style={s.column}>
        <Side image={icons.gift} label="Shop" a11y="Shop" onPress={p.onShop} />
        <Side
          image={icons.crate.club}
          label={
            p.player.crates
              ? `${p.player.crates} crate${p.player.crates === 1 ? "" : "s"}`
              : "Crates"
          }
          a11y="Crates"
          badge={!!p.player.crates}
          onPress={p.onRewards}
        />
        <Side
          image={icons.pass}
          label={today ? `Pass ${today.pass.tier}` : "Pass"}
          a11y="CueMaster Pass"
          badge={!!ready?.pass}
          onPress={() => p.onHub("pass")}
        />
        <Side icon="edit-2" label="Cues" a11y="Cues" onPress={p.onCues} />
      </View>
    </View>
  );
}

/** One round button in a side column: an icon or a rendered piece of art, a label, a dot. */
function Side({
  icon,
  image,
  label,
  a11y,
  badge = false,
  onPress,
}: {
  icon?: Icon;
  image?: any;
  label: string;
  /** A stable name for screen readers and the UI walk; the visible label can be a countdown. */
  a11y: string;
  badge?: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      outer={{ alignItems: "center" }}
      style={s.side}
    >
      <Pulse active={badge} style={s.sideIcon}>
        <LinearGradient
          pointerEvents="none"
          colors={["#1d4160", "#0a1e2e", "#050f18"]}
          style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
        />
        {image ? (
          <Image source={image} style={{ width: 38, height: 38 }} />
        ) : (
          <Feather name={icon!} size={20} color="#eef5fb" />
        )}
        {badge && <View style={s.badge} />}
      </Pulse>
      <Text style={s.sideLabel} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 6,
  },
  column: { width: 70, gap: 8, alignItems: "center" },
  rail: { paddingHorizontal: 8, gap: 12, alignItems: "center" },
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    justifyContent: "space-between",
    overflow: "hidden",
    backgroundColor: "#04121d",
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  chip: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "#04121dcc",
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { color: "#fffdf3", fontSize: 10, fontWeight: "900" },
  emblem: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  start: {
    marginLeft: "auto",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  startText: {
    color: "#06231c",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    color: "#fffdf3",
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.3,
    textShadowColor: "#000000aa",
    textShadowRadius: 8,
  },
  caption: { color: "#c3d8e6", fontSize: 11.5, lineHeight: 15 },
  cta: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
  },
  ctaText: {
    color: "#06231c",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  side: { alignItems: "center", gap: 3, width: 70 },
  sideIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff2b",
    overflow: "hidden",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ff5f6d",
    borderWidth: 1.5,
    borderColor: "#06131f",
  },
  sideLabel: {
    color: "#c3d8e6",
    fontSize: 10,
    fontWeight: "800",
    maxWidth: 70,
  },
});
