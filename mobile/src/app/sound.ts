import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { session } from "../game/session";

/**
 * Interface sounds, synthesised by tools/build_sounds.py. Players are created on first use and
 * kept, so a tap never waits on a file. One switch silences these and the table together.
 */
const FILES = {
  tap: require("../../assets/audio/tap.wav"),
  tick: require("../../assets/audio/tick.wav"),
  coins: require("../../assets/audio/coins.wav"),
  reward: require("../../assets/audio/reward.wav"),
  win: require("../../assets/audio/win.wav"),
  lose: require("../../assets/audio/lose.wav"),
  drumroll: require("../../assets/audio/drumroll.wav"),
  search: require("../../assets/audio/search.wav"),
  turn: require("../../assets/audio/turn.wav"),
  whoosh: require("../../assets/audio/whoosh.wav"),
  match: require("../../assets/audio/match.wav"),
  levelup: require("../../assets/audio/levelup.wav"),
  error: require("../../assets/audio/error.wav"),
};
export type Sound = keyof typeof FILES;
const players: Partial<Record<Sound, AudioPlayer>> = {};
const KEY = "cuemaster.sound";
void AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === "off") session.sound = false;
  })
  .catch(() => {});

// Load every player shortly after launch: a player created on first use starts ~0.1 s late,
// which a once-a-match sound (opponent found, the drum roll, the result) cannot spare.
setTimeout(() => {
  for (const name of Object.keys(FILES) as Sound[])
    try {
      players[name] ??= createAudioPlayer(FILES[name]);
    } catch {
      // No audio on this device; sfx stays a no-op.
    }
}, 1500);
export function sfx(name: Sound, volume = 1) {
  if (!session.sound) return;
  try {
    const p = (players[name] ??= createAudioPlayer(FILES[name]));
    p.volume = volume;
    p.seekTo(0)
      .then(() => p.play())
      .catch(() => {});
  } catch {
    // A device that cannot play audio still plays the game.
  }
}
export function setSound(on: boolean) {
  session.sound = on;
  session.notify();
  void AsyncStorage.setItem(KEY, on ? "on" : "off").catch(() => {});
}
