import React, { useEffect, useState } from "react";
import { Share, StyleSheet, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { api, API, Player } from "./api";
import { Press } from "./motion";
import { celebrate } from "./feedback";

type Invite = {
  code: string;
  reward: { coins: number; rubies: number };
  matchesNeeded: number;
  friends: number;
  canRedeem: boolean;
  redeemed: boolean;
};

/** Redeem a friend's code. Shared by the welcome step and the profile. */
export async function redeemInvite(code: string) {
  return api<{ friend: string; player: Player }>("/me/invite/redeem", "POST", {
    code: code.trim().toUpperCase(),
  });
}

/**
 * The player's own invite code, the reward for using one, and (in the first week) a field for a
 * friend's code. The share message carries the store page, so it works for someone who has
 * never heard of the game.
 */
export default function InviteCard({
  onPlayer,
}: {
  onPlayer: (p: Player) => void;
}) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    void api<Invite>("/me/invite")
      .then(setInvite)
      .catch(() => {});
  }, []);
  if (!invite) return null;
  const reward = `${invite.reward.coins} coins + ${invite.reward.rubies} rubies`;
  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={s.icon}>
          <Feather name="users" size={16} color="#24dbb3" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Invite friends</Text>
          <Text style={s.copy}>
            You both get {reward} when they finish {invite.matchesNeeded}{" "}
            matches.{invite.friends ? ` ${invite.friends} joined so far.` : ""}
          </Text>
        </View>
      </View>
      <View style={s.row}>
        <Text style={s.code} selectable>
          {invite.code}
        </Text>
        <Press
          accessibilityRole="button"
          accessibilityLabel="Share your invite code"
          onPress={() =>
            void Share.share({
              message: `Play pool with me on CueMaster! Use my code ${invite.code} for ${reward}: ${API}/play`,
            }).catch(() => {})
          }
          style={s.share}
        >
          <Feather name="share-2" size={14} color="#06231c" />
          <Text style={s.shareText}>Share</Text>
        </Press>
      </View>
      {invite.canRedeem && (
        <View style={s.row}>
          <TextInput
            accessibilityLabel="A friend's invite code"
            value={code}
            onChangeText={(v) =>
              setCode(
                v
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 6),
              )
            }
            placeholder="Friend's code"
            placeholderTextColor="#5d7a8d"
            autoCapitalize="characters"
            autoCorrect={false}
            style={s.input}
          />
          <Press
            accessibilityRole="button"
            accessibilityLabel="Use invite code"
            disabled={code.length !== 6}
            onPress={() =>
              void redeemInvite(code)
                .then((r) => {
                  onPlayer(r.player);
                  celebrate();
                  setInvite({ ...invite, canRedeem: false, redeemed: true });
                  setMessage(
                    `Linked with ${r.friend}. Finish ${invite.matchesNeeded} matches to collect.`,
                  );
                })
                .catch((e) => setMessage(e.message))
            }
            style={[s.use, code.length !== 6 && { opacity: 0.45 }]}
          >
            <Text style={s.useText}>Use</Text>
          </Press>
        </View>
      )}
      {!!message && <Text style={s.message}>{message}</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#24dbb344",
    backgroundColor: "#06231cb0",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#24dbb322",
  },
  title: { color: "#eaf2f8", fontSize: 14, fontWeight: "800" },
  copy: { color: "#a9c4d6", fontSize: 11, lineHeight: 16 },
  code: {
    flex: 1,
    color: "#ffd05b",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 4,
  },
  share: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#24dbb3",
  },
  shareText: { color: "#06231c", fontSize: 13, fontWeight: "900" },
  input: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#0d2536",
    color: "#fffdf3",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 3,
    paddingHorizontal: 10,
  },
  use: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: "center",
    backgroundColor: "#eac183",
  },
  useText: { color: "#10233a", fontWeight: "900" },
  message: { color: "#7ff0d6", fontSize: 12 },
});
