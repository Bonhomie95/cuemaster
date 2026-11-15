import React from "react";
import { Canvas as NativeCanvas } from "@react-three/fiber/native";
type Props = React.ComponentProps<typeof NativeCanvas> & {
  dpr?: number | [number, number];
};
// Native R3F pins dpr to PixelRatio.get(): expo-gl cannot render below native resolution
// (expo/expo-three#39), so the web-only dpr cap is dropped here on purpose.
// collapsable: the wrapper View must stay in the native tree, or the GL view gets re-parented and
// expo-gl on iOS tears its context down (see TableHost).
export function Canvas({ dpr, ...props }: Props) {
  return <NativeCanvas collapsable={false} {...props} />;
}
