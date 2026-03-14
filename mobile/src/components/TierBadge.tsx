// File: mobile/src/components/TierBadge.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TIER_LABELS, Colors, Radius, Typography } from '../design/tokens';

interface TierBadgeProps {
  tier:   string;
  size?:  'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const TierBadge: React.FC<TierBadgeProps> = ({ tier, size = 'md', showLabel = true }) => {
  const info = TIER_LABELS[tier] ?? TIER_LABELS['beginner']!;
  const s    = sizeMap[size];

  return (
    <View style={[styles.badge, s.badge, { borderColor: info.color }]}>
      <Text style={s.icon}>{info.icon}</Text>
      {showLabel && (
        <Text style={[styles.label, s.label, { color: info.color }]}>
          {info.label}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   Radius.full,
    borderWidth:    1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    gap: 4,
  },
  label: { fontWeight: '700' },
});

const sizeMap = {
  sm: {
    badge: { paddingHorizontal: 6,  paddingVertical: 2 },
    icon:  { fontSize: 10 },
    label: { ...Typography.xs },
  },
  md: {
    badge: { paddingHorizontal: 10, paddingVertical: 4 },
    icon:  { fontSize: 13 },
    label: { ...Typography.sm },
  },
  lg: {
    badge: { paddingHorizontal: 14, paddingVertical: 6 },
    icon:  { fontSize: 16 },
    label: { ...Typography.base },
  },
};
