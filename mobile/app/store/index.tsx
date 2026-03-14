// File: mobile/app/store/index.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Radius, Shadow } from '../../src/design/tokens';
import { GoldButton } from '../../src/components/GoldButton';
import { useAuthStore } from '../../src/store/authStore';

const COIN_PACKS = [
  { id: 'starter',  coins: 500,    bonus: 0,     price: '$0.99',  skuId: 'cuemaster_coins_500',   highlight: false },
  { id: 'player',   coins: 1200,   bonus: 100,   price: '$1.99',  skuId: 'cuemaster_coins_1200',  highlight: false },
  { id: 'pro',      coins: 3000,   bonus: 500,   price: '$4.99',  skuId: 'cuemaster_coins_3000',  highlight: true,  badge: 'Most Popular' },
  { id: 'champion', coins: 7000,   bonus: 1500,  price: '$9.99',  skuId: 'cuemaster_coins_7000',  highlight: false },
  { id: 'master',   coins: 20000,  bonus: 5000,  price: '$24.99', skuId: 'cuemaster_coins_20000', highlight: false, badge: 'Best Value' },
];

const CUE_SKINS = [
  { id: 'maple',    name: 'Maple Classic',    icon: '🪵', price: 500,  unlocked: true  },
  { id: 'carbon',   name: 'Carbon Fibre',     icon: '⚫', price: 1200, unlocked: false },
  { id: 'chrome',   name: 'Chrome Edition',   icon: '🔩', price: 2000, unlocked: false },
  { id: 'gold_cue', name: 'Gold Master Cue',  icon: '✨', price: 5000, unlocked: false },
];

export default function StoreScreen() {
  const router  = useRouter();
  const user    = useAuthStore(s => s.user);
  const [activeTab, setActiveTab] = useState<'coins' | 'cues' | 'vip'>('coins');

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🛍️ Store</Text>
        <View style={styles.balanceChip}>
          <Text style={styles.balanceText}>🪙 {user?.coinBalance?.toLocaleString() ?? '0'}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['coins', 'cues', 'vip'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && styles.tabActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'coins' ? '🪙 Coins' : t === 'cues' ? '🎱 Cues' : '👑 VIP'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Coins tab ─────────────────────────────────────────── */}
        {activeTab === 'coins' && (
          <View style={styles.section}>
            <Text style={styles.sectionNote}>Coins are used to enter tournaments. They cannot be withdrawn as cash.</Text>
            {COIN_PACKS.map(pack => (
              <TouchableOpacity
                key={pack.id}
                style={[styles.packCard, pack.highlight && styles.packCardHighlight]}
              >
                {pack.badge && (
                  <View style={styles.packBadge}>
                    <Text style={styles.packBadgeText}>{pack.badge}</Text>
                  </View>
                )}
                <View style={styles.packLeft}>
                  <Text style={styles.packCoins}>{pack.coins.toLocaleString()}</Text>
                  {pack.bonus > 0 && (
                    <Text style={styles.packBonus}>+{pack.bonus.toLocaleString()} bonus</Text>
                  )}
                  <Text style={styles.packLabel}>coins</Text>
                </View>
                <GoldButton
                  label={pack.price}
                  variant={pack.highlight ? 'gold' : 'outline'}
                  size="sm"
                  onPress={() => {}}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Cues tab ──────────────────────────────────────────── */}
        {activeTab === 'cues' && (
          <View style={styles.section}>
            {CUE_SKINS.map(cue => (
              <View key={cue.id} style={[styles.cueCard, cue.unlocked && styles.cueCardOwned]}>
                <Text style={styles.cueIcon}>{cue.icon}</Text>
                <View style={styles.cueInfo}>
                  <Text style={styles.cueName}>{cue.name}</Text>
                  {cue.unlocked
                    ? <Text style={styles.cueOwned}>Owned ✓</Text>
                    : <Text style={styles.cuePrice}>🪙 {cue.price.toLocaleString()}</Text>
                  }
                </View>
                {!cue.unlocked && (
                  <GoldButton label="Buy" variant="outline" size="sm" onPress={() => {}} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── VIP tab ───────────────────────────────────────────── */}
        {activeTab === 'vip' && (
          <View style={styles.section}>
            <View style={styles.vipCard}>
              <Text style={styles.vipIcon}>👑</Text>
              <Text style={styles.vipTitle}>CueMaster VIP</Text>
              <Text style={styles.vipPrice}>$4.99 / month</Text>
              <View style={styles.vipPerks}>
                {[
                  '1,000 coins every month',
                  'Exclusive VIP cosmetics',
                  'Priority matchmaking',
                  'Detailed shot analytics',
                  'No ads',
                ].map(perk => (
                  <View key={perk} style={styles.perkRow}>
                    <Text style={styles.perkCheck}>✓</Text>
                    <Text style={styles.perkText}>{perk}</Text>
                  </View>
                ))}
              </View>
              <GoldButton label="Subscribe" variant="gold" size="lg" onPress={() => {}} fullWidth />
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.gray800,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText:    { color: Colors.gold, fontSize: 28, fontWeight: '300' },
  title:       { ...Typography.xl, fontWeight: '800', color: Colors.white },
  balanceChip: {
    backgroundColor: Colors.bgCardLight, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.gold + '40',
  },
  balanceText: { ...Typography.sm, fontWeight: '700', color: Colors.gold },

  tabs: { flexDirection: 'row', padding: 16, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 9, borderRadius: Radius.md,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.gray700,
    alignItems: 'center',
  },
  tabActive:     { backgroundColor: Colors.gold + '20', borderColor: Colors.gold },
  tabText:       { ...Typography.sm, fontWeight: '600', color: Colors.gray400 },
  tabTextActive: { color: Colors.gold, fontWeight: '800' },

  section:     { gap: 10 },
  sectionNote: { ...Typography.xs, color: Colors.gray500, lineHeight: 16, marginBottom: 4 },

  packCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    padding: 16, borderWidth: 1.5, borderColor: Colors.gray700,
    position: 'relative', overflow: 'hidden',
  },
  packCardHighlight: { borderColor: Colors.gold, ...Shadow.gold },
  packBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: Colors.gold, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  packBadgeText: { ...Typography.xs, fontWeight: '800', color: Colors.bg },
  packLeft:      { gap: 2 },
  packCoins:     { ...Typography.xxl, fontWeight: '900', color: Colors.white },
  packBonus:     { ...Typography.xs, color: Colors.success },
  packLabel:     { ...Typography.xs, color: Colors.gray400 },

  cueCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    padding: 14, borderWidth: 1, borderColor: Colors.gray800,
  },
  cueCardOwned: { borderColor: Colors.success + '40' },
  cueIcon:  { fontSize: 28 },
  cueInfo:  { flex: 1 },
  cueName:  { ...Typography.base, fontWeight: '700', color: Colors.white },
  cueOwned: { ...Typography.sm, color: Colors.success, marginTop: 2 },
  cuePrice: { ...Typography.sm, color: Colors.gold, marginTop: 2 },

  vipCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    padding: 24, alignItems: 'center', gap: 14,
    borderWidth: 2, borderColor: Colors.gold,
    ...Shadow.gold,
  },
  vipIcon:  { fontSize: 48 },
  vipTitle: { ...Typography.xxl, fontWeight: '900', color: Colors.gold },
  vipPrice: { ...Typography.lg,  color: Colors.goldLight },
  vipPerks: { width: '100%', gap: 10, marginVertical: 4 },
  perkRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkCheck:{ color: Colors.gold, fontWeight: '800', fontSize: 16 },
  perkText: { ...Typography.base, color: Colors.white },
});
