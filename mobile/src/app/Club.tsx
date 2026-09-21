import AccountCenter from "./AccountCenter";
import MatchSearch from "./MatchSearch";
import { CpuOpponent } from "../game/cpu";
import CueShop from "./CueShop";
import * as Crypto from "expo-crypto";
import MatchVenues from "./MatchVenues";
import { localWinner } from "../game/localMatch";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  ImageBackground,
  TextInput,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  api,
  ApiError,
  restoreToken,
  saveToken,
  clearToken,
  Player,
  Catalog,
  Venue,
  Challenge,
  Tournament,
  ProviderConfig,
} from "./api";
import { signInProvider } from "./identity";
import { welcome, venueArt, portraits, clubRoom } from "./art";
import ProviderButton from "./ProviderButton";
import Lobby, { IconButton } from "./Lobby";
import TableGame from "../../TableGame";
import { session } from "../game/session";
void SplashScreen.preventAutoHideAsync().catch(() => {});
type Page =
  | "home"
  | "tables"
  | "practice"
  | "events"
  | "profile"
  | "matches"
  | "cues"
  | "wallet"
  | "leaderboard"
  | "blocked";
type Launch = {
  kind: "free" | "practice" | "event" | "local";
  drill: string;
  ticket?: string;
  challenge?: Challenge;
  eventId?: string;
  matchId?: string;
  opponent?: CpuOpponent;
  venue?: Venue;
};
const money = (n: number) => n.toLocaleString();
function flag(code: string) {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => c.charCodeAt(0) + 127397))
    : "◎";
}
function Action({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        u.action,
        secondary && u.secondary,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[u.actionText, secondary && { color: "#e4ecf4" }]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Tag({
  children,
  gold = false,
}: {
  children: React.ReactNode;
  gold?: boolean;
}) {
  return (
    <Text
      style={[
        u.tag,
        gold && { color: "#e5c98f", backgroundColor: "#d2b46c18" },
      ]}
    >
      {children}
    </Text>
  );
}
export default function Club() {
  return (
    <SafeAreaProvider>
      <ClubBody />
    </SafeAreaProvider>
  );
}
function ClubBody() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const small = width < 850,
    compact = height < 550;
  const entryRequest = useRef<{ venueId: string; id: string } | null>(null);
  const [offline, setOffline] = useState(false);
  const [boot, setBoot] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [player, setPlayer] = useState<Player | null>(null),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [config, setConfig] = useState<ProviderConfig>({
      google: false,
      apple: false,
      googleWebClientId: "",
      cashPayouts: false,
    });
  const [page, setPage] = useState<Page>("home"),
    [adult, setAdult] = useState(false),
    [launch, setLaunch] = useState<Launch | null>(null),
    [toast, setToast] = useState(""),
    [reward, setReward] = useState<{ xp: number; coins: number } | null>(null),
    [event, setEvent] = useState<Tournament | null>(null),
    [eventDetail, setEventDetail] = useState<any>(null),
    [rules, setRules] = useState(false),
    [locked, setLocked] = useState<Venue | null>(null),
    [deleting, setDeleting] = useState(false),
    [deleteText, setDeleteText] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const retryVerification = useRef<(() => void) | null>(null);
  const [name, setName] = useState(""),
    [country, setCountry] = useState(""),
    [avatar, setAvatar] = useState(0);
  const launchRef = useRef<Launch | null>(null),
    submitted = useRef(false),
    verifying = useRef<Launch | null>(null);
  const bootstrap = async () => {
    setBoot(true);
    setError("");
    try {
      const [cat, cfg] = await Promise.all([
        api<Catalog>("/catalog"),
        api<ProviderConfig>("/config"),
      ]);
      setCatalog(cat);
      setConfig(cfg);
      if (await restoreToken()) {
        try {
          setPlayer(await api<Player>("/me"));
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) await clearToken();
          else throw e;
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBoot(false);
      void SplashScreen.hideAsync();
    }
  };
  useEffect(() => {
    void bootstrap();
  }, []);
  useEffect(() => {
    if (player) {
      setName(player.name);
      setCountry(player.country);
      setAvatar(player.avatar);
    }
  }, [player]);
  useEffect(() => {
    launchRef.current = launch;
    submitted.current = false;
  }, [launch]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(
    () =>
      session.subscribe(() => {
        const l = launchRef.current;
        if (
          !l ||
          l.kind === "free" ||
          l.kind === "local" ||
          session.running ||
          !session.shots ||
          submitted.current ||
          verifying.current === l ||
          retryVerification.current ||
          session.drill !== l.drill
        )
          return;
        if (session.usedPlacement) {
          setToast(
            "Ball placement is for free practice. Restart this challenge to earn its reward.",
          );
          submitted.current = true;
          return;
        }
        const ids = session.world.balls
            .filter((b) => b.id !== 0 && b.pocketed)
            .map((b) => b.id),
          targets = l.challenge?.targets || [1];
        const complete = targets.length
          ? targets.every((id) => ids.includes(id))
          : ids.some((id) => id !== 8);
        if (!complete || session.progress.scratch) return;
        const body =
          l.kind === "event"
            ? { shots: [...session.replayShots] }
            : { ticket: l.ticket, shots: [...session.replayShots] };
        const submit = () => {
          verifying.current = l;
          setVerificationError("");
          api(
            l.kind === "event"
              ? `/tournaments/${l.eventId}/submit`
              : "/practice/complete",
            "POST",
            body,
          )
            .then((result) => {
              setPlayer(result.player);
              if (launchRef.current === l) {
                submitted.current = true;
                retryVerification.current = null;
                setReward(result.reward);
              }
            })
            .catch((e) => {
              if (launchRef.current === l) {
                retryVerification.current = submit;
                setVerificationError(e.message);
              }
            })
            .finally(() => {
              if (verifying.current === l) verifying.current = null;
            });
        };
        submit();
      }),
    [],
  );
  const working = useRef(false);
  async function work(fn: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const guest = () =>
    work(async () => {
      if (!adult) throw new Error("Confirm you are 18 or older to continue.");
      const result = await api("/auth/guest", "POST", { adultConfirmed: true });
      await saveToken(result.token);
      setPlayer(result.player);
    });
  const login = (provider: "google" | "apple") =>
    work(async () => {
      if (!player && !adult)
        throw new Error("Confirm you are 18 or older to continue.");
      const result = await signInProvider(provider, config);
      await saveToken(result.token);
      setPlayer(result.player);
      setToast(
        result.switchedAccount
          ? "Signed in to your existing account. Its saved progress is loaded."
          : "Account connected. Your progress is saved.",
      );
    });
  const selected =
    catalog?.venues.find((v) => v.id === player?.selectedTable) ||
    catalog?.venues[0];
  function openGame(l: Launch, v = selected) {
    if (!v) return;
    setVerificationError("");
    setToast("");
    retryVerification.current = null;
    session.cpu = l.opponent || null;
    session.matchRules = l.kind === "local";
    session.cueIds = [player?.selectedCue || "club", "club"];
    session.skin = v.skin;
    session.reset(l.drill);
    launchRef.current = l;
    submitted.current = false;
    setSearchVenue(null);
    setLaunch(l);
  }
  const enterLocal = (v: Venue, mode: "local" | "cpu" = "local") =>
    work(async () => {
      const active = await api("/local-matches/active");
      if (active) {
        // Reloaded racks cannot be restored yet. Show a recoverable forfeit choice.
        setSearchVenue(null);
        setAbandoned(active);
        return;
      }
      if (entryRequest.current?.venueId !== v.id)
        entryRequest.current = { venueId: v.id, id: Crypto.randomUUID() };
      const result = await api("/local-matches/start", "POST", {
        venueId: v.id,
        requestId: entryRequest.current.id,
        mode,
      });
      setPlayer(result.player);
      entryRequest.current = null;
      openGame(
        {
          kind: "local",
          drill: "break",
          matchId: result.match.id,
          venue: v,
          opponent: result.match.opponent,
        },
        v,
      );
    });
  const [searchVenue, setSearchVenue] = useState<Venue | null>(null);
  const [abandoned, setAbandoned] = useState<any>(null);
  const finishLocal = () =>
    work(async () => {
      if (!launch?.matchId) return;
      const winner = localWinner(session.progress);
      const result = await api(
        `/local-matches/${launch.matchId}/finish`,
        "POST",
        {
          outcome: winner === null ? "forfeit" : winner === 0 ? "won" : "lost",
        },
      );
      setPlayer(result.player);
      setToast(
        winner === null
          ? "Match forfeited. Entry fee was not refunded."
          : winner === 0
            ? "You won the match."
            : `${launch.opponent?.name || "Player 2"} won the match.`,
      );
      leaveGame();
      setPage("matches");
    });
  const equip = (v: Venue) =>
    work(async () => {
      if (!player) return;
      if (player.level < v.level) {
        setLocked(v);
        return;
      }
      setPlayer(await api<Player>("/me/table", "POST", { tableId: v.id }));
      setToast(`${v.name} equipped.`);
    });
  const startChallenge = (c: Challenge) =>
    work(async () => {
      const result = await api("/practice/start", "POST", {
        challengeId: c.id,
        tableId: selected!.id,
      });
      openGame({
        kind: "practice",
        drill: c.drill,
        challenge: c,
        ticket: result.ticket,
      });
    });
  const viewEvent = (t: Tournament) => {
    setEvent(t);
    setEventDetail(null);
    setRules(false);
    void api(`/tournaments/${t.id}`)
      .then(setEventDetail)
      .catch((e) => setToast(e.message));
  };
  const enterEvent = () =>
    work(async () => {
      if (!event) return;
      await api(`/tournaments/${event.id}/enter`, "POST", {
        acceptRules: rules,
      });
      const id = event.id;
      setEvent(null);
      openGame({ kind: "event", drill: "pocket", eventId: id });
    });
  const leaveGame = () => {
    session.cpu = null;
    setVerificationError("");
    retryVerification.current = null;
    setLaunch(null);
    launchRef.current = null;
    setPage("home");
  };
  const topMessage = toast ? (
    <View style={u.toast} accessibilityLiveRegion="polite">
      <Text style={u.toastText}>{toast}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss message"
        onPress={() => setToast("")}
        style={{ padding: 10 }}
      >
        <Text style={{ color: "#fff" }}>×</Text>
      </Pressable>
    </View>
  ) : null;
  const verificationModal = (
    <Modal
      visible={!!verificationError}
      transparent
      animationType="fade"
      onRequestClose={() => setVerificationError("")}
    >
      <View style={u.scrim}>
        <ScrollView
          style={u.eventModal}
          contentContainerStyle={{ padding: 24, gap: 14 }}
        >
          <Text style={u.modalTitle}>Your result is waiting.</Text>
          <Text style={u.body}>{verificationError}</Text>
          <Text style={u.body}>
            Retry this shot submission without playing it again. A reward can
            only be collected once.
          </Text>
          <Action
            label="Retry verification"
            onPress={() => retryVerification.current?.()}
          />
          <Action secondary label="Return to club" onPress={leaveGame} />
        </ScrollView>
      </View>
    </Modal>
  );
  const rewardModal = (
    <Modal visible={reward !== null} transparent animationType="fade">
      <View style={u.scrim}>
        <ScrollView
          style={[u.eventModal, { maxWidth: 470 }]}
          contentContainerStyle={{ padding: 24, gap: 12 }}
        >
          <Tag gold>CHALLENGE VERIFIED</Tag>
          <Text style={u.modalTitle}>A shot worth keeping.</Text>
          <Text style={u.body}>
            {reward?.xp || reward?.coins
              ? [
                  reward?.xp ? `+${reward.xp} XP` : null,
                  reward?.coins ? `+${reward.coins} coins` : null,
                ]
                  .filter(Boolean)
                  .join("   ·   ")
              : "Challenge complete. Your first-clear reward was already collected."}
          </Text>
          <Text style={u.body}>
            Your progress is saved. Level {player?.level} ·{" "}
            {money(player?.coins || 0)} coins
          </Text>
          <Action
            label="Back to the club"
            onPress={() => {
              setReward(null);
              leaveGame();
            }}
          />
          <Action
            secondary
            label="Keep practicing"
            onPress={() => setReward(null)}
          />
        </ScrollView>
      </View>
    </Modal>
  );
  if (searchVenue && player && !launch)
    return (
      <MatchSearch
        venue={searchVenue}
        player={player}
        busy={busy}
        error={toast}
        onCancel={() => setSearchVenue(null)}
        onPlay={() => {
          void enterLocal(searchVenue, "cpu");
        }}
      />
    );
  if (launch && player)
    return (
      <View style={{ flex: 1 }}>
        <TableGame
          onExit={launch.kind === "local" ? finishLocal : leaveGame}
          paidMatch={launch.kind === "local"}
          entryFee={launch.venue?.entry || 0}
          exitBusy={busy}
          exitError={toast}
          playerName={player.name}
          playerAvatar={player.avatar}
          modeLabel={
            launch.kind === "local"
              ? `${launch.venue?.name} · ${launch.venue?.entry} coins`
              : launch.kind === "event"
                ? "PRECISION OPEN"
                : launch.challenge?.name || "LOCAL PRACTICE"
          }
          allowedSkins={catalog!.venues
            .filter((v) => v.level <= player.level)
            .map((v) => v.skin)}
        />
        {topMessage}
        {rewardModal}
        {verificationModal}
      </View>
    );
  if (offline)
    return (
      <TableGame
        onExit={() => setOffline(false)}
        playerName="YOU"
        modeLabel="OFFLINE PRACTICE"
        allowedSkins={[0]}
      />
    );
  if (boot || error)
    return (
      <ImageBackground
        source={welcome}
        imageStyle={{ width: "100%", height: "100%" }}
        style={u.fill}
      >
        <LinearGradient colors={["#07111a55", "#07111aee"]} style={u.loading}>
          <Text style={u.logoLarge}>
            CUE<Text style={{ color: "#e8c589" }}>MASTER</Text>
          </Text>
          <Text style={u.kicker}>REAL PHYSICS. REAL RIVALS.</Text>
          {boot ? (
            <>
              <ActivityIndicator color="#dfbd7a" style={{ marginTop: 35 }} />
              <Text style={u.body}>Opening the club…</Text>
            </>
          ) : (
            <>
              <Text style={u.body}>{error}</Text>
              <Action label="Try again" onPress={() => void bootstrap()} />
              <Text style={u.body}>
                Profiles and rewards need a connection. You can still practice
                offline.
              </Text>
              <Action
                secondary
                label="Practice offline"
                onPress={() => {
                  session.skin = 0;
                  session.reset("break");
                  setOffline(true);
                }}
              />
            </>
          )}
        </LinearGradient>
      </ImageBackground>
    );
  if (!player)
    return (
      <View style={u.fill}>
        <StatusBar hidden />
        <ImageBackground
          source={welcome}
          imageStyle={{ width: "100%", height: "100%" }}
          style={u.fill}
        >
          <LinearGradient
            colors={["#06111bfa", "#07111be0", "#07111b25"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[
              u.welcome,
              {
                paddingTop: insets.top + 24,
                paddingBottom: insets.bottom + 24,
                paddingLeft: insets.left + (small ? 26 : 64),
              },
            ]}
          >
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: "center",
                maxWidth: 470,
                paddingRight: 24,
              }}
            >
              <Text style={u.logo}>
                CUE<Text style={{ color: "#e8c589" }}>MASTER</Text>
              </Text>
              <Text
                style={[
                  u.welcomeTitle,
                  compact && { fontSize: 34, marginTop: 16 },
                ]}
              >
                Your next{"\n"}great shot.
              </Text>
              <Text style={u.welcomeCopy}>
                Find your rhythm. Earn your table.{"\n"}Make your name.
              </Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: adult }}
                accessibilityLabel="I am 18 or older"
                onPress={() => setAdult(!adult)}
                style={u.checkRow}
              >
                <Text style={u.checkbox}>{adult ? "☑" : "□"}</Text>
                <Text style={u.body}>I am 18 or older</Text>
              </Pressable>
              <Action
                label={busy ? "Opening…" : "Enter as guest"}
                onPress={guest}
                disabled={busy}
              />
              <Text style={u.fine}>
                Your guest progress saves on this device. Connect an account to
                keep it across devices.
              </Text>
              <View style={[u.row, { flexWrap: "wrap" }]}>
                <ProviderButton
                  provider="google"
                  onPress={() => login("google")}
                  disabled={busy}
                />
                {(Platform.OS === "ios" || Platform.OS === "web") && (
                  <ProviderButton
                    provider="apple"
                    onPress={() => login("apple")}
                    disabled={busy}
                  />
                )}
              </View>
              <Text style={u.fine}>Sign in or register with your account.</Text>
            </ScrollView>
          </LinearGradient>
        </ImageBackground>
        {topMessage}
      </View>
    );
  return (
    <View
      style={{ flex: 1, justifyContent: "center", backgroundColor: "#060c13" }}
    >
      <View
        style={[
          u.shell,
          {
            flexGrow: 0,
            flexShrink: 0,
            flexBasis: "auto",
            width: "100%",
            height: Math.min(height, (width * 9) / 16),
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <Image
          source={clubRoom}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
        />
        <LinearGradient
          colors={["#07151033", "#08191112", "#04110d88"]}
          style={StyleSheet.absoluteFill}
        />
        <StatusBar hidden />
        <View
          style={[
            u.topbar,
            {
              height: 56,
              paddingHorizontal: 18,
              backgroundColor: "#081512df",
              borderBottomColor: "#dcc28c30",
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            accessibilityState={{ selected: page === "profile" }}
            onPress={() => setPage("profile")}
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              source={portraits[player.avatar]}
              style={[
                u.avatar,
                page === "profile" && {
                  borderColor: "#e1c18a",
                  borderWidth: 2,
                },
              ]}
            />
          </Pressable>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <IconButton
              icon="home"
              label="Home"
              selected={page === "home"}
              onPress={() => setPage("home")}
            />
            <IconButton
              icon="grid"
              label="Tables"
              selected={page === "tables"}
              onPress={() => setPage("tables")}
            />
            <IconButton
              icon="target"
              label="Practice"
              selected={page === "practice"}
              onPress={() => setPage("practice")}
            />
            <IconButton
              icon="award"
              label="Events"
              selected={page === "events"}
              onPress={() => setPage("events")}
            />
          </View>
          <View style={[u.topRight, { gap: 16 }]}>
            <Text style={u.coins}>◉ {money(player.coins)}</Text>
          </View>
        </View>
        {page === "wallet" || page === "leaderboard" || page === "blocked" ? (
          <AccountCenter
            key={page}
            area={page}
            player={player}
            onClose={() => setPage("profile")}
          />
        ) : page === "cues" ? (
          <CueShop
            player={player}
            busy={busy}
            onClose={() => setPage("home")}
            onEquip={(cueId) =>
              work(async () => {
                setPlayer(await api<Player>("/me/cue", "POST", { cueId }));
                setToast("Cue equipped.");
              })
            }
          />
        ) : page === "matches" ? (
          <MatchVenues
            venues={catalog!.venues}
            player={player}
            busy={busy}
            onEnter={(v, mode) => {
              setToast("");
              if (mode === "local") void enterLocal(v);
              else setSearchVenue(v);
            }}
            onClose={() => setPage("home")}
          />
        ) : page !== "profile" ? (
          <Lobby
            key={page}
            page={page}
            player={player}
            catalog={catalog!}
            selected={selected!}
            busy={busy}
            onPage={setPage}
            onPlay={() => setPage("matches")}
            onCues={() => setPage("cues")}
            onFree={() => openGame({ kind: "free", drill: "open" })}
            onEquip={equip}
            onChallenge={startChallenge}
            onEvent={viewEvent}
            onGift={() =>
              work(async () => {
                const result = await api("/me/daily", "POST");
                setPlayer(result.player);
                setToast(
                  result.claimed
                    ? "100 coins added to your balance."
                    : "Already collected today.",
                );
              })
            }
          />
        ) : (
          <ScrollView
            style={u.content}
            contentContainerStyle={[u.contentInner, { padding: 20 }]}
          >
            {page === "profile" && (
              <>
                <Text style={u.kicker}>YOUR PLACE IN THE CLUB</Text>
                <Text style={u.heading}>Player profile</Text>
                <View
                  style={[
                    u.row,
                    { alignItems: "flex-start", flexWrap: "wrap" },
                  ]}
                >
                  <View style={[u.feature, { flex: 1, minWidth: 240 }]}>
                    <View style={u.row}>
                      <Image
                        source={portraits[player.avatar]}
                        style={u.profileAvatar}
                      />
                      <View>
                        <Text style={u.cardTitle}>
                          {player.name} {flag(player.country)}
                        </Text>
                        <Text style={u.body}>
                          Level {player.level} ·{" "}
                          {player.guest ? "Guest player" : "Connected account"}
                        </Text>
                        <Text style={u.rewardText}>{player.xp} XP</Text>
                      </View>
                    </View>
                    <View style={u.progressTrack}>
                      <View
                        style={[
                          u.progressFill,
                          { width: `${player.xp % 100}%` },
                        ]}
                      />
                    </View>
                    <View style={u.stats}>
                      <View>
                        <Text style={u.statValue}>{player.stats.finishes}</Text>
                        <Text style={u.fine}>CHALLENGES</Text>
                      </View>
                      <View>
                        <Text style={u.statValue}>
                          {
                            catalog!.venues.filter(
                              (v) => v.level <= player.level,
                            ).length
                          }
                        </Text>
                        <Text style={u.fine}>TABLES OPEN</Text>
                      </View>
                      <View>
                        <Text style={u.statValue}>{money(player.coins)}</Text>
                        <Text style={u.fine}>COINS</Text>
                      </View>
                    </View>
                    <Text style={u.body}>
                      Head-to-head · {player.stats.cpuWins || 0} wins ·{" "}
                      {player.stats.cpuLosses || 0} losses ·{" "}
                      {Math.round(
                        (100 * (player.stats.cpuWins || 0)) /
                          Math.max(
                            1,
                            (player.stats.cpuWins || 0) +
                              (player.stats.cpuLosses || 0),
                          ),
                      )}
                      % wins
                    </Text>
                    <Text style={u.body}>
                      Current form · {Math.abs(player.stats.cpuStreak || 0)}{" "}
                      {(player.stats.cpuStreak || 0) < 0 ? "losses" : "wins"} in
                      a row
                    </Text>
                    <Text style={u.body}>
                      Pass & play · {player.stats.localWins || 0} wins ·{" "}
                      {player.stats.localLosses || 0} losses
                    </Text>
                    <Text style={u.fieldLabel}>PLAYER NAME</Text>
                    <TextInput
                      accessibilityLabel="Player name"
                      value={name}
                      onChangeText={setName}
                      maxLength={24}
                      style={u.input}
                    />
                    <Text style={u.fieldLabel}>COUNTRY · TWO-LETTER CODE</Text>
                    <TextInput
                      accessibilityLabel="Country code"
                      value={country}
                      onChangeText={(v) => setCountry(v.toUpperCase())}
                      maxLength={2}
                      autoCapitalize="characters"
                      placeholder="NG, US, GB…"
                      placeholderTextColor="#65758a"
                      style={u.input}
                    />
                    <Text style={u.fieldLabel}>AVATAR</Text>
                    <View style={u.row}>
                      {portraits.map((p, i) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Choose avatar ${i + 1}`}
                          key={i}
                          onPress={() => setAvatar(i)}
                          style={[
                            u.avatarChoice,
                            avatar === i && { borderColor: "#e0be81" },
                          ]}
                        >
                          <Image
                            source={p}
                            style={{ width: 56, height: 56, borderRadius: 28 }}
                          />
                        </Pressable>
                      ))}
                    </View>
                    <Action
                      label="Save profile"
                      disabled={busy}
                      onPress={() =>
                        work(async () => {
                          setPlayer(
                            await api<Player>("/me", "PATCH", {
                              name,
                              country,
                              avatar,
                            }),
                          );
                          setToast("Profile saved.");
                        })
                      }
                    />
                  </View>
                  <View style={[u.feature, { flex: 1, minWidth: 240 }]}>
                    <Text style={u.cardTitle}>Club & rewards</Text>
                    <Action
                      label="USDC rewards"
                      onPress={() => setPage("wallet")}
                    />
                    <Action
                      label="Leaderboard"
                      onPress={() => setPage("leaderboard")}
                    />
                    <Action
                      secondary
                      label="Blocked players"
                      onPress={() => setPage("blocked")}
                    />
                    <View style={u.divider} />
                    <Text style={u.cardTitle}>Keep your progress.</Text>
                    <Text style={u.body}>
                      {player.guest
                        ? "Connect a new Google or Apple account to preserve this guest profile. Signing into an existing account loads its saved progress."
                        : "Your progress is stored with your connected account."}
                    </Text>
                    <View style={{ gap: 10, marginTop: 16 }}>
                      <ProviderButton
                        provider="google"
                        connected={player.providers.includes("google")}
                        disabled={busy}
                        onPress={() => login("google")}
                      />
                      {(Platform.OS === "ios" || Platform.OS === "web") && (
                        <ProviderButton
                          provider="apple"
                          connected={player.providers.includes("apple")}
                          disabled={busy}
                          onPress={() => login("apple")}
                        />
                      )}
                    </View>
                    <View style={u.divider} />
                    <Text style={u.cardTitle}>Your account, your choice.</Text>
                    <Text style={u.body}>
                      Guest access is tied to this device. Sign in before
                      signing out if you want to keep access to your guest
                      progress.
                    </Text>
                    <Action
                      secondary
                      label="Sign out"
                      disabled={busy}
                      onPress={() =>
                        work(async () => {
                          try {
                            await api("/auth/logout", "POST");
                          } catch (e) {
                            if (!(e instanceof ApiError && e.status === 401))
                              throw e;
                          }
                          await clearToken();
                          setPlayer(null);
                          setAdult(false);
                        })
                      }
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete account"
                      onPress={() => {
                        setDeleteText("");
                        setDeleting(true);
                      }}
                    >
                      <Text style={u.danger}>Delete account</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        )}
        {topMessage}
        <Modal
          visible={!!abandoned}
          transparent
          animationType="fade"
          onRequestClose={() => setAbandoned(null)}
        >
          <View style={u.scrim}>
            <View style={u.eventModal}>
              <Text style={u.modalTitle}>Unfinished local match</Text>
              <Text style={u.body}>
                Your previous rack was interrupted. Quit it to enter another
                venue. This records a loss; the entry fee is not refunded.
              </Text>
              <Action
                label="Keep it open"
                secondary
                onPress={() => setAbandoned(null)}
              />
              <Action
                label="Quit interrupted match"
                disabled={busy}
                onPress={() =>
                  work(async () => {
                    const r = await api(
                      `/local-matches/${abandoned.id}/finish`,
                      "POST",
                      { outcome: "forfeit" },
                    );
                    setPlayer(r.player);
                    setAbandoned(null);
                    entryRequest.current = null;
                  })
                }
              />
            </View>
          </View>
        </Modal>
        {rewardModal}
        <Modal
          transparent
          visible={locked !== null}
          animationType="fade"
          onRequestClose={() => setLocked(null)}
        >
          <View style={u.scrim}>
            <ScrollView
              style={[u.eventModal, { maxWidth: 470 }]}
              contentContainerStyle={{ padding: 24, gap: 12 }}
            >
              <Image
                source={locked ? venueArt[locked.id] : welcome}
                style={u.modalImage}
              />
              <Tag gold>LEVEL {locked?.level}</Tag>
              <Text style={u.modalTitle}>{locked?.name}</Text>
              <Text style={u.body}>
                Earn {Math.max(0, ((locked?.level || 1) - 1) * 100 - player.xp)}{" "}
                more XP to open this room. Practice challenges award 100 XP on
                your first completion.
              </Text>
              <Action
                label="Visit practice lab"
                onPress={() => {
                  setLocked(null);
                  setPage("practice");
                }}
              />
              <Action secondary label="Close" onPress={() => setLocked(null)} />
            </ScrollView>
          </View>
        </Modal>
        <Modal
          transparent
          visible={event !== null}
          animationType="fade"
          onRequestClose={() => setEvent(null)}
        >
          <View style={u.scrim}>
            <ScrollView
              style={u.eventModal}
              contentContainerStyle={{ padding: 26, gap: 14 }}
            >
              <View style={u.between}>
                <Tag gold={event?.kind === "crypto"}>
                  {event?.status === "open"
                    ? "OPEN · PRESEASON"
                    : "ANNOUNCED · ENTRIES CLOSED"}
                </Tag>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close event"
                  onPress={() => setEvent(null)}
                  style={u.close}
                >
                  <Text style={{ color: "#fff", fontSize: 24 }}>×</Text>
                </Pressable>
              </View>
              <Text style={u.modalTitle}>{event?.name}</Text>
              <Text style={u.rewardText}>{event?.prize}</Text>
              <Text style={u.body}>{event?.description}</Text>
              <Text style={u.fieldLabel}>EVENT RULES</Text>
              {event?.rules.map((r, i) => (
                <Text key={r} style={u.body}>
                  {i + 1}. {r}
                </Text>
              ))}
              {event?.status === "open" ? (
                <>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: rules }}
                    accessibilityLabel="Accept event rules"
                    onPress={() => setRules(!rules)}
                    style={u.checkRow}
                  >
                    <Text style={u.checkbox}>{rules ? "☑" : "□"}</Text>
                    <Text style={u.body}>
                      I’ve read and accept these event rules.
                    </Text>
                  </Pressable>
                  <Action
                    label="Enter free challenge"
                    disabled={busy || !rules}
                    onPress={enterEvent}
                  />
                  <Text style={u.fieldLabel}>VERIFIED LEADERBOARD</Text>
                  {!eventDetail ? (
                    <ActivityIndicator color="#d6b675" />
                  ) : eventDetail.leaderboard.length ? (
                    eventDetail.leaderboard.map((r: any, i: number) => (
                      <View key={i} style={u.leaderRow}>
                        <Text style={u.name}>
                          {i + 1}. {r.name} {flag(r.country)}
                        </Text>
                        <Text style={u.body}>
                          {r.shots} shot{r.shots === 1 ? "" : "s"}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={u.body}>
                      No verified scores yet. Set the first mark.
                    </Text>
                  )}
                </>
              ) : (
                <View style={u.announcement}>
                  <Text style={u.body}>
                    Registration, entry payments and payouts are not active.
                    We’ll publish the funded pool and confirmed dates before
                    this event opens.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Modal>
        <Modal
          transparent
          visible={deleting}
          animationType="fade"
          onRequestClose={() => setDeleting(false)}
        >
          <View style={u.scrim}>
            <ScrollView
              style={[u.eventModal, { maxWidth: 470 }]}
              contentContainerStyle={{ padding: 24, gap: 12 }}
            >
              <Text style={u.modalTitle}>Delete your account?</Text>
              <Text style={u.body}>
                Your profile, progress and event entries will be permanently
                deleted. Type DELETE to confirm.
              </Text>
              <TextInput
                accessibilityLabel="Delete confirmation"
                value={deleteText}
                onChangeText={setDeleteText}
                autoCapitalize="characters"
                style={u.input}
              />
              <Action
                label="Permanently delete account"
                disabled={deleteText !== "DELETE" || busy}
                onPress={() =>
                  work(async () => {
                    await api("/me", "DELETE", { confirm: "DELETE" });
                    await clearToken();
                    setDeleting(false);
                    setPlayer(null);
                    setAdult(false);
                  })
                }
              />
              <Action
                secondary
                label="Keep my account"
                onPress={() => setDeleting(false)}
              />
            </ScrollView>
          </View>
        </Modal>
      </View>
    </View>
  );
}
const u = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#101815" },
  shell: { flex: 1, backgroundColor: "#101815" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 30,
  },
  logoLarge: {
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: 5,
    color: "#f3f4ef",
  },
  logo: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2.5,
    color: "#f3f4ef",
  },
  kicker: {
    color: "#d4e8f6",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.7,
  },
  welcome: { flex: 1 },
  welcomeTitle: {
    fontSize: 58,
    lineHeight: 64,
    fontWeight: "800",
    letterSpacing: -2,
    color: "#f4f4ec",
    marginTop: 35,
  },
  welcomeCopy: {
    color: "#bbc9d4",
    fontSize: 16,
    lineHeight: 25,
    marginVertical: 20,
  },
  body: { color: "#d4e8f6", fontSize: 12, lineHeight: 19 },
  fine: { color: "#bad8ed", fontSize: 11, lineHeight: 15, marginTop: 4 },
  checkRow: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    minHeight: 44,
    marginVertical: 6,
  },
  checkbox: { fontSize: 23, color: "#ffd05b" },
  row: { flexDirection: "row", gap: 14 },
  action: {
    minHeight: 44,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 9,
    backgroundColor: "#e1c18a",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  secondary: {
    backgroundColor: "#1a2b3b",
    borderWidth: 1,
    borderColor: "#314456",
  },
  actionText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#122230",
  },
  topbar: {
    height: 76,
    paddingHorizontal: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1b2c3c",
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: 25 },
  coins: { color: "#ffd05b", fontSize: 14, fontWeight: "700" },
  identity: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    minHeight: 44,
  },
  avatar: {
    width: 40,
    height: 40,
    backgroundColor: "#254338",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#4f7163",
  },
  name: { fontSize: 12, fontWeight: "700", color: "#ecf1f6" },
  main: { flex: 1, flexDirection: "row" },
  nav: {
    width: 80,
    borderRightWidth: 1,
    borderRightColor: "#1b2c3c",
    paddingTop: 20,
    gap: 10,
    alignItems: "center",
  },
  navItem: {
    width: 64,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 12,
  },
  navActive: { backgroundColor: "#d1b27313" },
  navIcon: { fontSize: 24, color: "#d4e8f6" },
  navLabel: { fontSize: 11, color: "#d4e8f6" },
  content: { flex: 1 },
  contentInner: {
    padding: 30,
    paddingBottom: 40,
    maxWidth: 1500,
    width: "100%",
    alignSelf: "center",
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
    gap: 10,
  },
  heading: {
    fontSize: 28,
    fontWeight: "700",
    color: "#eff3f4",
    letterSpacing: -0.7,
    marginVertical: 9,
  },
  subheading: { fontSize: 19, fontWeight: "700", color: "#eff3f4" },
  hero: {
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#344656",
  },
  heroShade: { flex: 1, padding: 28, gap: 12 },
  heroTitle: {
    fontSize: 42,
    lineHeight: 47,
    fontWeight: "800",
    letterSpacing: -1.2,
    color: "#f5f2e8",
  },
  heroCopy: { color: "#a9bdcc", fontSize: 12 },
  tag: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: "#98d5c4",
    backgroundColor: "#49a58717",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 5,
    overflow: "hidden",
  },
  feature: {
    padding: 22,
    borderRadius: 15,
    backgroundColor: "#18231f",
    borderWidth: 1,
    borderColor: "#263a49",
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#edf2f5",
    marginTop: 7,
    marginBottom: 4,
  },
  link: { fontSize: 11, fontWeight: "700", color: "#d8be8e", marginTop: 8 },
  eventBanner: {
    padding: 24,
    backgroundColor: "#16252f",
    borderWidth: 1,
    borderColor: "#465047",
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventSymbol: { fontSize: 47, color: "#c8ad77" },
  progressTrack: {
    height: 5,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "#263544",
    marginTop: 18,
    marginBottom: 8,
  },
  progressFill: { height: 5, backgroundColor: "#d4ba81" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginVertical: 24 },
  tableCard: {
    borderWidth: 1,
    borderColor: "#293d4c",
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#122230",
  },
  tableImage: { width: "100%", height: 150 },
  cardPad: { padding: 15 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  challengeCard: {
    padding: 19,
    backgroundColor: "#18231f",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#2c3d4b",
  },
  challengeNo: { fontSize: 30, fontWeight: "300", color: "#496374" },
  rewardText: {
    color: "#e2c68e",
    fontSize: 12,
    fontWeight: "600",
    marginVertical: 12,
  },
  eventCard: {
    padding: 23,
    borderWidth: 1,
    borderColor: "#304352",
    backgroundColor: "#202b26",
    borderRadius: 16,
  },
  eventTitle: {
    fontSize: 27,
    fontWeight: "700",
    color: "#f2efdf",
    marginVertical: 10,
  },
  profileAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#274437",
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 18,
  },
  statValue: { fontSize: 25, fontWeight: "700", color: "#eef2f5" },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#8fa8bb",
    marginTop: 15,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#3c5264",
    backgroundColor: "#111c17",
    borderRadius: 8,
    paddingHorizontal: 13,
    color: "#eef3f8",
    fontSize: 14,
    marginTop: 8,
  },
  avatarChoice: {
    borderWidth: 2,
    borderColor: "#2b4254",
    borderRadius: 30,
    backgroundColor: "#26352d",
    marginTop: 8,
  },
  divider: { height: 1, backgroundColor: "#2c3e4d", marginVertical: 20 },
  danger: {
    color: "#e8a291",
    fontSize: 12,
    marginTop: 18,
    paddingVertical: 12,
  },
  toast: {
    position: "absolute",
    bottom: 18,
    left: 25,
    right: 25,
    backgroundColor: "#243d4df5",
    borderWidth: 1,
    borderColor: "#628394",
    borderRadius: 12,
    paddingLeft: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 100,
  },
  toastText: { color: "#f2f4ec", fontSize: 12, lineHeight: 18, flex: 1 },
  scrim: {
    flex: 1,
    backgroundColor: "#02070dc9",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modal: {
    backgroundColor: "#202b26",
    borderWidth: 1,
    borderColor: "#415868",
    padding: 24,
    borderRadius: 20,
    width: "100%",
    maxWidth: 470,
    gap: 12,
    maxHeight: "95%",
  },
  modalTitle: { color: "#f5f2e7", fontSize: 27, fontWeight: "700" },
  modalImage: { height: 130, width: "100%", borderRadius: 12 },
  eventModal: {
    backgroundColor: "#202b26",
    borderWidth: 1,
    borderColor: "#415868",
    borderRadius: 20,
    width: "100%",
    maxWidth: 630,
    maxHeight: "92%",
    flexGrow: 0,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  leaderRow: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#2a4253",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  announcement: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: "#d4b06b15",
    marginVertical: 8,
  },
});
