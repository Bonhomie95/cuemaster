import React, { useEffect, useState } from "react";
import {
  Image,
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { Player } from "./api";
import { loadStore, buy, type Piggy } from "./billing";
import { Press, Enter, Pulse } from "./motion";
import { icons } from "./art";
import { celebrate } from "./feedback";
import { api } from "./api";
import { showRewardedVideo } from "./ads";

type Product = Awaited<ReturnType<typeof loadStore>>["products"][number];
/** Bigger packs get bigger piles: the art is the first thing that says "more". */
function artFor(p: Product, index: number) {
  if (p.kind === "coins") return icons.coins[Math.min(index, 3)];
  if (p.kind === "rubies") return icons.rubies[Math.min(index, 4)];
  if (p.kind === "pass") return icons.pass;
  return icons.gift;
}
type Tab = "offers" | "rubies" | "coins";

/**
 * The shop. Prices come from Apple or Google in the player's own currency; the server's
 * catalog decides what each product grants and credits it only after checking the store's
 * receipt. Nothing here can add a coin by itself.
 */
export default function Shop({
  player,
  onPlayer,
  onClose,
  initialTab = "offers",
}: {
  player: Player;
  onPlayer: (p: Player) => void;
  onClose: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [store, setStore] = useState<Awaited<
    ReturnType<typeof loadStore>
  > | null>(null);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = () =>
    loadStore()
      .then(setStore)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
  }, []);
  const purchase = async (p: Product) => {
    if (buying) return;
    setBuying(p.id);
    setError("");
    setNotice("");
    try {
      const r = await buy(p.id);
      if (r.status === "credited") {
        if (r.player) onPlayer(r.player);
        celebrate();
        setNotice(`${p.label} added. Thank you!`);
        void refresh();
      } else if (r.status === "pending")
        setNotice(
          "Payment pending. It is added the moment your store confirms it.",
        );
      else if (r.status === "failed")
        setError(r.message || "The purchase did not go through.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuying("");
    }
  };
  // A player short of an entry fee can always earn a little, which also makes the shop the
  // place to look when coins run out, rather than a dead end.
  const freeCoins = async () => {
    if (buying) return;
    setBuying("video");
    setError("");
    setNotice("");
    try {
      const outcome = await showRewardedVideo({ purpose: "coins" });
      if (outcome === "unavailable")
        throw new Error("No video is available right now. Try again shortly.");
      if (outcome === "granted") {
        // AdMob's signed callback grants the coins; give it a moment, then read back.
        await new Promise((r) => setTimeout(r, 1200));
        onPlayer(await api<Player>("/me"));
        celebrate();
        setNotice("Free coins added.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuying("");
    }
  };
  const products = (store?.products || []).filter((p) =>
    tab === "offers"
      ? p.kind === "bundle" || p.kind === "pass" || p.kind === "piggy"
      : p.kind === tab,
  );
  return (
    <View style={s.root}>
      <View style={s.head}>
        <View>
          <Text style={s.eyebrow}>CUEMASTER SHOP</Text>
          <Text style={s.title}>Top up</Text>
        </View>
        <View style={s.tabs}>
          {(
            [
              ["offers", "Offers", "star"],
              ["rubies", "Rubies", "hexagon"],
              ["coins", "Coins", "disc"],
            ] as const
          ).map(([id, label, icon]) => (
            <Press
              key={id}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: tab === id }}
              onPress={() => setTab(id)}
              style={[s.tab, tab === id && s.tabOn]}
            >
              <Feather
                name={icon}
                size={13}
                color={tab === id ? "#10233a" : "#cfe0ee"}
              />
              <Text style={[s.tabText, tab === id && { color: "#10233a" }]}>
                {label}
              </Text>
            </Press>
          ))}
        </View>
        <Press
          accessibilityRole="button"
          accessibilityLabel="Close shop"
          onPress={onClose}
          style={s.close}
        >
          <Feather name="x" size={20} color="#fffdf3" />
        </Press>
      </View>
      {(!!error || !!notice) && (
        <Text
          accessibilityRole="alert"
          style={[s.banner, !!error && { color: "#ffb6b6" }]}
        >
          {error || notice}
        </Text>
      )}
      {!store ? (
        <ActivityIndicator color="#ffd05b" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.rail}
          style={{ flex: 1, minHeight: 0 }}
        >
          {products.map((p, i) => (
            <Enter key={p.id} index={i} style={{ alignSelf: "stretch" }}>
              {p.kind === "piggy" ? (
                <PiggyCard
                  product={p}
                  piggy={store.piggy}
                  available={store.available && p.available !== false}
                  busy={buying === p.id}
                  onBuy={() => void purchase(p)}
                />
              ) : (
                <Card
                  art={artFor(p, i)}
                  product={p}
                  available={store.available && p.available !== false}
                  busy={buying === p.id}
                  onBuy={() => void purchase(p)}
                />
              )}
            </Enter>
          ))}
          {tab !== "rubies" && Platform.OS !== "web" && (
            <Enter index={products.length} style={{ alignSelf: "stretch" }}>
              <View style={[s.card, { borderColor: "#24dbb355" }]}>
                <LinearGradient
                  pointerEvents="none"
                  colors={["#24dbb333", "#00000000"]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={s.art}>
                  <Feather name="play-circle" size={32} color="#24dbb3" />
                </View>
                <Text style={s.cardTitle}>Free coins</Text>
                <Text style={s.grant}>◉ 150 coins per video</Text>
                <Text style={[s.grant, { color: "#a9c4d6" }]}>Three a day</Text>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel="Watch a video for free coins"
                  disabled={!!buying}
                  onPress={() => void freeCoins()}
                  style={[s.buy, { backgroundColor: "#24dbb3" }]}
                >
                  {buying === "video" ? (
                    <ActivityIndicator color="#10233a" />
                  ) : (
                    <Text style={s.buyText}>Watch</Text>
                  )}
                </Press>
              </View>
            </Enter>
          )}
          {!products.length && (
            <Text style={s.empty}>
              Nothing here right now. Check back soon.
            </Text>
          )}
        </ScrollView>
      )}
      <Text style={s.fine}>
        {store && !store.available
          ? Platform.OS === "web"
            ? "Purchases work in the iOS and Android apps."
            : "The store is not available on this device right now."
          : "Charged by your app store in your local currency. Coins and rubies are virtual items with no cash value."}
      </Text>
    </View>
  );
}

function Card({
  art,
  product: p,
  available,
  busy,
  onBuy,
}: {
  art: any;
  product: Product;
  available: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  const ruby = p.kind === "rubies",
    coins = p.kind === "coins",
    pass = p.kind === "pass";
  const accent = ruby
    ? "#ff5f6d"
    : coins
      ? "#ffd05b"
      : pass
        ? "#b98cff"
        : "#24dbb3";
  const owned = (p as any).owned === true;
  return (
    <View style={[s.card, { borderColor: `${accent}55` }]}>
      <LinearGradient
        pointerEvents="none"
        colors={[`${accent}33`, "#00000000"]}
        style={StyleSheet.absoluteFill}
      />
      {!!p.bonus && (
        <View style={[s.ribbon, { backgroundColor: accent }]}>
          <Text style={s.ribbonText}>{p.bonus}</Text>
        </View>
      )}
      <Pulse active={!pass && !ruby && !coins && !owned} style={s.art}>
        <Image source={art} style={s.artImage} />
      </Pulse>
      <Text style={s.cardTitle} numberOfLines={2}>
        {p.label}
      </Text>
      <View style={{ gap: 2, minHeight: 34 }}>
        {!!p.grants?.coins && (
          <Text style={s.grant}>◉ {p.grants.coins.toLocaleString()} coins</Text>
        )}
        {!!p.grants?.rubies && (
          <Text style={[s.grant, { color: "#ffb3bb" }]}>
            ⬢ {p.grants.rubies.toLocaleString()} rubies
          </Text>
        )}
        {pass && <Text style={s.grant}>Premium track this season</Text>}
      </View>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`Buy ${p.label} for ${p.price || `$${p.usd}`}`}
        disabled={!available || busy || owned}
        onPress={onBuy}
        style={[
          s.buy,
          { backgroundColor: available && !owned ? accent : "#1a2b3b" },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#10233a" />
        ) : (
          <Text
            style={[s.buyText, !(available && !owned) && { color: "#8fa8bb" }]}
          >
            {owned ? "Owned" : p.price || `$${p.usd.toFixed(2)}`}
          </Text>
        )}
      </Press>
    </View>
  );
}

/**
 * The piggy bank: coins from every finished match pile up behind a lock, and one purchase
 * breaks it open. The pile grows with the bank, and the button only sells from the minimum up.
 */
function PiggyCard({
  product: p,
  piggy,
  available,
  busy,
  onBuy,
}: {
  product: Product;
  piggy: Piggy;
  available: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  const ready = piggy.coins >= piggy.minimum,
    full = piggy.coins >= piggy.cap,
    accent = "#ff9ec4";
  return (
    <View style={[s.card, { borderColor: `${accent}66` }]}>
      <LinearGradient
        pointerEvents="none"
        colors={[`${accent}33`, "#00000000"]}
        style={StyleSheet.absoluteFill}
      />
      <Pulse active={full} style={s.art}>
        <Image
          source={
            icons.coins[Math.min(3, Math.floor((4 * piggy.coins) / piggy.cap))]
          }
          style={[s.artImage, !ready && { opacity: 0.55 }]}
        />
        {!ready && (
          <View style={s.lock}>
            <Feather name="lock" size={14} color="#fffdf3" />
          </View>
        )}
      </Pulse>
      <Text style={s.cardTitle}>{p.label}</Text>
      <Text
        style={s.grant}
        accessibilityLabel={`Piggy bank holds ${piggy.coins} coins`}
      >
        ◉ {piggy.coins.toLocaleString()} / {piggy.cap.toLocaleString()}
      </Text>
      <View style={s.track}>
        <View
          style={[
            s.fill,
            {
              width: `${Math.min(100, (100 * piggy.coins) / piggy.cap)}%`,
              backgroundColor: accent,
            },
          ]}
        />
      </View>
      <Text style={[s.grant, { color: "#a9c4d6", fontSize: 11 }]}>
        {full
          ? "Full: break it to keep filling"
          : ready
            ? "Ready to break"
            : `Breaks open at ${piggy.minimum.toLocaleString()}`}
        {"\n"}+{piggy.won} a win · +{piggy.lost} a loss
      </Text>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`Break the piggy bank for ${p.price || `$${p.usd}`}`}
        disabled={!available || busy}
        onPress={onBuy}
        style={[s.buy, { backgroundColor: available ? accent : "#1a2b3b" }]}
      >
        {busy ? (
          <ActivityIndicator color="#10233a" />
        ) : (
          <Text style={[s.buyText, !available && { color: "#8fa8bb" }]}>
            {p.price || `$${p.usd.toFixed(2)}`}
          </Text>
        )}
      </Press>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0, paddingTop: 10, paddingBottom: 4 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 22,
  },
  eyebrow: {
    color: "#ffd05b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: { color: "#fffdf3", fontSize: 22, fontWeight: "900" },
  tabs: { flexDirection: "row", gap: 8, marginLeft: "auto" },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ffffff24",
    backgroundColor: "#0a1f2edd",
  },
  tabOn: { backgroundColor: "#eac183", borderColor: "#ffd9a5" },
  tabText: { color: "#cfe0ee", fontSize: 12, fontWeight: "800" },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff14",
  },
  banner: {
    color: "#7ff0d6",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 22,
    marginTop: 6,
  },
  rail: { paddingHorizontal: 22, paddingVertical: 10, gap: 12 },
  card: {
    width: 168,
    flex: 1,
    padding: 12,
    gap: 6,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#04121def",
    overflow: "hidden",
  },
  ribbon: {
    position: "absolute",
    top: 10,
    right: -30,
    width: 110,
    paddingVertical: 3,
    alignItems: "center",
    transform: [{ rotate: "35deg" }],
  },
  ribbonText: { color: "#10233a", fontSize: 10, fontWeight: "900" },
  art: { height: 76, alignItems: "center", justifyContent: "center" },
  artImage: { width: 84, height: 84 },
  lock: {
    position: "absolute",
    bottom: 4,
    right: 38,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10233acc",
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ffffff14",
    overflow: "hidden",
  },
  fill: { height: 6, borderRadius: 3 },
  cardTitle: { color: "#fffdf3", fontSize: 15, fontWeight: "900" },
  grant: { color: "#ffe9a8", fontSize: 12, fontWeight: "800" },
  buy: {
    marginTop: "auto",
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buyText: { color: "#10233a", fontSize: 15, fontWeight: "900" },
  empty: { color: "#8fa8bb", fontSize: 13, alignSelf: "center" },
  fine: {
    color: "#7f96a8",
    fontSize: 10,
    paddingHorizontal: 22,
    lineHeight: 14,
  },
});
