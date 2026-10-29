import React, { useEffect, useState } from "react";
import {
  Image,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { api, Player } from "./api";
import { showRewardedVideo } from "./ads";
import { celebrate } from "./feedback";
import { remind } from "./notify";
import { sfx } from "./sound";
import { Press, Enter, CountUp, Pulse, CrateBurst } from "./motion";
import { icons } from "./art";

type Crate = {
  id: string;
  tier: string;
  name: string;
  hours: number;
  unlocking: boolean;
  readyAt: string | null;
  ready: boolean;
  hoursOff: number;
  /** Videos this crate can still take; each takes an hour off. */
  videosLeft: number;
  rubyCost: number;
};
const TIER: Record<string, string> = {
  practice: "#c8834a",
  club: "#24dbb3",
  silver: "#9fb6c7",
  gold: "#ffb82e",
  champion: "#b98cff",
  master: "#ff5f6d",
};
const tint = (tier: string) => TIER[tier] || "#7f96a8";

/**
 * A crate's `ready` flag is true only as of the moment the server answered. The screen ticks
 * every second, so once the countdown runs out the crate becomes openable here too — otherwise
 * a player who waits out the last minute is still asked for rubies until they reload.
 */
const isReady = (crate: Crate, now: number) =>
  crate.ready || (!!crate.readyAt && new Date(crate.readyAt).getTime() <= now);

/** Whole units only: a crate that says "3h left" and opens at 2h 59m looks broken. */
function countdown(readyAt: string | null, now: number) {
  if (!readyAt) return "";
  const ms = new Date(readyAt).getTime() - now;
  if (ms <= 0) return "Ready";
  const h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

function Button({
  label,
  icon,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        primary && !disabled ? s.primary : s.ghost,
        disabled && { opacity: 0.45 },
      ]}
    >
      {!!icon && (
        <Feather
          name={icon}
          size={14}
          color={primary && !disabled ? "#10233a" : "#cfe0ee"}
        />
      )}
      <Text
        style={[s.buttonText, primary && !disabled && { color: "#10233a" }]}
      >
        {label}
      </Text>
    </Press>
  );
}

export default function Rewards({
  player,
  onClose,
  onShop,
  backLabel = "Back to profile",
  onPlayer,
}: {
  player: Player;
  onClose: () => void;
  /** Rubies are bought in the shop; the crates page points there. */
  onShop?: () => void;
  backLabel?: string;
  onPlayer: (p: Player) => void;
}) {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [opened, setOpened] = useState<any>(null),
    [revealed, setRevealed] = useState(false),
    [now, setNow] = useState(Date.now());
  // Landscape-locked, so the short edge is the real height. On a phone the slots have to give
  // up their padding or the buttons fall off the bottom of the card.
  const win = useWindowDimensions();
  const compact = Math.min(win.width, win.height) < 520;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function load() {
    setData(await api("/me/crates"));
  }
  useEffect(() => {
    let active = true;
    load()
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);
  async function work(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const crates: Crate[] = data?.crates || [];
  const slots = data?.slots || 4;
  const unlocking = crates.some((c) => c.unlocking && !isReady(c, now));
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>CUEMASTER CLUB</Text>
          <Text style={s.title}>Rewards</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.rubyPill}>
            <Feather name="hexagon" size={14} color="#ff5f6d" />
            <Text style={s.rubyCount}>
              {data?.rubies ?? player.rubies ?? 0}
            </Text>
          </View>
          <Button icon="arrow-left" label={backLabel} onPress={onClose} />
        </View>
      </View>
      {!!error && (
        <View style={s.alert}>
          <Feather name="alert-circle" size={15} color="#ffb6b6" />
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        </View>
      )}
      {loading ? (
        <ActivityIndicator color="#ffd184" />
      ) : (
        <>
          {!compact && (
            <Text style={s.copy}>
              Win a match and you seal a crate. One crate unlocks at a time —
              wait it out, or spend rubies to open it now. Crates hold coins;
              rubies are a rare bonus.
            </Text>
          )}
          <View style={s.slots}>
            {Array.from({ length: slots }, (_, i) => crates[i]).map(
              (crate, i) => (
                <Enter
                  key={crate?.id || `empty-${i}`}
                  index={i}
                  style={s.slotFrame}
                >
                  <Pulse
                    active={!!crate && isReady(crate, now)}
                    style={{ flex: 1 }}
                  >
                    <View
                      style={[
                        s.slot,
                        crate && { borderColor: `${tint(crate.tier)}66` },
                        crate &&
                          isReady(crate, now) && {
                            borderColor: `${tint(crate.tier)}`,
                          },
                      ]}
                    >
                      {crate ? (
                        <>
                          <LinearGradient
                            pointerEvents="none"
                            colors={[`${tint(crate.tier)}33`, "#00000000"]}
                            style={StyleSheet.absoluteFill}
                          />
                          <Image
                            source={icons.crate[crate.tier]}
                            style={s.crateArt}
                          />
                          <Text style={s.crateName}>{crate.name}</Text>
                          <Text style={s.crateMeta}>
                            {isReady(crate, now)
                              ? "Ready to open"
                              : crate.unlocking
                                ? countdown(crate.readyAt, now) + " left"
                                : `${crate.hours}h unlock`}
                          </Text>
                          {isReady(crate, now) ? (
                            <Button
                              primary
                              icon="gift"
                              label="Open"
                              disabled={busy}
                              onPress={() =>
                                void work(async () => {
                                  const r = await api(
                                    `/me/crates/${crate.id}/open`,
                                    "POST",
                                    {},
                                  );
                                  onPlayer(r.player);
                                  setRevealed(false);
                                  setOpened(r);
                                  sfx("whoosh", 0.8);
                                  await load();
                                })
                              }
                            />
                          ) : crate.unlocking ? (
                            <>
                              <Button
                                icon="hexagon"
                                label={`Open now · ${crate.rubyCost}`}
                                disabled={
                                  busy || (data.rubies || 0) < crate.rubyCost
                                }
                                onPress={() =>
                                  void work(async () => {
                                    const r = await api(
                                      `/me/crates/${crate.id}/open`,
                                      "POST",
                                      { spendRubies: true },
                                    );
                                    onPlayer(r.player);
                                    setRevealed(false);
                                    setOpened(r);
                                    sfx("whoosh", 0.8);
                                    await load();
                                  })
                                }
                              />
                              {!!data.videoUnlock && (
                                <Button
                                  icon="play-circle"
                                  label={
                                    busy
                                      ? "Loading video…"
                                      : `Watch · −1h (${Math.min(data.videosLeft, crate.videosLeft)})`
                                  }
                                  disabled={
                                    busy ||
                                    !data.videosLeft ||
                                    !crate.videosLeft
                                  }
                                  onPress={() =>
                                    void work(async () => {
                                      const outcome = await showRewardedVideo(
                                        crate.id,
                                      );
                                      if (outcome === "unavailable")
                                        throw new Error(
                                          "No video is available right now. Try again shortly.",
                                        );
                                      // The hour is taken off by the ad network's signed
                                      // callback, so give it a moment before reading back.
                                      if (outcome === "granted")
                                        await new Promise((r) =>
                                          setTimeout(r, 1200),
                                        );
                                      await load();
                                    })
                                  }
                                />
                              )}
                            </>
                          ) : (
                            <Button
                              primary={!unlocking}
                              icon="unlock"
                              label={
                                unlocking
                                  ? "Another is unlocking"
                                  : "Start unlock"
                              }
                              disabled={busy || unlocking}
                              onPress={() =>
                                void work(async () => {
                                  const r = await api(
                                    `/me/crates/${crate.id}/start`,
                                    "POST",
                                    {},
                                  );
                                  const started = r.crates?.find(
                                    (c: Crate) => c.id === crate.id,
                                  );
                                  if (started?.readyAt)
                                    void remind(
                                      "crate",
                                      new Date(started.readyAt),
                                      `${crate.name} unlocked`,
                                      "Your crate is ready. Open it and collect your coins.",
                                    );
                                  await load();
                                })
                              }
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <View style={[s.crateChip, { opacity: 0.4 }]}>
                            <Feather name="plus" size={20} color="#7f96a8" />
                          </View>
                          <Text style={s.crateName}>Empty slot</Text>
                          <Text style={s.crateMeta}>
                            Win a match to fill it
                          </Text>
                        </>
                      )}
                    </View>
                  </Pulse>
                </Enter>
              ),
            )}
          </View>
          {!!onShop && (
            <Press
              accessibilityRole="button"
              accessibilityLabel="Get rubies in the shop"
              onPress={onShop}
              style={s.shopRow}
            >
              <Image source={icons.rubies[1]} style={s.shopArt} />
              <View style={{ flex: 1 }}>
                <Text style={s.heading}>Can't wait?</Text>
                <Text style={s.copy}>
                  Rubies open a crate now: one ruby for each hour left.
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color="#ffd05b" />
            </Press>
          )}
        </>
      )}

      <Modal
        supportedOrientations={["landscape"]}
        transparent
        visible={!!opened}
        animationType="fade"
        onRequestClose={() => setOpened(null)}
      >
        <View style={s.scrim}>
          <View style={[s.sheet, s.reveal]}>
            <CrateBurst
              playing={!!opened}
              onDone={() => {
                setRevealed(true);
                celebrate("coins");
              }}
            >
              <Image
                source={
                  revealed
                    ? opened?.reward?.rubies
                      ? icons.rubies[3]
                      : icons.coins[3]
                    : icons.crate[opened?.opened?.tier || "practice"]
                }
                style={s.bigCrate}
              />
            </CrateBurst>
            <Text style={s.heading}>{opened?.opened?.name}</Text>
            {revealed ? (
              <Enter>
                <View style={{ gap: 12, alignItems: "center" }}>
                  <View style={s.rewardRow}>
                    <Feather name="circle" size={20} color="#ffd05b" />
                    <CountUp
                      value={opened?.reward?.coins || 0}
                      style={s.rewardValue}
                    />
                    <Text style={s.rewardValue}>coins</Text>
                  </View>
                  {!!opened?.reward?.rubies && (
                    <View style={s.rewardRow}>
                      <Feather name="hexagon" size={20} color="#ff5f6d" />
                      <CountUp
                        value={opened.reward.rubies}
                        style={s.rewardValue}
                      />
                      <Text style={s.rewardValue}>
                        {opened.reward.rubies === 1 ? "ruby" : "rubies"}
                      </Text>
                    </View>
                  )}
                  {!!opened?.opened?.spentRubies && (
                    <Text style={s.copy}>
                      Opened early for {opened.opened.spentRubies} rubies.
                    </Text>
                  )}
                  <Button
                    primary
                    label="Collect"
                    onPress={() => setOpened(null)}
                  />
                </View>
              </Enter>
            ) : (
              <Text style={s.copy}>Opening…</Text>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: {
    padding: 18,
    gap: 12,
    paddingBottom: 50,
    maxWidth: 1100,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrow: {
    color: "#f3c576",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  title: { color: "#fffdf3", fontSize: 26, fontWeight: "800" },
  rubyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ff5f6d55",
    backgroundColor: "#2a0f1499",
  },
  rubyCount: { color: "#ffd7db", fontSize: 15, fontWeight: "800" },
  copy: { color: "#a9c4d6", fontSize: 13, lineHeight: 21 },
  heading: { color: "#fffdf3", fontSize: 18, fontWeight: "800" },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  slotFrame: { flexGrow: 1, flexBasis: 190 },
  slot: {
    minHeight: 178,
    padding: 14,
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffffff1c",
    backgroundColor: "#04121def",
    overflow: "hidden",
    justifyContent: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  crateChip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffffff1f",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  crateName: { color: "#fffdf3", fontSize: 15, fontWeight: "800" },
  crateMeta: { color: "#90aabd", fontSize: 12, marginBottom: 4 },

  shopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ff5f6d44",
    backgroundColor: "#2a0f14aa",
  },
  shopArt: { width: 56, height: 56 },

  button: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
  },
  primary: { backgroundColor: "#eac183", borderColor: "#ffd9a5" },
  ghost: { backgroundColor: "#0a1f2edd", borderColor: "#ffffff24" },
  buttonText: { color: "#e6f0f7", fontWeight: "800", fontSize: 12 },
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#8c4a4a",
    backgroundColor: "#2a1214cc",
  },
  error: { color: "#ffb6b6", fontSize: 14, flex: 1 },
  scrim: {
    flex: 1,
    backgroundColor: "#03080ce6",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ffffff22",
    backgroundColor: "#061523",
  },
  reveal: { padding: 26, gap: 14, alignItems: "center" },
  crateArt: { width: 64, height: 64, marginTop: -6, marginBottom: -2 },
  bigCrate: { width: 150, height: 150, marginBottom: 2 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rewardValue: { color: "#fffdf3", fontSize: 20, fontWeight: "800" },
});
