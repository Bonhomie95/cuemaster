import React from "react";
import { Pressable, Text } from "react-native";
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
  const label = connected
    ? `${provider === "google" ? "Google" : "Apple"} connected`
    : `Continue with ${provider === "google" ? "Google" : "Apple"}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || connected}
      onPress={onPress}
      style={{
        minHeight: 48,
        paddingHorizontal: 18,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#425464",
        borderRadius: 8,
        backgroundColor: "#172939",
        marginTop: 8,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: "#e4edf3", fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}
