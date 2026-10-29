export const welcome = require("../../assets/lounge/hero.jpg");
export const venueArt: Record<string, any> = {
  heritage: require("../../assets/lounge/heritage.jpg"),
  riviera: require("../../assets/lounge/riviera.jpg"),
  regent: require("../../assets/lounge/regent.jpg"),
  midnight: require("../../assets/lounge/midnight.jpg"),
  jade: require("../../assets/lounge/jade.jpg"),
  champion: require("../../assets/lounge/champion.jpg"),
};
export const portraits = [
  require("../../assets/avatars/player-natural.png"),
  require("../../assets/avatars/opponent-natural.png"),
];

export const clubRoom = require("../../assets/lounge/club-room-soft.jpg");

export const cueArt: Record<string, any> = {
  club: require("../../assets/cues/club.png"),
  precision: require("../../assets/cues/precision.png"),
  master: require("../../assets/cues/master.png"),
};

/** Rendered by tools/build_icons.py from Blender primitives; see that file to re-render. */
export const icons = {
  coin: require("../../assets/icons/coin.png"),
  ruby: require("../../assets/icons/ruby.png"),
  gift: require("../../assets/icons/gift.png"),
  pass: require("../../assets/icons/pass.png"),
  coins: [
    require("../../assets/icons/coins-1.png"),
    require("../../assets/icons/coins-2.png"),
    require("../../assets/icons/coins-3.png"),
    require("../../assets/icons/coins-4.png"),
  ],
  rubies: [
    require("../../assets/icons/ruby.png"),
    require("../../assets/icons/rubies-1.png"),
    require("../../assets/icons/rubies-2.png"),
    require("../../assets/icons/rubies-3.png"),
    require("../../assets/icons/rubies-3.png"),
  ],
  crate: {
    practice: require("../../assets/icons/crate-practice.png"),
    club: require("../../assets/icons/crate-club.png"),
    silver: require("../../assets/icons/crate-silver.png"),
    gold: require("../../assets/icons/crate-gold.png"),
    champion: require("../../assets/icons/crate-champion.png"),
    master: require("../../assets/icons/crate-master.png"),
  } as Record<string, any>,
};
