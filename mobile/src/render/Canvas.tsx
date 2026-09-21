import React from "react";
import { Canvas as NativeCanvas } from "@react-three/fiber/native";
type Props = React.ComponentProps<typeof NativeCanvas> & {
  dpr?: number | [number, number];
};
export function Canvas({ dpr, ...props }: Props) {
  return <NativeCanvas {...props} />;
}
