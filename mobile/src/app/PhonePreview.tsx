import React, { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";

const clip = require("../../assets/video/welcome-play.mp4");
const poster = require("../../assets/video/welcome-play.jpg");
/** The clip's frame (1280 x 574), recorded from a real rack on a phone. */
const ASPECT = 574 / 1280;

/**
 * A phone playing a real rack on the welcome screen, so a first-time player sees the game before
 * signing up. Muted, looping, and mixed with whatever the phone is already playing.
 */
export default function PhonePreview({ width }: { width: number }) {
  const player = useVideoPlayer(clip, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });
  // Some players only start once the view is attached; the still frame covers the wait.
  useEffect(() => {
    player.play();
  }, [player]);
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const bezel = Math.round(width * 0.035),
    screen = { width: width - 2 * bezel, height: (width - 2 * bezel) * ASPECT };
  const height = screen.height + 2 * bezel;
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityLabel="A rack being played on a phone"
      style={[
        s.phone,
        { width, height, borderRadius: height * 0.17, padding: bezel },
      ]}
    >
      <View style={[s.button, { left: "24%", width: width * 0.07 }]} />
      <View style={[s.button, { left: "33%", width: width * 0.07 }]} />
      <View style={[s.screen, screen, { borderRadius: screen.height * 0.12 }]}>
        <VideoView
          player={player}
          style={[s.fill, screen]}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
          // A texture keeps the rounded corners and the tilt on Android.
          surfaceType="textureView"
        />
        {!isPlaying && <Image source={poster} style={[s.fill, screen]} />}
        <View
          style={[
            s.island,
            {
              left: screen.height * 0.06,
              top: screen.height * 0.34,
              width: screen.height * 0.07,
              height: screen.height * 0.32,
            },
          ]}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  phone: {
    backgroundColor: "#0b0f14",
    borderWidth: 1.5,
    borderColor: "#46525f",
    transform: [
      { perspective: 900 },
      { rotateY: "-14deg" },
      { rotate: "-2deg" },
    ],
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  screen: { overflow: "hidden", backgroundColor: "#081e30" },
  fill: { position: "absolute", left: 0, top: 0 },
  button: {
    position: "absolute",
    top: -3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#2c3742",
  },
  island: {
    position: "absolute",
    borderRadius: 99,
    backgroundColor: "#05070a",
  },
});
