import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { sfx, type Sound } from "./sound";

/**
 * Touch feel for the club.
 *
 * A tap that answers back is most of what separates a game from a form. Haptics are native
 * only and every call is best-effort: a device without a taptic engine, or a simulator, must
 * never surface an error for a button press.
 */
export const tap = () => {
  sfx("tap", 0.35);
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};
export const commit = () => {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};
/** A success: the haptic, and the reward chime unless a moment has its own sound. */
export const celebrate = (sound: Sound = "reward") => {
  sfx(sound, 0.8);
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
};
export const warn = () => {
  sfx("error", 0.6);
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    () => {},
  );
};
