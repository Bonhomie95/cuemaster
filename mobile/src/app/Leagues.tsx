import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { api, flag } from "./api";
import { Press, Enter, Pulse, CountUp } from "./motion";

type Crate = { tier: string; name: string };
/** `GET /me/league`. The server settles last week (tier move, crate) before it answers. */
type LeagueView = {
  week: { id: number; startsAt: string; endsAt: string };
  tier: number;
  name: string;
  size: number;
  leagues: { name: string; crate: Crate }[];
  league: null | {
    tier: number;
    name: string;
    number: number;
    count: number;
    crate: Crate;
    promote: number;
    relegate: number;
    standings: {
      rank: number;
      name: string;
      country: string;
      coins: number;
      you: boolean;
    }[];
  };
  last: null | {
    from: number;
    tier: number;
    rank: number;
    size: number;
    result: "promoted" | "relegated" | "stayed";
    name: string;
    next: string;
    granted?: {
      crate: Crate | null;
      fallback: (Crate & { coins: number }) | null;
    };
  };
};
const TIER = ["#d59a63", "#cfd8dc", "#ffd05b", "#7fd0ff", "#b98cff"];
function ordinal(n: number) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${(!teen && ["th", "st", "nd", "rd"][n % 10]) || "th"}`;
}
function ends(ms: number) {
  const d = Math.floor(ms / 86400000),
    h = Math.floor((ms % 86400000) / 3600000),
    m = Math.floor((ms % 3600000) / 60000);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}
/** What last week did, in one sentence. */
function lastText(l: NonNullable<LeagueView["last"]>) {
  const place = `${ordinal(l.rank)} of ${l.size} in ${l.name}`;
  const prize = l.granted?.crate
    ? ` ${l.granted.crate.name} added to your slots.`
    : l.granted?.fallback
      ? ` Your crate slots were full, so the ${l.granted.fallback.name} paid ${l.granted.fallback.coins.toLocaleString()} coins.`
      : "";
  if (l.result === "promoted")
    return l.tier > l.from
      ? `${place}: promoted to ${l.next}!${prize}`
      : `${place}, the top of the top league.${prize}`;
  if (l.result === "relegated")
    return `${place}: down to ${l.next}. Win pots to climb back.`;
  return `${place}: you stay in ${l.next}.`;
}

/**
 * Weekly leagues: everyone who played online this week, in leagues of up to 50 with similar
 * trophies, ranked by coins won from online pots. The top of each league moves up a tier and wins
 * a crate on Monday, the bottom moves down. Nothing is decided here; the server ranks and settles.
 */
export default function Leagues({ onPlay }: { onPlay: () => void }) {
  const [data, setData] = useState<LeagueView | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const load = () => {
    setError("");
    api<LeagueView>("/me/league").then(setData, (e) => setError(e.message));
  };
  useEffect(load, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!data)
    return error ? (
      <View style={s.center}>
        <Text style={s.error}>{error}</Text>
        <Press
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={load}
          style={s.cta}
        >
          <Text style={s.ctaText}>Try again</Text>
        </Press>
      </View>
    ) : (
      <ActivityIndicator color="#ffd05b" style={{ marginTop: 40 }} />
    );
  const league = data.league;
  const tier = league?.tier ?? data.tier;
  const color = TIER[tier];
  const crate = league?.crate ?? data.leagues[tier].crate;
  const mine = league?.standings.find((r) => r.you);
  const up = league?.promote ?? 10,
    down = league?.relegate ?? 10;
  return (
    <View style={s.root}>
      <Enter style={[s.card, s.side]}>
        <LinearGradient
          pointerEvents="none"
          colors={[`${color}33`, "#00000000"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={s.headRow}>
          <View
            style={[
              s.badge,
              { borderColor: `${color}aa`, backgroundColor: `${color}22` },
            ]}
          >
            <Feather name="shield" size={22} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>WEEKLY LEAGUES</Text>
            <Text style={s.heading}>{data.leagues[tier].name} league</Text>
          </View>
        </View>
        <View style={s.ladder}>
          {data.leagues.map((l, i) => (
            <View
              key={l.name}
              accessibilityLabel={`${l.name}${i === tier ? ", your tier" : ""}`}
              style={[
                s.rung,
                { borderColor: `${TIER[i]}66` },
                i === tier && { backgroundColor: TIER[i] },
              ]}
            >
              <Text
                style={[
                  s.rungText,
                  { color: i === tier ? "#10233a" : TIER[i] },
                ]}
              >
                {l.name.slice(0, 1)}
              </Text>
            </View>
          ))}
        </View>
        <Text style={s.copy}>
          <Feather name="trending-up" size={12} color="#24dbb3" />{" "}
          {up === 1
            ? `The top player moves up and wins a ${crate.name}`
            : `Top ${up} move up and win a ${crate.name}`}
        </Text>
        <Text style={s.copy}>
          <Feather name="trending-down" size={12} color="#ff8a8a" />{" "}
          {down
            ? `Bottom ${down} move${down === 1 ? "s" : ""} down`
            : "Nobody drops from a league this small"}
        </Text>
        <Text style={s.small}>
          Ranked by coins won from online pots. Ends in{" "}
          {ends(Date.parse(data.week.endsAt) - now)}.
        </Text>
        {data.last && (
          <View style={s.last}>
            <Feather
              name={
                data.last.result === "promoted"
                  ? "award"
                  : data.last.result === "relegated"
                    ? "arrow-down-circle"
                    : "minus-circle"
              }
              size={14}
              color={data.last.result === "promoted" ? "#ffd05b" : "#a9c4d6"}
            />
            <Text style={[s.small, { flex: 1 }]}>
              Your last league: {lastText(data.last)}
            </Text>
          </View>
        )}
      </Enter>
      {league ? (
        <Enter index={1} style={[s.card, { flex: 1 }]}>
          <View style={s.headRow}>
            <Text style={[s.heading, { flex: 1 }]}>
              {league.name} · league {league.number} of {league.count}
            </Text>
            {mine && (
              <View style={s.mine}>
                <Text style={s.small}>Your pots</Text>
                <Feather name="circle" size={11} color="#ffd05b" />
                <CountUp value={mine.coins} style={s.mineText} />
              </View>
            )}
          </View>
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            showsVerticalScrollIndicator={false}
          >
            {league.standings.map((r, i) => {
              const up = r.rank <= league.promote,
                down = r.rank > league.standings.length - league.relegate;
              return (
                <Enter
                  key={r.rank}
                  index={Math.min(i, 12)}
                  style={[
                    s.row,
                    up && s.rowUp,
                    down && s.rowDown,
                    r.you && s.rowYou,
                  ]}
                >
                  <Text style={[s.rank, up && { color: "#24dbb3" }]}>
                    {r.rank}
                  </Text>
                  <Text style={s.flag}>{flag(r.country)}</Text>
                  <Text style={s.name} numberOfLines={1}>
                    {r.name}
                    {r.you ? " · You" : ""}
                  </Text>
                  <Feather name="circle" size={11} color="#ffd05b" />
                  <Text style={s.coins}>{r.coins.toLocaleString()}</Text>
                </Enter>
              );
            })}
          </ScrollView>
        </Enter>
      ) : (
        <Enter index={1} style={[s.card, s.empty]}>
          <Feather name="users" size={30} color={color} />
          <Text style={s.heading}>Not on this week's table yet</Text>
          <Text style={[s.copy, { textAlign: "center", maxWidth: 380 }]}>
            One online match, won or lost, puts you in a league of up to{" "}
            {data.size} players with trophies like yours. Every pot you win
            counts.
          </Text>
          <Pulse>
            <Press
              accessibilityRole="button"
              accessibilityLabel="Play online"
              onPress={onPlay}
              style={s.cta}
            >
              <Feather name="globe" size={14} color="#10233a" />
              <Text style={s.ctaText}>Play online</Text>
            </Press>
          </Pulse>
        </Enter>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: 4,
  },
  center: { alignItems: "center", gap: 12, padding: 24 },
  card: {
    backgroundColor: "#04121def",
    borderWidth: 1,
    borderColor: "#ffffff1c",
    borderRadius: 16,
    padding: 14,
    gap: 8,
    overflow: "hidden",
  },
  side: { width: 270 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: "#f3c576",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  heading: { color: "#fffdf3", fontSize: 16, fontWeight: "800" },
  copy: { color: "#a9c4d6", fontSize: 12, lineHeight: 17 },
  small: { color: "#90aabd", fontSize: 11, lineHeight: 15 },
  error: { color: "#ffb6b6", fontSize: 12 },
  ladder: { flexDirection: "row", gap: 6 },
  rung: {
    width: 30,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rungText: { fontSize: 11, fontWeight: "900" },
  last: {
    flexDirection: "row",
    gap: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#0a1f2edd",
  },
  mine: { flexDirection: "row", alignItems: "center", gap: 5 },
  mineText: { color: "#fffdf3", fontSize: 14, fontWeight: "900" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    borderLeftWidth: 3,
    backgroundColor: "#0a1f2e99",
  },
  rowUp: { borderLeftColor: "#24dbb3" },
  rowDown: { borderLeftColor: "#ff6b6b" },
  rowYou: { borderColor: "#ffd05b99", backgroundColor: "#2a200a99" },
  rank: {
    width: 24,
    color: "#a9c4d6",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
  },
  flag: { fontSize: 15 },
  name: { flex: 1, color: "#fffdf3", fontSize: 13, fontWeight: "800" },
  coins: {
    minWidth: 52,
    color: "#ffe9a8",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: "#24dbb3",
  },
  ctaText: { color: "#10233a", fontSize: 13, fontWeight: "900" },
});
