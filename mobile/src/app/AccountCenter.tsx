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
import { api, Player } from "./api";
import { portraits } from "./art";
type Area = "wallet" | "leaderboard" | "blocked";
function Button({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        (pressed || disabled) && { opacity: 0.5 },
      ]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
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
        <Button label="Back to profile" onPress={onClose} />
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={s.notice}>
          {notice}
        </Text>
      )}
      {loading ? (
        <ActivityIndicator color="#ffd184" />
      ) : !data ? (
        <Button
          label="Retry"
          onPress={() => void work(refresh)}
          disabled={busy}
        />
      ) : area === "wallet" ? (
        <View style={s.card}>
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
            placeholderTextColor="#a5b6cc"
            style={s.input}
          />
          <Text style={s.copy}>
            Use a wallet you control on Base (chain 8453). TRON / TRC20 is not
            supported for USDC.
          </Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
            onPress={() => setConfirmed(!confirmed)}
            style={s.check}
          >
            <Text style={s.copy}>
              {confirmed ? "☑" : "☐"} I confirm this is my Base address.
            </Text>
          </Pressable>
          <View style={s.actions}>
            <Button
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
            <Text style={s.copy}>
              Ownership: {data.wallet.verified ? "verified" : "not verified"} ·
              Network: Base
            </Text>
          )}
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
        </View>
      ) : area === "blocked" ? (
        <View style={s.card}>
          <Text style={s.copy}>
            Blocked players are hidden from your leaderboards.
          </Text>
          {data.players?.length ? (
            data.players.map((p: any) => (
              <View key={p.id} style={s.row}>
                <Text style={s.name}>{p.name}</Text>
                <Button
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
        </View>
      ) : (
        <>
          <View style={s.actions}>
            <Button
              label={scope === "global" ? "✓ Global" : "Global"}
              onPress={() => {
                setSelected(null);
                setScope("global");
              }}
            />
            <Button
              label={scope === "country" ? "✓ My country" : "My country"}
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
            <View style={s.card}>
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
                placeholderTextColor="#a5b6cc"
                style={s.input}
              />
              <View style={s.actions}>
                {(["name", "cheating", "abuse"] as const).map((reason) => (
                  <Button
                    key={reason}
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
            </View>
          )}
          <View style={s.card}>
            {data.players.length ? (
              data.players.map((p: any) => (
                <View key={p.id} style={s.row}>
                  <Text style={s.rank}>#{p.rank}</Text>
                  <Image
                    source={portraits[p.avatar] || portraits[0]}
                    style={s.avatar}
                  />
                  <View style={{ flex: 1 }}>
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
                      label={`Options for ${p.name}`}
                      onPress={() => {
                        setSelected(p);
                        setDetails("");
                      }}
                    />
                  )}
                </View>
              ))
            ) : (
              <Text style={s.copy}>
                {data.message || "No players to show yet."}
              </Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: { padding: 24, gap: 16, paddingBottom: 50 },
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
  title: { color: "#fff", fontSize: 28, fontWeight: "800" },
  card: {
    backgroundColor: "#122339",
    borderWidth: 1,
    borderColor: "#405773",
    borderRadius: 18,
    padding: 20,
    gap: 14,
  },
  heading: { color: "#fff", fontSize: 20, fontWeight: "700" },
  copy: { color: "#d2deed", fontSize: 14, lineHeight: 22 },
  label: { color: "#e5c48e", fontSize: 12, fontWeight: "700" },
  input: {
    minHeight: 48,
    backgroundColor: "#081524",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#65819f",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  button: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#eac183",
  },
  buttonText: { color: "#142236", fontWeight: "800", fontSize: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  check: { minHeight: 48, justifyContent: "center" },
  badge: { color: "#ffda95", fontSize: 11, fontWeight: "800" },
  error: { color: "#ffb6b6", fontSize: 15 },
  notice: { color: "#a1f0ca", fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#304660",
    flexWrap: "wrap",
  },
  name: { color: "#fff", fontSize: 16, fontWeight: "700", flexShrink: 1 },
  rank: { color: "#f5cd89", fontSize: 17, fontWeight: "800", minWidth: 36 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  score: { color: "#f5cd89", fontSize: 16, fontWeight: "800" },
});
