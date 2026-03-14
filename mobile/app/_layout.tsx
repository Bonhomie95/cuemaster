// File: mobile/app/_layout.tsx

import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack }          from 'expo-router';
import { StatusBar }      from 'expo-status-bar';
import { StyleSheet }     from 'react-native';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useState, useEffect }  from 'react';
import { SplashScreen }   from '../src/screens/SplashScreen';

export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);

  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={DarkTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)"           options={{ headerShown: false }} />
          <Stack.Screen name="game/[roomId]"    options={{ headerShown: false, gestureEnabled: false, orientation: 'landscape' }} />
          <Stack.Screen name="onboarding/index" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="leaderboard/index"options={{ headerShown: false }} />
          <Stack.Screen name="profile/index"    options={{ headerShown: false }} />
          <Stack.Screen name="store/index"      options={{ headerShown: false }} />
          <Stack.Screen name="modal"            options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="light" hidden />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
