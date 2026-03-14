// File: mobile/src/game/ShotControls.tsx

import React, { useCallback, useRef, useState } from 'react';
import {
  View, StyleSheet, PanResponder, Animated, TouchableOpacity, Text,
} from 'react-native';

interface ShotControlsProps {
  onShoot: (aimAngle: number, power: number, spinX: number, spinY: number) => void;
  disabled?: boolean;
  /** Current aim angle in radians — controlled by pan gesture on table */
  aimAngle:   number;
  onAimChange: (angle: number) => void;
}

// ── Power Slider ──────────────────────────────────────────────────────────────

interface PowerSliderProps {
  power:    number;
  onChange: (p: number) => void;
}

const PowerSlider: React.FC<PowerSliderProps> = ({ power, onChange }) => {
  const TRACK_H  = 160;
  const KNOB_H   = 28;
  const maxTravel = TRACK_H - KNOB_H;

  const panY = useRef(new Animated.Value((1 - power) * maxTravel)).current;
  const powerRef = useRef(power);

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gs) => {
      const rawY = (1 - powerRef.current) * maxTravel + gs.dy;
      const clampedY = Math.max(0, Math.min(maxTravel, rawY));
      panY.setValue(clampedY);
      const newPower = 1 - clampedY / maxTravel;
      powerRef.current = newPower;
      onChange(newPower);
    },
    onPanResponderRelease: (_, gs) => {
      const rawY = (1 - powerRef.current) * maxTravel + gs.dy;
      const clampedY = Math.max(0, Math.min(maxTravel, rawY));
      panY.setValue(clampedY);
    },
  });

  const pct = Math.round(power * 100);
  const barColor = power > 0.7 ? '#EF4444' : power > 0.4 ? '#F97316' : '#22C55E';

  return (
    <View style={styles.sliderContainer}>
      <Text style={styles.sliderLabel}>{pct}%</Text>
      <View style={[styles.sliderTrack, { height: TRACK_H }]}>
        {/* Fill bar */}
        <View style={[
          styles.sliderFill,
          { height: power * TRACK_H, backgroundColor: barColor },
        ]} />
        {/* Knob */}
        <Animated.View
          style={[styles.sliderKnob, { top: panY }]}
          {...pan.panHandlers}
        />
      </View>
      <Text style={styles.sliderLabelSmall}>POWER</Text>
    </View>
  );
};

// ── Spin Pad ──────────────────────────────────────────────────────────────────

interface SpinPadProps {
  spinX: number;   // -1 to 1
  spinY: number;
  onChange: (x: number, y: number) => void;
}

const SpinPad: React.FC<SpinPadProps> = ({ spinX, spinY, onChange }) => {
  const SIZE    = 80;
  const HALF    = SIZE / 2;
  const DOT_R   = 8;
  const MAX_OFF = HALF - DOT_R - 4;

  const dotX = useRef(new Animated.Value(spinY * MAX_OFF)).current;
  const dotY = useRef(new Animated.Value(-spinX * MAX_OFF)).current;
  const curSpin = useRef({ x: spinX, y: spinY });

  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const lx = evt.nativeEvent.locationX - HALF;
      const ly = evt.nativeEvent.locationY - HALF;
      const dist = Math.sqrt(lx * lx + ly * ly);
      const clampedDist = Math.min(dist, MAX_OFF);
      const factor = clampedDist / (dist || 1);
      const nx = lx * factor;
      const ny = ly * factor;
      dotX.setValue(nx);
      dotY.setValue(ny);
      curSpin.current = { x: -ny / MAX_OFF, y: nx / MAX_OFF };
      onChange(curSpin.current.x, curSpin.current.y);
    },
    onPanResponderMove: (_, gs) => {
      const baseX = curSpin.current.y * MAX_OFF;
      const baseY = -curSpin.current.x * MAX_OFF;
      const nx = baseX + gs.dx;
      const ny = baseY + gs.dy;
      const dist = Math.sqrt(nx * nx + ny * ny);
      const clampedDist = Math.min(dist, MAX_OFF);
      const factor = clampedDist / (dist || 1);
      const cx = nx * factor;
      const cy = ny * factor;
      dotX.setValue(cx);
      dotY.setValue(cy);
      onChange(-cy / MAX_OFF, cx / MAX_OFF);
    },
  });

  return (
    <View style={styles.spinContainer}>
      <Text style={styles.sliderLabelSmall}>SPIN</Text>
      <View
        style={[styles.spinPad, { width: SIZE, height: SIZE }]}
        {...pan.panHandlers}
      >
        {/* Crosshair */}
        <View style={styles.spinCrossH} />
        <View style={styles.spinCrossV} />
        {/* Dot */}
        <Animated.View
          style={[
            styles.spinDot,
            {
              transform: [
                { translateX: dotX },
                { translateY: dotY },
              ],
            },
          ]}
        />
      </View>
    </View>
  );
};

// ── Main ShotControls ─────────────────────────────────────────────────────────

export const ShotControls: React.FC<ShotControlsProps> = ({
  onShoot, disabled = false, aimAngle, onAimChange,
}) => {
  const [power,  setPower]  = useState(0.5);
  const [spinX,  setSpinX]  = useState(0);
  const [spinY,  setSpinY]  = useState(0);

  const handleShoot = useCallback(() => {
    if (disabled) return;
    onShoot(aimAngle, power, spinX, spinY);
  }, [disabled, onShoot, aimAngle, power, spinX, spinY]);

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <PowerSlider power={power} onChange={setPower} />

      <TouchableOpacity
        style={[styles.shootBtn, disabled && styles.shootBtnDisabled]}
        onPress={handleShoot}
        disabled={disabled}
        activeOpacity={0.75}
      >
        <Text style={styles.shootBtnText}>SHOOT</Text>
      </TouchableOpacity>

      <SpinPad spinX={spinX} spinY={spinY} onChange={(x, y) => { setSpinX(x); setSpinY(y); }} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical:   10,
    backgroundColor:   '#111827',
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  disabled: { opacity: 0.4 },

  // Slider
  sliderContainer: { alignItems: 'center', gap: 4 },
  sliderLabel:     { color: '#F9FAFB', fontSize: 12, fontWeight: '700' },
  sliderLabelSmall:{ color: '#9CA3AF', fontSize: 10 },
  sliderTrack: {
    width: 24, borderRadius: 12,
    backgroundColor: '#374151',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  sliderFill: { width: '100%', borderRadius: 12 },
  sliderKnob: {
    position: 'absolute', left: -2, width: 28, height: 28,
    borderRadius: 14, backgroundColor: '#F9FAFB',
    borderWidth: 2, borderColor: '#6B7280',
  },

  // Shoot button
  shootBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 18, paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  shootBtnDisabled: { backgroundColor: '#374151' },
  shootBtnText: { color: '#F9FAFB', fontSize: 16, fontWeight: '800', letterSpacing: 1.5 },

  // Spin pad
  spinContainer: { alignItems: 'center', gap: 4 },
  spinPad: {
    borderRadius: 999, borderWidth: 1.5, borderColor: '#4B5563',
    backgroundColor: '#1F2937',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  spinCrossH: {
    position: 'absolute', width: '80%', height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  spinCrossV: {
    position: 'absolute', height: '80%', width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  spinDot: {
    position: 'absolute',
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#3B82F6',
    borderWidth: 1.5, borderColor: '#93C5FD',
  },
});
