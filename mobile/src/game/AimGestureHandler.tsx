// File: mobile/src/game/AimGestureHandler.tsx

import React, { useRef } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';
import { TableLayout } from './TableRenderer';
import { BallState, TABLE_WIDTH, TABLE_HEIGHT } from '../types/game';

interface AimGestureHandlerProps {
  layout:       TableLayout;
  cueBall:      BallState | null;
  isBallInHand: boolean;
  isMyTurn:     boolean;
  aimAngle:     number;
  onAimChange:  (angle: number) => void;
  onPlaceBall:  (x: number, y: number) => void;
  children:     React.ReactNode;
}

export const AimGestureHandler: React.FC<AimGestureHandlerProps> = ({
  layout, cueBall, isBallInHand, isMyTurn,
  aimAngle, onAimChange, onPlaceBall, children,
}) => {
  const { offsetX, offsetY, scale } = layout;

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => isMyTurn,
    onMoveShouldSetPanResponder:  () => isMyTurn,

    onPanResponderGrant: (evt) => {
      if (!isMyTurn) return;
      const lx = evt.nativeEvent.pageX;
      const ly = evt.nativeEvent.pageY;

      if (isBallInHand) {
        // Convert screen coords to table mm
        const mmX = (lx - offsetX) / scale;
        const mmY = (ly - offsetY) / scale;
        // Clamp inside table
        const cx = Math.max(60, Math.min(TABLE_WIDTH  - 60, mmX));
        const cy = Math.max(60, Math.min(TABLE_HEIGHT - 60, mmY));
        onPlaceBall(cx, cy);
      } else if (cueBall) {
        const cueCx = offsetX + cueBall.x * scale;
        const cueCy = offsetY + cueBall.y * scale;
        const dx = lx - cueCx;
        const dy = ly - cueCy;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
          onAimChange(Math.atan2(dy, dx));
        }
      }
    },

    onPanResponderMove: (evt) => {
      if (!isMyTurn || isBallInHand || !cueBall) return;
      const lx = evt.nativeEvent.pageX;
      const ly = evt.nativeEvent.pageY;
      const cueCx = offsetX + cueBall.x * scale;
      const cueCy = offsetY + cueBall.y * scale;
      onAimChange(Math.atan2(ly - cueCy, lx - cueCx));
    },
  });

  return (
    <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
      {children}
    </View>
  );
};
