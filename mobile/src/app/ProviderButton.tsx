import React, { useEffect, useState } from "react";
import { Platform, View, Text } from "react-native";
import * as Apple from "expo-apple-authentication";
import { GoogleSigninButton } from "@react-native-google-signin/google-signin";
export type ProviderButtonProps = {
  provider: "google" | "apple";
  onPress: () => void;
  disabled?: boolean;
  connected?: boolean;
};
export default function ProviderButton({
  provider,
  onPress,
  disabled,
  connected,
}: ProviderButtonProps) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === "ios")
      void Apple.isAvailableAsync()
        .then(setAppleAvailable)
        .catch(() => {});
  }, []);
  if (provider === "apple" && !appleAvailable) return null;
  if (connected)
    return (
      <View style={{ minHeight: 48, justifyContent: "center" }}>
        <Text style={{ color: "#9dd8c2", fontSize: 12 }}>
          {provider === "google" ? "Google" : "Apple"} connected ✓
        </Text>
      </View>
    );
  return (
    <View
      pointerEvents={disabled ? "none" : "auto"}
      style={{ opacity: disabled ? 0.4 : 1, marginTop: 8 }}
    >
      {provider === "google" ? (
        <GoogleSigninButton
          style={{ width: 220, height: 48 }}
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Dark}
          onPress={onPress}
          disabled={disabled}
        />
      ) : (
        <Apple.AppleAuthenticationButton
          buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={Apple.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={8}
          style={{ width: 220, height: 48 }}
          onPress={onPress}
        />
      )}
    </View>
  );
}
