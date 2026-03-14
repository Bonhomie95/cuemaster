// File: mobile/app/_layout.tsx

import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack }          from 'expo-router';
import { StatusBar }      from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={DarkTheme}>
        <Stack>
          <Stack.Screen name="(tabs)"       options={{ headerShown: false }} />
          <Stack.Screen name="game/[roomId]" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="modal"        options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
