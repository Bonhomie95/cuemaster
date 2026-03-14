// File: mobile/src/screens/SplashScreen.tsx

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions,
} from 'react-native';
import { SPLASH_VIBES, CATCHPHRASES, Colors, Typography } from '../design/tokens';

const { width, height } = Dimensions.get('window');

const vibe       = SPLASH_VIBES[Math.floor(Math.random() * SPLASH_VIBES.length)]!;
const catchphrase = CATCHPHRASES[Math.floor(Math.random() * CATCHPHRASES.length)]!;

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const logoScale   = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const ballOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Balls appear
      Animated.timing(ballOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      // Logo bounces in
      Animated.parallel([
        Animated.spring(logoScale,   { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      // Catchphrase fades in
      Animated.timing(textOpacity, { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }),
      // Hold
      Animated.delay(1_200),
      // Fade out all
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(ballOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start(() => onFinish());
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: vibe.bg[0] }]}>
      {/* Background gradient simulation */}
      <View style={[styles.gradientMid, { backgroundColor: vibe.bg[1] }]} />

      {/* Decorative balls scattered in background */}
      <Animated.View style={[styles.ballsContainer, { opacity: ballOpacity }]}>
        {BALL_DECORATIONS.map((b, i) => (
          <View
            key={i}
            style={[styles.decorBall, {
              width: b.size, height: b.size, borderRadius: b.size / 2,
              backgroundColor: b.color,
              left: b.x, top: b.y,
              opacity: b.opacity,
            }]}
          />
        ))}
      </Animated.View>

      {/* Logo area */}
      <Animated.View style={[styles.logoArea, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        {/* Logo placeholder — replace with actual image asset */}
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoBall}>🎱</Text>
        </View>
        <Text style={styles.appName}>CueMaster</Text>
        <View style={styles.goldLine} />
      </Animated.View>

      {/* Catchphrase */}
      <Animated.View style={[styles.phraseArea, { opacity: textOpacity }]}>
        <Text style={styles.catchphrase}>{catchphrase}</Text>
      </Animated.View>

      {/* Bottom vibe label */}
      <Animated.View style={[styles.bottomArea, { opacity: ballOpacity }]}>
        <Text style={styles.vibeLabel}>{vibe.label}</Text>
      </Animated.View>
    </View>
  );
};

// Fixed ball decoration positions (deterministic layout)
const BALL_DECORATIONS = [
  { x: '5%',  y: '10%', size: 40, color: Colors.ball1,  opacity: 0.25 },
  { x: '80%', y: '8%',  size: 32, color: Colors.ball2,  opacity: 0.20 },
  { x: '88%', y: '40%', size: 52, color: Colors.ball3,  opacity: 0.18 },
  { x: '75%', y: '75%', size: 36, color: Colors.ball4,  opacity: 0.22 },
  { x: '10%', y: '72%', size: 44, color: Colors.ball5,  opacity: 0.20 },
  { x: '3%',  y: '42%', size: 28, color: Colors.ball6,  opacity: 0.18 },
  { x: '45%', y: '5%',  size: 20, color: Colors.ball7,  opacity: 0.15 },
  { x: '50%', y: '85%', size: 38, color: Colors.ballCue,opacity: 0.12 },
];

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  gradientMid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  ballsContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  decorBall: {
    position: 'absolute',
  },
  logoArea: {
    alignItems: 'center',
    gap: 12,
  },
  logoPlaceholder: {
    width:  120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(249,168,37,0.12)',
    borderWidth: 2,
    borderColor: Colors.gold,
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
  },
  logoBall:  { fontSize: 64 },
  appName: {
    ...Typography.hero,
    fontSize:    48,
    fontWeight:  '900',
    color:       Colors.gold,
    letterSpacing: 4,
    textShadowColor:  Colors.goldDark,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  goldLine: {
    width: 180,
    height: 2,
    backgroundColor: Colors.gold,
    opacity: 0.6,
    borderRadius: 1,
  },
  phraseArea: {
    position: 'absolute',
    bottom: '22%',
    left: 40,
    right: 40,
    alignItems: 'center',
  },
  catchphrase: {
    ...Typography.lg,
    color:       Colors.whiteAlpha70,
    textAlign:   'center',
    fontStyle:   'italic',
    letterSpacing: 0.5,
  },
  bottomArea: {
    position: 'absolute',
    bottom: 32,
  },
  vibeLabel: {
    ...Typography.xs,
    color:         Colors.whiteAlpha30,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});
