import React, { useEffect, useRef, useState } from "react";
import { tap } from "./feedback";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  PressableProps,
  Text,
  TextProps,
  View,
  ViewProps,
  ViewStyle,
  StyleProp,
} from "react-native";

/**
 * The club's motion kit.
 *
 * Built on React Native's own Animated so it costs no dependency and no native rebuild.
 * Transforms and opacity run with the native driver; only the counting numbers touch JS, and
 * those are cheap. Nothing here loops forever unless it is on screen, so an idle club is idle.
 */

const spring = (value: Animated.Value, toValue: number) =>
  Animated.spring(value, {
    toValue,
    useNativeDriver: true,
    speed: 40,
    bounciness: 6,
  });

/** A Pressable that dips under the finger instead of just dimming. */
export function Press({
  children,
  style,
  outer,
  scale = 0.96,
  ...rest
}: PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Layout for the touch target itself, when the parent sizes it (a flex row item, say). */
  outer?: StyleProp<ViewStyle>;
  scale?: number;
}) {
  const value = useRef(new Animated.Value(1)).current;
  // The caller's style belongs on the animated box, not on the Pressable: it carries the
  // layout, and a bare Animated.View inside would stack the contents instead of laying them out.
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        spring(value, scale).start();
        if (!rest.disabled) tap();
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        spring(value, 1).start();
        rest.onPressOut?.(e);
      }}
      style={outer}
    >
      <Animated.View style={[style, { transform: [{ scale: value }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Mount transition: rise and fade in. `index` staggers a row or a grid so items arrive in
 * sequence rather than all at once, which is what makes a list feel dealt rather than drawn.
 */
export function Enter({
  children,
  index = 0,
  from = 14,
  duration = 320,
  style,
  ...rest
}: ViewProps & {
  children: React.ReactNode;
  index?: number;
  from?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay: Math.min(index, 8) * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index, duration]);
  return (
    <Animated.View
      {...rest}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [from, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A number that rolls up to its new value, so a reward lands instead of appearing. */
export function CountUp({
  value,
  duration = 900,
  format = (n: number) => n.toLocaleString(),
  style,
  ...rest
}: TextProps & {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const driver = new Animated.Value(0);
    const listener = driver.addListener(({ value: t }) =>
      setShown(Math.round(start + (value - start) * t)),
    );
    const animation = Animated.timing(driver, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(() => {
      setShown(value);
      from.current = value;
    });
    return () => {
      animation.stop();
      driver.removeListener(listener);
      from.current = value;
    };
  }, [value, duration]);
  return (
    <Text {...rest} style={style}>
      {format(shown)}
    </Text>
  );
}

/** A slow breath for something waiting to be collected. */
export function Pulse({
  children,
  active = true,
  style,
}: {
  children: React.ReactNode;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, value]);
  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            {
              scale: value.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.06],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The crate opening. It braces, shakes loose, then bursts: a short rattle building in
 * amplitude, a flash of light, and the lid gone. The reward is revealed on completion, so the
 * numbers never appear before the box opens.
 */
export function CrateBurst({
  playing,
  onDone,
  children,
}: {
  playing: boolean;
  onDone: () => void;
  children: React.ReactNode;
}) {
  const shake = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!playing) {
      shake.setValue(0);
      lift.setValue(0);
      flash.setValue(0);
      return;
    }
    const rattle = (to: number, duration: number) =>
      Animated.timing(shake, {
        toValue: to,
        duration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const animation = Animated.sequence([
      Animated.timing(lift, {
        toValue: 0.35,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      rattle(-1, 70),
      rattle(1, 70),
      rattle(-1, 60),
      rattle(1, 60),
      rattle(-1, 50),
      rattle(1, 50),
      rattle(0, 40),
      Animated.parallel([
        Animated.timing(lift, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.back(2.2)),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(flash, {
            toValue: 1,
            duration: 140,
            useNativeDriver: true,
          }),
          Animated.timing(flash, {
            toValue: 0,
            duration: 420,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);
    animation.start(({ finished }) => finished && onDone());
    return () => animation.stop();
    // onDone is called once per play; re-running on identity changes would double-fire it.
  }, [playing]);
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 190,
          height: 190,
          borderRadius: 95,
          backgroundColor: "#ffe9b5",
          opacity: flash.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0.85],
          }),
          transform: [
            {
              scale: flash.interpolate({
                inputRange: [0, 1],
                outputRange: [0.4, 1.9],
              }),
            },
          ],
        }}
      />
      <Animated.View
        style={{
          transform: [
            {
              translateX: shake.interpolate({
                inputRange: [-1, 1],
                outputRange: [-9, 9],
              }),
            },
            {
              rotate: shake.interpolate({
                inputRange: [-1, 1],
                outputRange: ["-7deg", "7deg"],
              }),
            },
            {
              scale: lift.interpolate({
                inputRange: [0, 0.35, 1],
                outputRange: [1, 0.92, 1.25],
              }),
            },
          ],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** Cross-fades whatever is rendered for `token`, so pages change instead of cutting. */
export function PageFade({
  token,
  children,
  style,
}: {
  token: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: Platform.OS === "web" ? 200 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [token, progress]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
