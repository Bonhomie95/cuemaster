import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { Enter } from "./motion";

type Icon = React.ComponentProps<typeof Feather>["name"];
const SECTIONS: {
  title: string;
  icon: Icon;
  accent: string;
  lines: string[];
}[] = [
  {
    title: "Aim and shoot",
    icon: "crosshair",
    accent: "#24dbb3",
    lines: [
      "Drag anywhere on the cloth: the cue follows your finger.",
      "The ghost ball shows the contact; the short lines show where both balls go.",
      "Turn the AIM wheel on the right for hair-line corrections.",
      "Pull the cue on the left down and let go to shoot. Slide back to the top to cancel.",
      "Tap SPIN and move the red dot: low draws back, high follows through, left and right add side.",
    ],
  },
  {
    title: "8-ball in a minute",
    icon: "circle",
    accent: "#ffd05b",
    lines: [
      "The first ball you pot after the break makes your group: solids (1–7) or stripes (9–15).",
      "Clear your group, then pot the 8 to win.",
      "Fouls give your opponent ball in hand: hitting the wrong ball first, no ball reaching a cushion, potting the cue ball, or running out of time.",
      "Pot the 8 early, or with a foul, and the rack is lost.",
    ],
  },
  {
    title: "Coins, crates, rubies",
    icon: "gift",
    accent: "#ff5f6d",
    lines: [
      "Coins pay the table entry. Win and you take the pot: both entries.",
      "Every win seals a crate. One unlocks at a time; a video takes an hour off, rubies open it now.",
      "Rubies come from crates, the wheel, the pass, invites and the shop.",
    ],
  },
  {
    title: "Every day",
    icon: "calendar",
    accent: "#4aa8ff",
    lines: [
      "Free coins every four hours and a free spin of the prize wheel.",
      "A login streak that builds to a Silver crate on day seven.",
      "Three missions a day, and the season pass with a reward on every tier.",
      "The Daily Shot: one layout for everyone, fewest shots wins.",
    ],
  },
  {
    title: "Fair play",
    icon: "shield",
    accent: "#b98cff",
    lines: [
      "Every online shot is replayed on our server, so nobody can fake a pot.",
      "Computer opponents are always labelled HOUSE.",
      "Crates are earned, never sold. The odds are published under Settings.",
    ],
  },
];

/** The rules and controls on one page, for players arriving from other pool games. */
export default function HowToPlay() {
  return (
    <ScrollView contentContainerStyle={s.page}>
      {SECTIONS.map((section, i) => (
        <Enter key={section.title} index={i} style={s.card}>
          <View style={s.head}>
            <View style={[s.icon, { backgroundColor: `${section.accent}22` }]}>
              <Feather name={section.icon} size={17} color={section.accent} />
            </View>
            <Text style={s.title}>{section.title}</Text>
          </View>
          {section.lines.map((line) => (
            <View key={line} style={s.line}>
              <View style={[s.bullet, { backgroundColor: section.accent }]} />
              <Text style={s.text}>{line}</Text>
            </View>
          ))}
        </Enter>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 16,
    maxWidth: 1100,
    alignSelf: "center",
  },
  card: {
    flexGrow: 1,
    flexBasis: 300,
    gap: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffffff1f",
    backgroundColor: "#04121def",
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#fffdf3", fontSize: 16, fontWeight: "900" },
  line: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  text: { flex: 1, color: "#c3d8e6", fontSize: 12.5, lineHeight: 18 },
});
