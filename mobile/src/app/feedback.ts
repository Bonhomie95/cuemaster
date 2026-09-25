import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Touch feel for the club.
 *
 * A tap that answers back is most of what separates a game from a form. Haptics are native
 * only and every call is best-effort: a device without a taptic engine, or a simulator, must
 * never surface an error for a button press.
 */
export const tap = () => {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};
export const commit = () => {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};
export const celebrate = () => {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
};
export const warn = () => {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    () => {},
  );
};
