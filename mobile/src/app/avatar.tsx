import React, { useEffect, useState } from "react";
import {
  Image,
  ImageStyle,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { portraits } from "./art";

/**
 * A player's look. Ids 0 and 1 are the two portraits, then the fifteen object balls, all drawn
 * here so a new look never needs an asset. The server stores the id and everyone sees it.
 * A photo from the phone's library can replace the look for its owner only: it stays on the
 * phone, so nothing other players see is user-supplied.
 */
export const AVATAR_COUNT = portraits.length + 15;
const KEY = "avatar.custom";
const COLORS = [
  "#f3c21b",
  "#1f63d6",
  "#d42a2a",
  "#5b2d8e",
  "#f27a24",
  "#1e8a46",
  "#8a1c2a",
  "#141414",
];

let customUri: string | null | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
async function load() {
  if (customUri !== undefined) return;
  customUri = null;
  try {
    customUri = await AsyncStorage.getItem(KEY);
  } catch {}
  notify();
}
/** The owner's photo, if one is set on this phone. */
export function useCustomAvatar() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    void load();
    return () => void listeners.delete(l);
  }, []);
  return customUri || null;
}
/** Pick a square photo from the library and keep a copy in the app's own folder. */
export async function pickCustomAvatar() {
  const ImagePicker = await import("expo-image-picker");
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
  });
  if (picked.canceled) return false;
  let uri = picked.assets[0].uri;
  if (Platform.OS !== "web") {
    const { File, Paths } = await import("expo-file-system");
    const kept = new File(Paths.document, `avatar-${Date.now()}.jpg`);
    await new File(uri).copy(kept);
    uri = kept.uri;
    await removeFile(customUri);
  }
  customUri = uri;
  await AsyncStorage.setItem(KEY, uri);
  notify();
  return true;
}
export async function clearCustomAvatar() {
  await removeFile(customUri);
  customUri = null;
  await AsyncStorage.removeItem(KEY);
  notify();
}
async function removeFile(uri: string | null | undefined) {
  if (!uri || Platform.OS === "web") return;
  try {
    const { File } = await import("expo-file-system");
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {}
}

export function Avatar({
  id,
  size,
  mine = false,
  style,
}: {
  id: number;
  size: number;
  /** The player holding the phone, who may have swapped in a photo. */
  mine?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  const custom = useCustomAvatar();
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (mine && custom)
    return <Image source={{ uri: custom }} style={[round, style]} />;
  const n = ((id % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
  if (n < portraits.length)
    return <Image source={portraits[n]} style={[round, style]} />;
  const number = n - portraits.length + 1,
    color = COLORS[(number - 1) % 8],
    stripe = number > 8;
  return (
    <View
      style={[
        round,
        s.ball,
        { backgroundColor: stripe ? "#f6f1e4" : color },
        style as StyleProp<ViewStyle>,
      ]}
    >
      {stripe && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: color,
              marginVertical: size * 0.22,
            },
          ]}
        />
      )}
      <View
        style={[
          s.disc,
          { width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25 },
        ]}
      >
        <Text style={[s.number, { fontSize: size * 0.28 }]}>{number}</Text>
      </View>
      <View
        style={[
          s.shine,
          {
            width: size * 0.3,
            height: size * 0.18,
            borderRadius: size * 0.15,
            top: size * 0.12,
            left: size * 0.18,
          },
        ]}
      />
    </View>
  );
}
const s = StyleSheet.create({
  ball: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  disc: {
    backgroundColor: "#f6f1e4",
    alignItems: "center",
    justifyContent: "center",
  },
  number: { color: "#141414", fontWeight: "800" },
  shine: { position: "absolute", backgroundColor: "rgba(255,255,255,0.35)" },
});
