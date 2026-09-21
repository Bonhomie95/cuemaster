import React from "react";
import { Pressable, StyleSheet } from "react-native";
import Feather from "@expo/vector-icons/Feather";
type Icon = React.ComponentProps<typeof Feather>["name"];
export default function IconButton({
  icon,
  label,
  onPress,
  selected = false,
  disabled = false,
}: {
  icon: Icon;
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.iconButton,
        selected && s.iconSelected,
        (disabled || pressed) && { opacity: disabled ? 0.3 : 0.65 },
      ]}
    >
      <Feather name={icon} size={21} color={selected ? "#e9c88f" : "#b5c4d0"} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  iconSelected: {
    backgroundColor: "#d4b47a24",
    borderWidth: 1,
    borderColor: "#d4b47a55",
  },
});
