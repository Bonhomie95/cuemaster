import React, { useEffect, useState } from "react";
import {
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
import { Press, Enter, CountUp, Pulse, CrateBurst } from "./motion";

type Crate = {
  id: string;
  tier: string;
  name: string;
  hours: number;
  unlocking: boolean;
  readyAt: string | null;
  ready: boolean;
  hoursOff: number;
  rubyCost: number;
};
const TIER: Record<string, string> = {
  practice: "#7f96a8",
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
  onPlayer,
}: {
  player: Player;
  onClose: () => void;
  onPlayer: (p: Player) => void;
}) {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [opened, setOpened] = useState<any>(null),
    [revealed, setRevealed] = useState(false),
    [now, setNow] = useState(Date.now());
  const [store, setStore] = useState<any>(null);
  // Landscape-locked, so the short edge is the real height. On a phone the slots have to give
  // up their padding or the buttons fall off the bottom of the card.
  const win = useWindowDimensions();
  const compact = Math.min(win.width, win.height) < 520;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function load() {
    const [crates, rubies] = await Promise.all([
      api("/me/crates"),
      api("/store/rubies"),
    ]);
    setData(crates);
    setStore(rubies);
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
          <Button icon="arrow-left" label="Back to profile" onPress={onClose} />
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
                          <View
                            style={[
                              s.crateChip,
                              {
                                borderColor: `${tint(crate.tier)}66`,
                                backgroundColor: `${tint(crate.tier)}22`,
                              },
                            ]}
                          >
                            <Feather
                              name={isReady(crate, now) ? "gift" : "package"}
                              size={20}
                              color={tint(crate.tier)}
                            />
                          </View>
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
                                      : `Watch · −1h (${data.videosLeft})`
                                  }
                                  disabled={busy || !data.videosLeft}
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
                                  await api(
                                    `/me/crates/${crate.id}/start`,
                                    "POST",
                                    {},
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
          <View style={s.card}>
            <View style={s.header}>
              <Text style={s.heading}>Rubies</Text>
              {!store?.available && (
                <Text style={s.badge}>PURCHASES NOT AVAILABLE</Text>
              )}
            </View>
            <Text style={s.copy}>
              {store?.note ||
                "Rubies open crates early. They never buy coins, cues or tables."}
            </Text>
            <View style={s.packs}>
              {(store?.packs || []).map((p: any) => (
                <View key={p.id} style={s.pack}>
                  <Feather name="hexagon" size={16} color="#ff5f6d" />
                  <Text style={s.packCount}>{p.rubies}</Text>
                  <Text style={s.packLabel}>{p.label}</Text>
                  {!!p.bonus && <Text style={s.packBonus}>{p.bonus}</Text>}
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      <Modal
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
                celebrate();
              }}
            >
              <View
                style={[
                  s.bigCrate,
                  {
                    borderColor: `${tint(opened?.opened?.tier)}88`,
                    backgroundColor: `${tint(opened?.opened?.tier)}22`,
                  },
                ]}
              >
                <Feather
                  name={revealed ? "gift" : "package"}
                  size={54}
                  color={tint(opened?.opened?.tier)}
                />
              </View>
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
  badge: { color: "#ffda95", fontSize: 11, fontWeight: "800" },
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
  card: {
    backgroundColor: "#04121def",
    borderWidth: 1,
    borderColor: "#ffffff1c",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  packs: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pack: {
    flexGrow: 1,
    flexBasis: 140,
    alignItems: "center",
    gap: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffffff1c",
    backgroundColor: "#0a1f2edd",
  },
  packCount: { color: "#ffd7db", fontSize: 20, fontWeight: "900" },
  packLabel: { color: "#a9c4d6", fontSize: 11, textAlign: "center" },
  packBonus: { color: "#24dbb3", fontSize: 11, fontWeight: "800" },
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
  bigCrate: {
    width: 120,
    height: 120,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rewardValue: { color: "#fffdf3", fontSize: 20, fontWeight: "800" },
});
