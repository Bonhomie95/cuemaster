import { Platform } from "react-native";

/**
 * Local reminders: the crate that finished, the free coins that refilled, the streak about to
 * break. They are scheduled on the phone from times the server already sent, so nothing about
 * the player leaves the device and no push service is involved.
 *
 * Permission is asked once, at a moment the player has just started waiting for something,
 * never at launch. Every call is best-effort: a refused permission or a web build is a no-op.
 */
type Module = typeof import("expo-notifications");
let ready: Promise<Module | null> | null = null;
function load() {
  if (Platform.OS === "web") return Promise.resolve(null);
  ready ??= import("expo-notifications")
    .then(async (n) => {
      n.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      if (Platform.OS === "android")
        await n.setNotificationChannelAsync("rewards", {
          name: "Rewards and reminders",
          importance: n.AndroidImportance.DEFAULT,
        });
      return n;
    })
    .catch(() => null);
  return ready;
}
async function allowed(ask: boolean) {
  const n = await load();
  if (!n) return null;
  try {
    const current = await n.getPermissionsAsync();
    if (current.granted) return n;
    if (!ask || !current.canAskAgain) return null;
    return (await n.requestPermissionsAsync()).granted ? n : null;
  } catch {
    return null;
  }
}
/** Schedule (or replace) one reminder. Same id, same slot: a newer time simply moves it. */
export async function remind(
  id: string,
  when: Date,
  title: string,
  body: string,
  ask = true,
) {
  if (when.getTime() <= Date.now() + 30_000) return;
  const n = await allowed(ask);
  if (!n) return;
  await n
    .scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: {
        type: n.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: "rewards",
      },
    })
    .catch(() => {});
}
export async function forget(id: string) {
  const n = await load();
  await n?.cancelScheduledNotificationAsync(id).catch(() => {});
}
/** The Settings switch: asks for permission if it has not been refused, says whether it is on. */
export async function enableReminders() {
  return !!(await allowed(true));
}
/** Each visit pushes the "come back" nudge three days out, so only a lapsed player sees it. */
export function comeBack() {
  void remind(
    "comeback",
    new Date(Date.now() + 3 * 86_400_000),
    "Your table is waiting",
    "Free coins and a spin are ready. One rack?",
    false,
  );
}
