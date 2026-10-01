import AccountCenter from "./AccountCenter";
import Rewards from "./Rewards";
import { Press, Enter, CountUp, PageFade, Pulse } from "./motion";
import { celebrate } from "./feedback";
import MatchSearch from "./MatchSearch";
import { CpuOpponent, seededRandom } from "../game/cpu";
import {
  eventState,
  formatLabel,
  framesToWin,
  countdown,
  whenLocal,
} from "./events";
import CueShop from "./CueShop";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
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
  Linking,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";
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
  EventDetail,
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
  | "rewards"
  | "leaderboard"
  | "blocked";
type Launch = {
  kind: "free" | "practice" | "event" | "local";
  drill: string;
  ticket?: string;
  challenge?: Challenge;
  eventId?: string;
  /** Series events: the frame the server opened, its seed and its number in the series. */
  format?: "drill" | "series";
  event?: Tournament;
  frameId?: string;
  frameNumber?: number;
  seed?: number;
  matchId?: string;
  opponent?: CpuOpponent;
  venue?: Venue;
};
/** A live clock towards a server timestamp, corrected by the server/device skew. */
function Countdown({
  to,
  skew,
  label,
  expired,
  onExpire,
}: {
  to: string;
  skew: number;
  label: string;
  expired: string;
  /** Fires once when the clock reaches zero, so the sheet can move to its next phase itself. */
  onExpire?: () => void;
}) {
  const [, tick] = useState(0);
  const fired = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Date.parse(to) - (Date.now() + skew);
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      // A second of grace so the server's own clock has certainly passed the mark too.
      const timer = setTimeout(() => onExpire?.(), 1200);
      return () => clearTimeout(timer);
    }
  }, [left <= 0]);
  const urgent = left > 0 && left < 5 * 60000;
  return (
    <View style={u.countdown}>
      <Text style={[u.fieldLabel, { marginTop: 0 }]}>
        {left > 0 ? label : expired}
      </Text>
      <Pulse active={urgent}>
        <Text style={[u.countdownValue, urgent && { color: "#ffb36b" }]}>
          {countdown(left)}
        </Text>
      </Pulse>
      <Text style={[u.fine, { marginTop: 2 }]}>{whenLocal(to)}</Text>
    </View>
  );
}
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
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[u.action, secondary && u.secondary, disabled && { opacity: 0.4 }]}
    >
      <Text style={[u.actionText, secondary && { color: "#e4ecf4" }]}>
        {label}
      </Text>
    </Press>
  );
}
/**
 * One tappable row: an icon chip, a label, an optional second line and a trailing chevron.
 * Used for in-app navigation and for the privacy, terms, support and deletion pages that
 * both stores require to be reachable from inside the app.
 */
function NavRow({
  icon,
  label,
  detail,
  url,
  danger = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  detail?: string;
  url?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const external = !onPress;
  const disabled = external && !url;
  const tint = danger ? "#ff9b8a" : external ? "#9fc0d6" : "#ffd05b";
  return (
    <Press
      accessibilityRole={external ? "link" : "button"}
      accessibilityLabel={external ? `${label}. Opens in your browser.` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        if (onPress) return onPress();
        setFailed(false);
        if (url) Linking.openURL(url).catch(() => setFailed(true));
      }}
      style={[
        u.navRow,
        danger && { borderColor: "#7a3a35" },
        disabled && { opacity: 0.45 },
      ]}
    >
      <View style={[u.navChip, danger && { borderColor: "#7a3a35" }]}>
        <Feather name={icon} size={16} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[u.navLabel, danger && { color: "#ffcfc6" }]}>
          {label}
        </Text>
        {!!(failed || detail) && (
          <Text
            accessibilityRole={failed ? "alert" : undefined}
            style={[u.navDetail, failed && { color: "#ffb6b6" }]}
          >
            {failed ? "Could not open this page." : detail}
          </Text>
        )}
      </View>
      <Feather
        name={external ? "external-link" : "chevron-right"}
        size={15}
        color="#7f9bb0"
      />
    </Press>
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
  const win = useWindowDimensions();
  // The app is landscape-locked, but on device the window can still report portrait numbers
  // during and after rotation, which squashed the club into a 16:9 band. Trust the orientation.
  const width = Math.max(win.width, win.height),
    height = Math.min(win.width, win.height);
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
    [eventDetail, setEventDetail] = useState<EventDetail | null>(null),
    [skew, setSkew] = useState(0),
    [forfeitPrompt, setForfeitPrompt] = useState(false),
    [rules, setRules] = useState(false),
    [locked, setLocked] = useState<Venue | null>(null),
    [deleting, setDeleting] = useState(false),
    [deleteText, setDeleteText] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const lastLevel = useRef<number | null>(null);
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
    // A level is the one piece of progress worth stopping for. Sign-in and sign-out set the
    // baseline silently; only a level gained while playing is celebrated.
    if (!player) {
      lastLevel.current = null;
      return;
    }
    if (lastLevel.current !== null && player.level > lastLevel.current) {
      setLevelUp(player.level);
      celebrate();
    }
    lastLevel.current = player.level;
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
          l.format === "series" ||
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
    session.matchRules = l.kind === "local" || l.format === "series";
    session.cpuRandom =
      l.seed === undefined ? Math.random : seededRandom(l.seed);
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
            ? result.crate
              ? `You won the match. A ${result.crate.name.toLowerCase()} is waiting in Rewards.`
              : "You won the match. Your crate slots are full — open one to make room."
            : `${launch.opponent?.name || "Player 2"} won the match.`,
      );
      leaveGame();
      setPage(winner === 0 && result.crate ? "rewards" : "matches");
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
  const loadEvent = async (id: string) => {
    const detail = await api<EventDetail>(`/tournaments/${id}`);
    setSkew(Date.parse(detail.now) - Date.now());
    setEventDetail(detail);
    setEvent(detail.event);
    // Prizes and refunds land on the server clock, not on a tap: a closed or cancelled event
    // the player entered refreshes their balance so the payout shows the moment they look.
    if (
      detail.entry &&
      (detail.phase === "closed" || detail.phase === "cancelled")
    )
      api<Player>("/me")
        .then(setPlayer)
        .catch(() => {});
    return detail;
  };
  const viewEvent = (t: Tournament) => {
    setEvent(t);
    setEventDetail(null);
    setForfeitPrompt(false);
    setRules(false);
    void loadEvent(t.id).catch((e) => setToast(e.message));
  };
  const enterEvent = () =>
    work(async () => {
      if (!event) return;
      const result = await api(`/tournaments/${event.id}/enter`, "POST", {
        acceptRules: rules,
      });
      setPlayer(result.player);
      const detail = await loadEvent(event.id);
      if (detail.phase === "play") {
        if (detail.event.format === "drill") return playDrill(detail);
        setToast("You're in. Your rival is waiting: play your first frame.");
        return;
      }
      celebrate();
      setToast(
        detail.event.entry
          ? `You're in. ${detail.event.entry.toLocaleString()} coins entered. Play opens ${whenLocal(detail.event.startsAt)}.`
          : `You're in. Play opens ${whenLocal(detail.event.startsAt)}.`,
      );
    });
  const playDrill = (detail: EventDetail) => {
    const t = detail.event;
    setEvent(null);
    openGame({
      kind: "event",
      drill: "pocket",
      eventId: t.id,
      event: t,
      format: "drill",
    });
  };
  /** Open a frame on the server, then rack up against the rival it fixed at entry. */
  const playFrame = () =>
    work(async () => {
      if (!event) return;
      try {
        const result = await api(
          `/tournaments/${event.id}/frames/start`,
          "POST",
          {},
        );
        const detail = eventDetail;
        setEvent(null);
        setForfeitPrompt(false);
        openGame({
          kind: "event",
          drill: "break",
          eventId: event.id,
          event,
          format: "series",
          frameId: result.frame.id,
          frameNumber: result.number,
          seed: result.frame.seed,
          opponent:
            result.series.opponent || detail?.series?.opponent || undefined,
        });
      } catch (e) {
        if (
          e instanceof ApiError &&
          e.status === 409 &&
          e.body?.series?.activeFrame
        ) {
          setEventDetail((d) => (d ? { ...d, series: e.body.series } : d));
          setForfeitPrompt(true);
          return;
        }
        throw e;
      }
    });
  const forfeitFrame = () =>
    work(async () => {
      const frame = eventDetail?.series?.activeFrame;
      if (!event || !frame) return;
      await api(`/tournaments/${event.id}/frames/${frame.id}/finish`, "POST", {
        outcome: "forfeit",
      });
      setForfeitPrompt(false);
      await loadEvent(event.id);
      setToast("Frame forfeited and recorded as a loss.");
    });
  /** The rack is over: report the result, then bring the player back to the event sheet. */
  const finishEventFrame = () =>
    work(async () => {
      const l = launch;
      if (!l?.eventId || !l.frameId || !l.event) return;
      const winner = localWinner(session.progress);
      const outcome =
        winner === null ? "forfeit" : winner === 0 ? "won" : "lost";
      const result = await api(
        `/tournaments/${l.eventId}/frames/${l.frameId}/finish`,
        "POST",
        { outcome },
      );
      setPlayer(result.player);
      const series = result.series;
      const record = `${series.wins}–${series.losses}`;
      setToast(
        result.flag === "fast"
          ? "That frame ended faster than a frame can be played, so the referee recorded it as a loss."
          : series.done
            ? series.wins > series.losses
              ? `Series won ${record}. ${result.reward.coins ? `${result.reward.coins} coins added. ` : ""}Prizes are paid when the event closes.`
              : `Series lost ${record}. Thanks for playing; the board settles when the event closes.`
            : outcome === "won"
              ? `Frame won. You lead ${record}; first to ${framesToWin(series.bestOf)}.`
              : outcome === "lost"
                ? `Frame lost. ${record}; first to ${framesToWin(series.bestOf)}.`
                : `Frame forfeited. ${record}.`,
      );
      if (series.done && series.wins > series.losses) celebrate();
      const t = l.event;
      leaveGame();
      setPage("events");
      viewEvent(t);
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
  const levelModal = (
    <Modal
      visible={levelUp !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setLevelUp(null)}
    >
      <View style={u.scrim}>
        <Enter style={[u.eventModal, u.levelCard]}>
          <Pulse style={u.levelBadge}>
            <Text style={u.levelNumber}>{levelUp}</Text>
          </Pulse>
          <Text style={u.modalTitle}>Level {levelUp}</Text>
          <Text style={u.body}>
            {catalog?.venues.find((v) => v.level === levelUp)
              ? `${catalog.venues.find((v) => v.level === levelUp)!.name} is open. A new room, a new table.`
              : "Your rating is climbing. Keep the run going."}
          </Text>
          <Action label="Keep playing" onPress={() => setLevelUp(null)} />
        </Enter>
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
          onExit={
            launch.kind === "local"
              ? finishLocal
              : launch.format === "series"
                ? finishEventFrame
                : leaveGame
          }
          paidMatch={launch.kind === "local" || launch.format === "series"}
          entryFee={launch.venue?.entry || 0}
          exitLabel={
            launch.format === "series" ? "Record frame & continue" : undefined
          }
          exitBusy={busy}
          exitError={toast}
          playerName={player.name}
          playerAvatar={player.avatar}
          modeLabel={
            launch.kind === "local"
              ? `${launch.venue?.name} · ${launch.venue?.entry} coins`
              : launch.kind === "event"
                ? launch.format === "series"
                  ? `FRAME ${launch.frameNumber || 1} OF ${launch.event?.bestOf || 1}\n${launch.event?.name || "EVENT"}`
                  : launch.event?.name || "PRECISION OPEN"
                : launch.challenge?.name || "LOCAL PRACTICE"
          }
          allowedSkins={catalog!.venues
            .filter((v) => v.level <= player.level)
            .map((v) => v.skin)}
        />
        {topMessage}
        {rewardModal}
        {levelModal}
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
          resizeMode="cover"
          style={u.fill}
        >
          <LinearGradient
            colors={["#081e30f5", "#081e30d9", "#081e3055", "#081e3000"]}
            locations={[0, 0.36, 0.62, 0.85]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[
              u.welcome,
              {
                paddingTop: insets.top + (compact ? 14 : 28),
                paddingBottom: insets.bottom + (compact ? 12 : 24),
                paddingLeft: insets.left + (small ? 28 : 56),
              },
            ]}
          >
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: "center",
                maxWidth: 420,
                paddingRight: 24,
              }}
            >
              <View style={u.brandRow}>
                <View style={u.brandBall} />
                <Text style={u.logo}>
                  CUE<Text style={{ color: "#ffd05b" }}>MASTER</Text>
                </Text>
              </View>
              <Text
                accessibilityRole="header"
                style={[u.welcomeTitle, compact && u.welcomeTitleCompact]}
              >
                Real physics.{"\n"}Real rivals.
              </Text>
              <Text style={u.welcomeKicker}>PLAY FOR YOUR FLAG</Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: adult }}
                accessibilityLabel="I am 18 or older"
                onPress={() => setAdult(!adult)}
                style={u.checkRow}
              >
                <Feather
                  name={adult ? "check-square" : "square"}
                  size={22}
                  color={adult ? "#24dbb3" : "#ffd05b"}
                />
                <Text style={u.checkText}>I am 18 or older</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enter as guest"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={guest}
                style={({ pressed }) => [
                  u.cta,
                  pressed && { transform: [{ scale: 0.98 }] },
                  busy && { opacity: 0.6 },
                ]}
              >
                <LinearGradient
                  colors={["#ffe08a", "#ffc53d"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={u.ctaFill}
                >
                  <Text style={u.ctaText}>
                    {busy ? "Opening the club…" : "Play as guest"}
                  </Text>
                  <Feather name="arrow-right" size={20} color="#10233a" />
                </LinearGradient>
              </Pressable>
              <Text style={u.fine}>
                Progress saves on this device. Link an account any time to keep
                it everywhere.
              </Text>
              <View style={[u.row, { flexWrap: "wrap", gap: 10 }]}>
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
            </ScrollView>
          </LinearGradient>
          {width >= 780 && (
            <View
              style={[
                u.welcomeChips,
                { top: insets.top + 22, right: insets.right + 22 },
              ]}
              accessible
              accessibilityLabel="Real cushion physics. Six city venues. Verified challenges."
            >
              {[
                ["activity", "Real cushion physics"],
                ["map-pin", "6 city venues"],
                ["award", "Verified challenges"],
              ].map(([icon, label]) => (
                <View key={label} style={u.welcomeChip}>
                  <Feather name={icon as any} size={13} color="#ffd05b" />
                  <Text style={u.welcomeChipText}>{label}</Text>
                </View>
              ))}
            </View>
          )}
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
            width: "100%",
            height: Math.min(height, (width * 9) / 16),
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
        {/* Vignette: dark edges, lit centre, so the room reads as a lamp-lit space
            rather than a flat backdrop. Two crossed gradients beat a blurred PNG. */}
        <LinearGradient
          pointerEvents="none"
          colors={["#020a10cc", "#020a1000", "#020a1000", "#020a10cc"]}
          locations={[0, 0.22, 0.78, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["#020a10a8", "#020a1000", "#020a10d8"]}
          locations={[0, 0.42, 1]}
          style={StyleSheet.absoluteFill}
        />
        <StatusBar hidden />
        <View
          style={[
            u.topbar,
            {
              height: 56 + insets.top,
              paddingTop: insets.top,
              paddingLeft: 18 + insets.left,
              paddingRight: 18 + insets.right,
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
          <View style={[u.topRight, { gap: 14 }]}>
            {!!player.rubies && (
              <View style={u.currency}>
                <Feather name="hexagon" size={14} color="#ff5f6d" />
                <CountUp value={player.rubies} style={u.rubies} />
              </View>
            )}
            <View style={u.currency}>
              <Text style={u.coins}>◉</Text>
              <CountUp value={player.coins} style={u.coins} />
            </View>
          </View>
        </View>
        <PageFade
          token={page}
          style={{
            flex: 1,
            minHeight: 0,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingBottom: insets.bottom,
          }}
        >
          {page === "rewards" ? (
            <Rewards
              player={player}
              onPlayer={setPlayer}
              onClose={() => setPage("profile")}
            />
          ) : page === "wallet" ||
            page === "leaderboard" ||
            page === "blocked" ? (
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
              onRewards={() => setPage("rewards")}
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
                            {player.guest
                              ? "Guest player"
                              : "Connected account"}
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
                          <Text style={u.statValue}>
                            {player.stats.finishes}
                          </Text>
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
                        {(player.stats.cpuStreak || 0) < 0 ? "losses" : "wins"}{" "}
                        in a row
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
                      <Text style={u.fieldLabel}>
                        COUNTRY · TWO-LETTER CODE
                      </Text>
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
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 28,
                              }}
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
                      <NavRow
                        icon="gift"
                        label="Reward crates"
                        detail={
                          player.crates
                            ? `${player.crates} crate${player.crates === 1 ? "" : "s"} waiting`
                            : "Win a match to seal a crate"
                        }
                        onPress={() => setPage("rewards")}
                      />
                      <NavRow
                        icon="award"
                        label="Leaderboard"
                        detail="Global and country rankings"
                        onPress={() => setPage("leaderboard")}
                      />
                      <NavRow
                        icon="credit-card"
                        label="USDC rewards"
                        detail="Payout address · payouts not active"
                        onPress={() => setPage("wallet")}
                      />
                      <NavRow
                        icon="slash"
                        label="Blocked players"
                        detail="Players hidden from your leaderboards"
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
                      <Text style={u.cardTitle}>
                        Your account, your choice.
                      </Text>
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
                      <NavRow
                        danger
                        icon="trash-2"
                        label="Delete account"
                        detail="Permanent. Removes your profile and progress."
                        onPress={() => {
                          setDeleteText("");
                          setDeleting(true);
                        }}
                      />
                      <View style={u.divider} />
                      <Text style={u.cardTitle}>Legal & support</Text>
                      <NavRow
                        icon="shield"
                        label="Privacy policy"
                        url={config.urls?.privacy}
                      />
                      <NavRow
                        icon="file-text"
                        label="Terms of service"
                        url={config.urls?.terms}
                      />
                      <NavRow
                        icon="life-buoy"
                        label="Support"
                        url={config.urls?.support}
                      />
                      <NavRow
                        icon="external-link"
                        label="Delete your account on the web"
                        url={config.urls?.deleteAccount}
                      />
                      <Text style={u.fine}>
                        CUEMASTER {version} · COINS ARE VIRTUAL ITEMS, NOT MONEY
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </PageFade>
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
        {levelModal}
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
            {event &&
              (() => {
                const t = eventDetail?.event || event;
                const phase =
                  eventDetail?.phase || eventState(t, Date.now() + skew).key;
                const series = eventDetail?.series || null;
                const entered = !!eventDetail?.entry;
                const seats = eventDetail
                  ? `${eventDetail.entrants.toLocaleString()} / ${t.maxPlayers.toLocaleString()}`
                  : `up to ${t.maxPlayers.toLocaleString()}`;
                const full =
                  !!eventDetail && eventDetail.entrants >= t.maxPlayers;
                const canEnter = eventDetail
                  ? eventDetail.canEnter || (full && !entered)
                  : phase === "registration";
                const underLevel = (player?.level || 1) < t.level;
                const target = framesToWin(t.bestOf);
                const label =
                  phase === "registration"
                    ? "ENTRIES OPEN"
                    : phase === "waiting"
                      ? "STARTING SOON"
                      : phase === "play"
                        ? "IN PLAY"
                        : phase === "closed"
                          ? "FINISHED"
                          : phase === "cancelled"
                            ? "CANCELLED"
                            : "ANNOUNCED";
                return (
                  <ScrollView
                    style={u.eventModal}
                    contentContainerStyle={{ padding: 26, gap: 14 }}
                  >
                    <View style={u.between}>
                      <Tag
                        gold={
                          t.kind === "crypto" ||
                          phase === "play" ||
                          phase === "registration"
                        }
                      >
                        {label}
                        {entered ? " · YOU'RE IN" : ""}
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
                    <Text style={u.modalTitle}>{t.name}</Text>
                    <Text style={u.rewardText}>{t.prize}</Text>
                    <Text style={u.body}>{t.description}</Text>
                    <View style={u.infoGrid}>
                      {[
                        ["FORMAT", formatLabel(t)],
                        ["PLAYERS", `${seats}${full ? " · FULL" : ""}`],
                        ["ENTRY", t.entry ? `${money(t.entry)} coins` : "Free"],
                        [
                          "PRIZES",
                          t.placements?.length
                            ? t.placements
                                .slice()
                                .sort((a, b) => a.position - b.position)
                                .slice(0, 3)
                                .map((p) => `#${p.position} ${money(p.amount)}`)
                                .join(" · ")
                            : t.reward
                              ? `${money(t.reward)} coins each`
                              : "—",
                        ],
                        ["MIN LEVEL", `${t.level}`],
                        ["MIN PLAYERS", `${t.minPlayers}`],
                      ].map(([k, v]) => (
                        <View key={k} style={u.infoCell}>
                          <Text style={u.infoLabel}>{k}</Text>
                          <Text style={u.infoValue} numberOfLines={2}>
                            {v}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {phase === "registration" && t.joinDeadline && (
                      <Countdown
                        to={t.joinDeadline}
                        skew={skew}
                        label="ENTRIES CLOSE IN"
                        expired="ENTRIES CLOSED"
                        onExpire={() => void loadEvent(t.id).catch(() => {})}
                      />
                    )}
                    {phase === "waiting" && t.startsAt && (
                      <Countdown
                        to={t.startsAt}
                        skew={skew}
                        label="PLAY OPENS IN"
                        expired="PLAY IS OPENING"
                        onExpire={() => void loadEvent(t.id).catch(() => {})}
                      />
                    )}
                    {phase === "play" && t.endsAt && (
                      <Countdown
                        to={t.endsAt}
                        skew={skew}
                        label="EVENT CLOSES IN"
                        expired="EVENT CLOSING"
                        onExpire={() => void loadEvent(t.id).catch(() => {})}
                      />
                    )}
                    {phase === "registration" && t.startsAt && (
                      <Text style={u.fine}>
                        Play runs {whenLocal(t.startsAt)} →{" "}
                        {whenLocal(t.endsAt)}
                        {t.minPlayers > 1
                          ? `. Fewer than ${t.minPlayers} entrants at the start cancels the event and refunds every entry.`
                          : "."}
                      </Text>
                    )}
                    {phase === "cancelled" && (
                      <View style={u.announcement}>
                        <Text style={u.body}>
                          {t.cancelReason || "This event was cancelled."}{" "}
                          {entered && t.entry
                            ? "Your entry coins were returned."
                            : ""}
                        </Text>
                      </View>
                    )}
                    {phase === "announced" && (
                      <View style={u.announcement}>
                        <Text style={u.body}>
                          Registration, entry payments and payouts are not
                          active yet. The funded pool and confirmed dates are
                          published before this event opens.
                        </Text>
                      </View>
                    )}
                    {series && entered && (
                      <View style={u.seriesCard}>
                        <View style={u.between}>
                          <View style={{ flex: 1 }}>
                            <Text style={u.fieldLabel}>YOUR RIVAL</Text>
                            <Text style={u.name}>
                              {series.opponent?.name || "Club rival"}
                              {series.opponent
                                ? ` · ${series.opponent.tier.toUpperCase()}`
                                : ""}
                            </Text>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={u.fieldLabel}>SERIES</Text>
                            <Text style={u.record}>
                              {series.wins}–{series.losses}
                            </Text>
                          </View>
                        </View>
                        <View style={u.frameDots}>
                          {Array.from({ length: t.bestOf }, (_, i) => {
                            const f = series.frames[i];
                            const tone = !f
                              ? u.dotEmpty
                              : f.outcome === "won"
                                ? u.dotWin
                                : f.outcome === null
                                  ? u.dotLive
                                  : u.dotLoss;
                            return (
                              <View key={i} style={[u.dot, tone]}>
                                <Text style={u.dotText}>
                                  {!f
                                    ? i + 1
                                    : f.outcome === "won"
                                      ? "W"
                                      : f.outcome === "lost"
                                        ? "L"
                                        : f.outcome === "forfeit"
                                          ? "F"
                                          : "•"}
                                </Text>
                              </View>
                            );
                          })}
                          <Text style={u.fine}>first to {target}</Text>
                        </View>
                        {forfeitPrompt && series.activeFrame ? (
                          <>
                            <Text style={u.body}>
                              A frame you started was never finished. Forfeit it
                              (a loss) to play the next one.
                            </Text>
                            <Action
                              label="Forfeit unfinished frame"
                              disabled={busy}
                              onPress={forfeitFrame}
                            />
                            <Action
                              secondary
                              label="Keep it for now"
                              onPress={() => setForfeitPrompt(false)}
                            />
                          </>
                        ) : series.done ? (
                          <Text style={u.body}>
                            {series.wins > series.losses
                              ? "Series won. Your place on the board is set; prizes are paid when the event closes."
                              : "Series over. The board settles when the event closes."}
                          </Text>
                        ) : phase === "play" ? (
                          <Action
                            label={
                              series.activeFrame
                                ? "Resume: forfeit & play next frame"
                                : `Play frame ${series.frames.length + 1} of ${t.bestOf}`
                            }
                            disabled={busy}
                            onPress={
                              series.activeFrame
                                ? () => setForfeitPrompt(true)
                                : playFrame
                            }
                          />
                        ) : (
                          <Text style={u.body}>
                            {phase === "closed"
                              ? "The event has closed."
                              : "Your frames unlock when play opens."}
                          </Text>
                        )}
                      </View>
                    )}
                    {!entered && canEnter && (
                      <>
                        {underLevel ? (
                          <View style={u.announcement}>
                            <Text style={u.body}>
                              Reach level {t.level} to enter. You are level{" "}
                              {player?.level}.
                            </Text>
                          </View>
                        ) : full ? (
                          <View style={u.announcement}>
                            <Text style={u.body}>
                              Every place is taken. Watch the board, or catch
                              the next event.
                            </Text>
                          </View>
                        ) : (
                          <>
                            <Pressable
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: rules }}
                              accessibilityLabel="Accept event rules"
                              onPress={() => setRules(!rules)}
                              style={u.checkRow}
                            >
                              <Text style={u.checkbox}>
                                {rules ? "☑" : "□"}
                              </Text>
                              <Text style={u.body}>
                                I’ve read and accept these event rules.
                              </Text>
                            </Pressable>
                            <Action
                              label={
                                t.entry
                                  ? `Enter · ${money(t.entry)} coins`
                                  : "Enter free"
                              }
                              disabled={busy || !rules}
                              onPress={enterEvent}
                            />
                            {!!t.entry && (
                              <Text style={u.fine}>
                                Balance {money(player?.coins || 0)} coins. The
                                fee is refunded if the event is cancelled.
                              </Text>
                            )}
                          </>
                        )}
                      </>
                    )}
                    {!entered &&
                      !canEnter &&
                      (phase === "waiting" || phase === "play") && (
                        <View style={u.announcement}>
                          <Text style={u.body}>
                            Entries closed{" "}
                            {t.joinDeadline
                              ? whenLocal(t.joinDeadline)
                              : "before play"}
                            . Follow the board below.
                          </Text>
                        </View>
                      )}
                    {entered && t.format === "drill" && (
                      <>
                        {phase === "play" ? (
                          <Action
                            label={
                              eventDetail?.entry?.shots
                                ? `Beat your ${eventDetail.entry.shots}-shot best`
                                : "Play the challenge"
                            }
                            disabled={busy}
                            onPress={() =>
                              eventDetail && playDrill(eventDetail)
                            }
                          />
                        ) : phase === "waiting" || phase === "registration" ? (
                          <Text style={u.body}>
                            You're in. The challenge unlocks when play opens.
                          </Text>
                        ) : null}
                      </>
                    )}
                    <Text style={u.fieldLabel}>EVENT RULES</Text>
                    {t.rules.map((r, i) => (
                      <Text key={r} style={u.body}>
                        {i + 1}. {r}
                      </Text>
                    ))}
                    {phase !== "announced" && (
                      <>
                        <Text style={u.fieldLabel}>
                          {t.format === "series"
                            ? "SERIES STANDINGS"
                            : "VERIFIED LEADERBOARD"}
                        </Text>
                        {!eventDetail ? (
                          <ActivityIndicator color="#d6b675" />
                        ) : eventDetail.leaderboard.length ? (
                          eventDetail.leaderboard.map((r, i) => (
                            <View
                              key={r.playerId}
                              style={[
                                u.leaderRow,
                                r.playerId === player?.id && u.leaderMine,
                              ]}
                            >
                              <Text style={u.name}>
                                {i + 1}. {r.name} {flag(r.country)}
                              </Text>
                              <Text style={u.body}>
                                {t.format === "series"
                                  ? `${r.wins || 0}–${r.losses || 0}${r.done ? " ✓" : ""}`
                                  : `${r.shots} shot${r.shots === 1 ? "" : "s"}`}
                              </Text>
                            </View>
                          ))
                        ) : (
                          <Text style={u.body}>
                            {phase === "registration" || phase === "waiting"
                              ? `No results until play opens${eventDetail.entrants ? ` · ${eventDetail.entrants} entered so far` : ""}.`
                              : phase === "cancelled"
                                ? "The event was cancelled before any result was recorded."
                                : phase === "closed"
                                  ? "The event closed with no results recorded."
                                  : t.format === "series"
                                    ? "No frames recorded yet. Play the first."
                                    : "No verified scores yet. Set the first mark."}
                          </Text>
                        )}
                      </>
                    )}
                  </ScrollView>
                );
              })()}
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
const version = Constants.expoConfig?.version || "";
const u = StyleSheet.create({
  navRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffffff1c",
    backgroundColor: "#081724b0",
  },
  navChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff1f",
    backgroundColor: "#0d2536",
  },
  navLabel: { color: "#eaf2f8", fontSize: 14, fontWeight: "700" },
  navDetail: { color: "#90aabd", fontSize: 11, marginTop: 2 },
  fill: { flex: 1, backgroundColor: "#101815" },
  // No flex here: the club shell is explicitly sized. flex:1 sets flexBasis 0 (web collapses the
  // box) and the "auto" override that used to fix that collapses it on native instead.
  shell: { backgroundColor: "#101815", overflow: "hidden" },
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
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandBall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fffdf3",
    borderWidth: 3,
    borderColor: "#ffd05b",
  },
  welcomeTitle: {
    fontSize: 46,
    lineHeight: 50,
    fontWeight: "900",
    letterSpacing: -1.5,
    color: "#fffdf3",
    marginTop: 22,
  },
  welcomeTitleCompact: { fontSize: 34, lineHeight: 38, marginTop: 12 },
  welcomeKicker: {
    color: "#ffd05b",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2.4,
    marginTop: 8,
    marginBottom: 10,
  },
  checkText: { color: "#fffdf3", fontSize: 15, fontWeight: "600" },
  cta: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 2,
    boxShadow: "0 6px 18px #ffc53d40",
  },
  ctaFill: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 22,
  },
  ctaText: { fontSize: 17, fontWeight: "900", color: "#10233a" },
  welcomeChips: { position: "absolute", flexDirection: "row", gap: 8 },
  welcomeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#081e30b3",
    borderWidth: 1,
    borderColor: "#ffffff22",
  },
  welcomeChipText: { color: "#fffdf3", fontSize: 12, fontWeight: "700" },
  body: { color: "#d4e8f6", fontSize: 12, lineHeight: 19 },
  fine: { color: "#d4e8f6", fontSize: 12, lineHeight: 16, marginTop: 8 },
  checkRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    minHeight: 44,
    marginBottom: 4,
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
  currency: { flexDirection: "row", alignItems: "center", gap: 5 },
  levelCard: { maxWidth: 420, padding: 30, gap: 14, alignItems: "center" },
  levelBadge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: "#ffd05b",
    backgroundColor: "#ffd05b1f",
    alignItems: "center",
    justifyContent: "center",
  },
  levelNumber: { color: "#ffd05b", fontSize: 44, fontWeight: "900" },
  rubies: { color: "#ffd7db", fontSize: 15, fontWeight: "800" },
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
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  infoCell: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 120,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ffffff0a",
    borderWidth: 1,
    borderColor: "#ffffff12",
    gap: 4,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#8fa8bb",
  },
  infoValue: { fontSize: 13, fontWeight: "700", color: "#ecf1f6" },
  countdown: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#0b1a24",
    borderWidth: 1,
    borderColor: "#2f4756",
    gap: 4,
  },
  countdownValue: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#e8d3a4",
    fontVariant: ["tabular-nums"],
  },
  seriesCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#0f2a2a",
    borderWidth: 1,
    borderColor: "#2f5a55",
    gap: 12,
  },
  record: {
    fontSize: 26,
    fontWeight: "800",
    color: "#e8d3a4",
    fontVariant: ["tabular-nums"],
  },
  frameDots: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  dotEmpty: { borderColor: "#3c5a66", backgroundColor: "transparent" },
  dotWin: { borderColor: "#3fd0a8", backgroundColor: "#1f8f74" },
  dotLoss: { borderColor: "#c96c6c", backgroundColor: "#7a2e2e" },
  dotLive: { borderColor: "#e8c98f", backgroundColor: "#8a6b2a" },
  dotText: { fontSize: 12, fontWeight: "800", color: "#f3f6f4" },
  leaderMine: {
    backgroundColor: "#d4b06b12",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
});
