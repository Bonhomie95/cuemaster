import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { api, Player } from "./api";
import { portraits } from "./art";
import { Press, Enter } from "./motion";
type Area = "wallet" | "leaderboard" | "blocked";
type Icon = React.ComponentProps<typeof Feather>["name"];

/** One button shape for the whole club: a gold primary, or dark glass for everything else. */
function Button({
  label,
  onPress,
  disabled = false,
  primary = false,
  icon,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  icon?: Icon;
  selected?: boolean;
}) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        primary && !disabled ? s.primary : s.ghost,
        selected && s.selected,
        disabled && { opacity: 0.45 },
      ]}
    >
      {!!icon && (
        <Feather
          name={icon}
          size={15}
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
function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <LinearGradient
        pointerEvents="none"
        colors={["#153048", "#0a1c2900", "#00000000"]}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={s.topLight} />
      {children}
    </View>
  );
}
export default function AccountCenter({
  area,
  player,
  onClose,
}: {
  area: Area;
  player: Player;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [scope, setScope] = useState<"global" | "country">("global"),
    [address, setAddress] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [selected, setSelected] = useState<any>(null),
    [details, setDetails] = useState("");
  const path =
    area === "wallet"
      ? "/me/usdc"
      : area === "blocked"
        ? "/me/blocked"
        : `/leaderboard?scope=${scope}`;
  async function refresh() {
    const result = await api(path);
    setData(result);
    if (area === "wallet") setAddress(result.wallet?.address || "");
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(path)
      .then((result) => {
        if (active) {
          setData(result);
          if (area === "wallet") setAddress(result.wallet?.address || "");
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [path]);
  async function work(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>CUEMASTER CLUB</Text>
          <Text style={s.title}>
            {area === "wallet"
              ? "USDC rewards"
              : area === "blocked"
                ? "Blocked players"
                : "Leaderboard"}
          </Text>
        </View>
        <Button icon="arrow-left" label="Back to profile" onPress={onClose} />
      </View>
      {!!error && (
        <View style={s.alert}>
          <Feather name="alert-circle" size={15} color="#ffb6b6" />
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        </View>
      )}
      {!!notice && (
        <View style={[s.alert, s.noticeBox]}>
          <Feather name="check-circle" size={15} color="#a1f0ca" />
          <Text accessibilityLiveRegion="polite" style={s.notice}>
            {notice}
          </Text>
        </View>
      )}
      {loading ? (
        <ActivityIndicator color="#ffd184" />
      ) : !data ? (
        <Button
          primary
          icon="refresh-cw"
          label="Retry"
          onPress={() => void work(refresh)}
          disabled={busy}
        />
      ) : area === "wallet" ? (
        <Card>
          <View style={s.header}>
            <Text style={s.heading}>Base · USDC</Text>
            <Text style={s.badge}>PAYOUTS NOT ACTIVE</Text>
          </View>
          <Text style={s.copy}>
            Prepare your prize address. Saving it does not create a balance,
            deposit funds or enable withdrawals. Eligible competitions will show
            their entry terms and rewarded positions before you join.
          </Text>
          <Text style={s.label}>BASE WALLET ADDRESS</Text>
          <TextInput
            accessibilityLabel="Base wallet address"
            autoCapitalize="none"
            autoCorrect={false}
            value={address}
            onChangeText={(v) => {
              setAddress(v);
              setConfirmed(false);
            }}
            maxLength={42}
            placeholder="0x…"
            placeholderTextColor="#7f95a8"
            style={s.input}
          />
          <Text style={s.copy}>
            Use a wallet you control on Base (chain 8453). TRON / TRC20 is not
            supported for USDC.
          </Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="I confirm this is my Base address"
            accessibilityState={{ checked: confirmed }}
            onPress={() => setConfirmed(!confirmed)}
            style={({ pressed }) => [s.check, pressed && { opacity: 0.7 }]}
          >
            <Feather
              name={confirmed ? "check-square" : "square"}
              size={19}
              color={confirmed ? "#24dbb3" : "#8fa8bb"}
            />
            <Text style={s.copy}>I confirm this is my Base address.</Text>
          </Pressable>
          <View style={s.actions}>
            <Button
              primary
              icon="save"
              label={busy ? "Saving…" : "Save payout address"}
              disabled={busy || !confirmed || !address.trim()}
              onPress={() =>
                void work(async () => {
                  await api("/me/usdc", "PUT", {
                    network: "base",
                    address,
                    acknowledgeNetwork: true,
                  });
                  await refresh();
                  setConfirmed(false);
                  setNotice(
                    "Address saved. Wallet ownership verification is still required before any payout.",
                  );
                })
              }
            />
            {!!data.wallet && (
              <Button
                icon="trash-2"
                label="Remove saved address"
                disabled={busy}
                onPress={() =>
                  void work(async () => {
                    await api("/me/usdc", "DELETE");
                    await refresh();
                    setConfirmed(false);
                    setNotice("Payout address removed.");
                  })
                }
              />
            )}
          </View>
          {!!data.wallet && (
            <View style={s.statusRow}>
              <Feather
                name={data.wallet.verified ? "shield" : "shield-off"}
                size={15}
                color={data.wallet.verified ? "#24dbb3" : "#ffb82e"}
              />
              <Text style={s.copy}>
                Ownership {data.wallet.verified ? "verified" : "not verified"} ·
                Network Base
              </Text>
            </View>
          )}
          <View style={s.divider} />
          <Text style={s.heading}>Prize history</Text>
          {data.payouts.length ? (
            data.payouts.map((p: any) => (
              <Text key={p.id} style={s.copy}>
                {p.amount} USDC · {p.status} · {p.network}
              </Text>
            ))
          ) : (
            <Text style={s.copy}>No prize payouts yet.</Text>
          )}
        </Card>
      ) : area === "blocked" ? (
        <Card>
          <Text style={s.copy}>
            Blocked players are hidden from your leaderboards.
          </Text>
          {data.players?.length ? (
            data.players.map((p: any) => (
              <View key={p.id} style={s.row}>
                <Text style={s.name}>{p.name}</Text>
                <Button
                  icon="user-check"
                  label={`Unblock ${p.name}`}
                  disabled={busy}
                  onPress={() =>
                    void work(async () => {
                      await api(`/players/${p.id}/block`, "DELETE");
                      await refresh();
                    })
                  }
                />
              </View>
            ))
          ) : (
            <Text style={s.copy}>You have not blocked any players.</Text>
          )}
        </Card>
      ) : (
        <>
          <View style={s.actions}>
            <Button
              icon="globe"
              selected={scope === "global"}
              label="Global"
              onPress={() => {
                setSelected(null);
                setScope("global");
              }}
            />
            <Button
              icon="map-pin"
              selected={scope === "country"}
              label="My country"
              onPress={() => {
                setSelected(null);
                setScope("country");
              }}
            />
          </View>
          <Text style={s.copy}>
            Ranked by server-verified challenge XP. Match wins and USDC earnings
            are not used for this ranking.
          </Text>
          {!!selected && (
            <Card>
              <Text style={s.heading}>{selected.name}</Text>
              <Text style={s.copy}>
                Report an inappropriate name or unfair play. A moderator will
                review your report.
              </Text>
              <TextInput
                accessibilityLabel="Report details"
                value={details}
                onChangeText={setDetails}
                maxLength={1000}
                placeholder="Optional details"
                placeholderTextColor="#7f95a8"
                style={s.input}
              />
              <View style={s.actions}>
                {(["name", "cheating", "abuse"] as const).map((reason) => (
                  <Button
                    key={reason}
                    icon="flag"
                    label={`Report ${reason}`}
                    disabled={busy}
                    onPress={() =>
                      void work(async () => {
                        await api(`/players/${selected.id}/report`, "POST", {
                          reason,
                          details,
                        });
                        setSelected(null);
                        setDetails("");
                        setNotice("Report sent to moderation.");
                      })
                    }
                  />
                ))}
                <Button
                  icon="slash"
                  label="Block player"
                  disabled={busy}
                  onPress={() =>
                    void work(async () => {
                      await api(`/players/${selected.id}/block`, "POST");
                      setSelected(null);
                      await refresh();
                      setNotice("Player blocked.");
                    })
                  }
                />
                <Button label="Cancel" onPress={() => setSelected(null)} />
              </View>
            </Card>
          )}
          <Card>
            {data.players.length ? (
              data.players.map((p: any, i: number) => (
                <Enter key={p.id} index={i} style={s.row}>
                  <Text
                    style={[
                      s.rank,
                      p.rank <= 3 && { color: MEDAL[p.rank - 1] },
                    ]}
                  >
                    #{p.rank}
                  </Text>
                  <Image
                    source={portraits[p.avatar] || portraits[0]}
                    style={s.avatar}
                  />
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={s.name}>
                      {p.name}
                      {p.id === player.id ? " · You" : ""}
                    </Text>
                    <Text style={s.copy}>
                      {p.country || "Worldwide"} · {p.finishes} challenges
                    </Text>
                  </View>
                  <Text style={s.score}>{p.xp} XP</Text>
                  {p.id !== player.id && (
                    <Button
                      icon="more-horizontal"
                      label={`Options for ${p.name}`}
                      onPress={() => {
                        setSelected(p);
                        setDetails("");
                      }}
                    />
                  )}
                </Enter>
              ))
            ) : (
              <Text style={s.copy}>
                {data.message || "No players to show yet."}
              </Text>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}
const MEDAL = ["#ffd05b", "#cfd8dc", "#d59a63"];
const s = StyleSheet.create({
  page: {
    padding: 24,
    gap: 14,
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
  eyebrow: {
    color: "#f3c576",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  title: { color: "#fffdf3", fontSize: 26, fontWeight: "800" },
  card: {
    backgroundColor: "#04121def",
    borderWidth: 1,
    borderColor: "#ffffff1c",
    borderRadius: 16,
    padding: 20,
    gap: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  topLight: {
    position: "absolute",
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: "#ffffff30",
  },
  heading: { color: "#fffdf3", fontSize: 18, fontWeight: "800" },
  copy: { color: "#a9c4d6", fontSize: 13, lineHeight: 21 },
  label: {
    color: "#e5c48e",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  input: {
    minHeight: 48,
    backgroundColor: "#02090f",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#ffffff26",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  button: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
  },
  primary: { backgroundColor: "#eac183", borderColor: "#ffd9a5" },
  ghost: { backgroundColor: "#0a1f2edd", borderColor: "#ffffff24" },
  selected: { borderColor: "#ffd05b", backgroundColor: "#ffd05b1f" },
  buttonText: { color: "#e6f0f7", fontWeight: "800", fontSize: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  check: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { color: "#ffda95", fontSize: 11, fontWeight: "800" },
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
  noticeBox: { borderColor: "#2f7a5e", backgroundColor: "#0c261ecc" },
  error: { color: "#ffb6b6", fontSize: 14, flex: 1 },
  notice: { color: "#a1f0ca", fontSize: 14, flex: 1 },
  divider: { height: 1, backgroundColor: "#ffffff1a", marginTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff14",
    flexWrap: "wrap",
  },
  name: { color: "#fff", fontSize: 15, fontWeight: "700", flexShrink: 1 },
  rank: { color: "#8fa8bb", fontSize: 16, fontWeight: "800", minWidth: 38 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  score: { color: "#ffd05b", fontSize: 15, fontWeight: "800" },
});
