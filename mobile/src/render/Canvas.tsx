import React from "react";
import { Canvas as NativeCanvas } from "@react-three/fiber/native";
type Props = React.ComponentProps<typeof NativeCanvas> & {
  dpr?: number | [number, number];
};
// Native R3F pins dpr to PixelRatio.get(): expo-gl cannot render below native resolution
// (expo/expo-three#39), so the web-only dpr cap is dropped here on purpose.
export function Canvas({ dpr, ...props }: Props) {
  return <NativeCanvas {...props} />;
}
