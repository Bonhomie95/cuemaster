import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
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
/** A lost rack: the defeat sting and one heavy tap. */
export const defeat = () => {
  sfx("lose", 0.75);
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
};
/** The table comes back to this player after the opponent's shot. */
export const yourTurn = () => {
  sfx("turn", 0.6);
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};
export const warn = () => {
  sfx("error", 0.6);
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    () => {},
  );
};
/** The screen stays on while a game is in play: the queue and the table. Native only. */
export const useAwake: (tag: string) => void =
  Platform.OS === "web"
    ? () => {}
    : (tag) => useKeepAwake(tag, { suppressDeactivateWarnings: true });
