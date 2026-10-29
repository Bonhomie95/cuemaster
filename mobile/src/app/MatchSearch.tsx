import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Easing,
  TextInput,
  Share,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { API, Player, Venue } from "./api";
import { portraits, venueArt } from "./art";
import { Press, Pulse, Enter } from "./motion";
import { online } from "../game/online";

export type SearchKind = "queue" | "host" | "join";
/** Seconds of searching before the house rival is offered as the main way forward. */
const OFFER_RIVAL_AFTER = 12;

/**
 * Finding a human opponent. The search is real: the server pairs the first two players waiting
 * at a venue. Nobody is dressed up as a person; if the room is quiet the player is offered a
 * house rival, named as one.
 */
export default function MatchSearch({
  venue,
  player,
  kind,
  code: invited = "",
  onCancel,
  onRival,
}: {
  venue: Venue | null;
  player: Player;
  kind: SearchKind;
  /** A code from an invite link: joined straight away. */
  code?: string;
  onCancel: () => void;
  onRival: () => void;
}) {
  useSyncExternalStore(online.subscribe, online.snapshot);
  const [seconds, setSeconds] = useState(0);
  const [code, setCode] = useState(invited);
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();
    const start = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - start) / 1000)),
      500,
    );
    if (venue && kind === "queue")
      online.queue(venue.id).catch((e) => {
        online.error = e.message;
      });
    if (venue && kind === "host")
      online.createRoom(venue.id).catch((e) => {
        online.error = e.message;
      });
    if (kind === "join" && invited.length === 5)
      online.join(invited).catch((e) => {
        online.error = e.message;
      });
    return () => {
      spin.stop();
      clearInterval(timer);
    };
  }, [venue?.id, kind]);
  const waiting =
    online.status === "queued" ||
    online.status === "room" ||
    online.status === "connecting";
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <View style={s.root}>
      {venue && (
        <Image
          source={venueArt[venue.id]}
          style={[StyleSheet.absoluteFill, s.backdrop]}
          blurRadius={10}
        />
      )}
      <View style={s.scrim} />
      <Text style={s.eyebrow}>
        {kind === "join"
          ? "JOIN A FRIEND"
          : kind === "host"
            ? "PRIVATE TABLE"
            : "FINDING AN OPPONENT"}
      </Text>
      {venue && (
        <Text style={s.title}>
          {venue.name} · ◉ {venue.entry.toLocaleString()} entry · win{" "}
          {(venue.entry * 2).toLocaleString()}
        </Text>
      )}
      {kind === "join" ? (
        <Enter style={s.joinBox}>
          <Text style={s.copy}>
            Type the five-letter code your friend shared.
          </Text>
          <TextInput
            accessibilityLabel="Room code"
            value={code}
            onChangeText={(v) =>
              setCode(
                v
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 5),
              )
            }
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="ABCDE"
            placeholderTextColor="#4e6a7d"
            style={s.codeInput}
          />
          <Press
            accessibilityRole="button"
            accessibilityLabel="Join room"
            disabled={code.length !== 5 || online.status === "connecting"}
            onPress={() =>
              void online.join(code).catch((e) => {
                online.error = e.message;
              })
            }
            style={[s.primary, code.length !== 5 && { opacity: 0.45 }]}
          >
            <Feather name="log-in" size={16} color="#10233a" />
            <Text style={s.primaryText}>Join table</Text>
          </Press>
        </Enter>
      ) : (
        <View style={s.duel}>
          <View style={s.player}>
            <Image
              source={portraits[player.avatar % portraits.length]}
              style={s.avatar}
            />
            <Text style={s.name} numberOfLines={1}>
              {player.name}
            </Text>
            <Text style={s.copy}>
              LV {player.level} · {player.trophies || 0} trophies
            </Text>
          </View>
          <View style={s.centre}>
            <Animated.View
              style={[
                s.ring,
                {
                  transform: [
                    {
                      rotate: rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0deg", "360deg"],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Text style={s.vs}>VS</Text>
            {kind === "queue" && <Text style={s.clock}>{clock}</Text>}
          </View>
          {kind === "host" && online.roomCode ? (
            <Enter style={s.codeCard}>
              <Text style={s.copy}>Room code</Text>
              <View
                style={s.codeRow}
                accessible
                accessibilityLabel={`Room code ${online.roomCode}`}
              >
                {online.roomCode.split("").map((c, i) => (
                  <View key={i} style={s.codeCell}>
                    <Text style={s.codeChar}>{c}</Text>
                  </View>
                ))}
              </View>
              <Press
                accessibilityRole="button"
                accessibilityLabel="Share room code"
                onPress={() =>
                  void Share.share({
                    message: `Play me at CueMaster! Tap to join my table: ${API}/join/${online.roomCode} (code ${online.roomCode})`,
                  }).catch(() => {})
                }
                style={s.share}
              >
                <Feather name="share-2" size={14} color="#10233a" />
                <Text style={s.primaryText}>Share invite</Text>
              </Press>
            </Enter>
          ) : (
            <View style={s.player}>
              <Pulse style={[s.avatar, s.unknown]}>
                <Text style={s.question}>?</Text>
              </Pulse>
              <Text style={s.name}>
                {kind === "host" ? "Your friend" : "Opponent"}
              </Text>
              <Text style={s.copy}>
                {kind === "host" ? "Opening a table…" : "Searching…"}
              </Text>
            </View>
          )}
        </View>
      )}
      <Text accessibilityLiveRegion="polite" style={s.status}>
        {online.error ||
          (online.status === "connecting"
            ? "Connecting to the match server…"
            : online.status === "room"
              ? "Waiting for your friend to join"
              : online.status === "queued"
                ? online.online > 1
                  ? `${online.online.toLocaleString()} players online`
                  : "Looking for a player at this table"
                : "")}
      </Text>
      <View style={s.actions}>
        {kind === "queue" &&
          (seconds >= OFFER_RIVAL_AFTER || !!online.error) && (
            <Enter>
              <Press
                accessibilityRole="button"
                accessibilityLabel="Play a house rival instead"
                onPress={onRival}
                style={s.primary}
              >
                <Feather name="cpu" size={16} color="#10233a" />
                <Text style={s.primaryText}>Play a house rival instead</Text>
              </Press>
            </Enter>
          )}
        <Press
          accessibilityRole="button"
          accessibilityLabel={waiting ? "Cancel search" : "Back to venues"}
          onPress={() => {
            online.cancel();
            onCancel();
          }}
          style={s.cancel}
        >
          <Text style={s.cancelText}>{waiting ? "Cancel" : "Back"}</Text>
        </Press>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#081e30",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 18,
  },
  backdrop: { width: "100%", height: "100%", opacity: 0.35 },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#04101acc",
  },
  eyebrow: {
    color: "#ffd05b",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2.4,
  },
  title: { color: "#f4f5eb", fontSize: 18, fontWeight: "800" },
  duel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 28,
    marginVertical: 6,
  },
  player: { width: 170, alignItems: "center", gap: 6 },
  centre: { alignItems: "center", gap: 6, width: 70 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: "#24dbb3",
  },
  unknown: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#13324a",
    borderColor: "#ffd05b",
  },
  question: { fontSize: 28, color: "#ffd05b", fontWeight: "900" },
  name: { fontSize: 15, color: "#f0f4f8", fontWeight: "800", maxWidth: 160 },
  copy: { fontSize: 11, color: "#a9c4d6", textAlign: "center" },
  vs: { color: "#fffdf3", fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  clock: { color: "#a9c4d6", fontSize: 12, fontVariant: ["tabular-nums"] },
  ring: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    borderColor: "#284e5e",
    borderTopColor: "#ffd05b",
  },
  status: {
    fontSize: 13,
    color: "#eff6fc",
    textAlign: "center",
    maxWidth: 460,
    minHeight: 18,
  },
  actions: { flexDirection: "row", gap: 12, alignItems: "center" },
  primary: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#eac183",
    borderWidth: 1,
    borderColor: "#ffd9a5",
  },
  primaryText: { color: "#10233a", fontSize: 13, fontWeight: "900" },
  cancel: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 30,
    borderWidth: 1,
    borderColor: "#ffffff33",
    borderRadius: 22,
  },
  cancelText: { color: "#f0f4f8", fontSize: 14, fontWeight: "700" },
  codeCard: {
    width: 220,
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffd05b55",
    backgroundColor: "#04121def",
  },
  codeRow: { flexDirection: "row", gap: 6 },
  codeCell: {
    width: 32,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0d2536",
    borderWidth: 1,
    borderColor: "#ffffff26",
  },
  codeChar: { color: "#ffd05b", fontSize: 22, fontWeight: "900" },
  share: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#24dbb3",
  },
  joinBox: { alignItems: "center", gap: 12, marginVertical: 8 },
  codeInput: {
    width: 220,
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffd05b88",
    backgroundColor: "#0d2536",
    color: "#ffd05b",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 10,
    textAlign: "center",
  },
});
