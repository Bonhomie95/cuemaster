// File: mobile/src/components/GoldButton.tsx

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Colors, Radius, Typography } from '../design/tokens';

interface GoldButtonProps {
  label:      string;
  onPress:    () => void;
  loading?:   boolean;
  disabled?:  boolean;
  size?:      'sm' | 'md' | 'lg' | 'hero';
  variant?:   'gold' | 'outline' | 'ghost' | 'danger';
  icon?:      string;
  fullWidth?: boolean;
}

export const GoldButton: React.FC<GoldButtonProps> = ({
  label, onPress, loading = false, disabled = false,
  size = 'md', variant = 'gold', icon, fullWidth = false,
}) => {
  const s = sizeStyles[size];
  const v = variantStyles[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.78}
      style={[
        styles.base, s.container, v.container,
        disabled && styles.disabled,
        fullWidth && styles.fullWidth,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'gold' ? Colors.bg : Colors.gold} size="small" />
      ) : (
        <View style={styles.row}>
          {icon && <Text style={[s.text, v.text]}>{icon} </Text>}
          <Text style={[s.text, v.text]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base:      { borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  disabled:  { opacity: 0.45 },
  fullWidth: { width: '100%' },
  row:       { flexDirection: 'row', alignItems: 'center' },
});

const sizeStyles = {
  sm:   { container: { paddingVertical: 8,  paddingHorizontal: 16 }, text: { ...Typography.sm,   fontWeight: '700' as const } },
  md:   { container: { paddingVertical: 12, paddingHorizontal: 24 }, text: { ...Typography.base, fontWeight: '700' as const } },
  lg:   { container: { paddingVertical: 16, paddingHorizontal: 32 }, text: { ...Typography.lg,   fontWeight: '800' as const } },
  hero: { container: { paddingVertical: 22, paddingHorizontal: 48 }, text: { ...Typography.xxl,  fontWeight: '900' as const, letterSpacing: 2 } },
};

const variantStyles = {
  gold: {
    container: { backgroundColor: Colors.gold, shadowColor: Colors.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 10 },
    text:      { color: Colors.bg },
  },
  outline: {
    container: { borderWidth: 1.5, borderColor: Colors.gold, backgroundColor: 'transparent' },
    text:      { color: Colors.gold },
  },
  ghost: {
    container: { backgroundColor: 'rgba(249,168,37,0.12)' },
    text:      { color: Colors.gold },
  },
  danger: {
    container: { backgroundColor: Colors.danger },
    text:      { color: Colors.white },
  },
};
