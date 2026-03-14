// File: mobile/app/onboarding/index.tsx

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Animated, Image, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Felt, Typography, Radius, Shadow } from '../../src/design/tokens';
import { GoldButton } from '../../src/components/GoldButton';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { get, post } from '../../src/api/client';

// ── Avatar assets (emoji placeholders — replace with actual image assets) ──
const PRESET_AVATARS = [
  // Illustrated players
  { id: 'player_1', emoji: '🧑‍🎱', label: 'The Pro',      style: 'illustrated' },
  { id: 'player_2', emoji: '👩‍🎱', label: 'The Hustler',  style: 'illustrated' },
  { id: 'player_3', emoji: '🧔',   label: 'The Veteran',  style: 'illustrated' },
  { id: 'player_4', emoji: '👩',   label: 'The Rookie',   style: 'illustrated' },
  // Geometric
  { id: 'geo_1', emoji: '🔷', label: 'Blue Diamond', style: 'geometric' },
  { id: 'geo_2', emoji: '🔶', label: 'Gold Prism',   style: 'geometric' },
  { id: 'geo_3', emoji: '🔴', label: 'Red Circle',   style: 'geometric' },
  { id: 'geo_4', emoji: '🟢', label: 'Green Hex',    style: 'geometric' },
  // Emoji faces
  { id: 'emoji_1', emoji: '😎', label: 'Cool',       style: 'emoji' },
  { id: 'emoji_2', emoji: '🤩', label: 'Star',       style: 'emoji' },
  { id: 'emoji_3', emoji: '😤', label: 'Focused',    style: 'emoji' },
  { id: 'emoji_4', emoji: '🥷', label: 'Shadow',     style: 'emoji' },
  // Animal mascots
  { id: 'animal_1', emoji: '🦁', label: 'Lion',      style: 'animal' },
  { id: 'animal_2', emoji: '🐺', label: 'Wolf',      style: 'animal' },
  { id: 'animal_3', emoji: '🦊', label: 'Fox',       style: 'animal' },
  { id: 'animal_4', emoji: '🐯', label: 'Tiger',     style: 'animal' },
];

const SKILL_OPTIONS = [
  { id: 'beginner',     label: 'Beginner',     desc: 'Just learning the game',        icon: '🎱' },
  { id: 'intermediate', label: 'Intermediate', desc: 'Can run a few balls',            icon: '⚡' },
  { id: 'advanced',     label: 'Advanced',     desc: 'Competitive player, knows shots', icon: '🔥' },
];

const STEPS = ['username', 'avatar', 'skill', 'felt', 'notifications', 'age'] as const;
type Step = typeof STEPS[number];

export default function OnboardingScreen() {
  const router  = useRouter();
  const setFelt = useSettingsStore(s => s.setFelt);
  const authUser = useAuthStore(s => s.user);

  const [step,        setStep]        = useState<Step>('username');
  const [username,    setUsername]    = useState('');
  const [usernameOk,  setUsernameOk]  = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [customPhoto,    setCustomPhoto]    = useState<string | null>(null);
  const [skill,       setSkill]       = useState<string | null>(null);
  const [feltChoice,  setFeltChoice]  = useState<string>('green');
  const [notifOn,     setNotifOn]     = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [isSaving,    setIsSaving]    = useState(false);

  const progress = useRef(new Animated.Value(0)).current;
  const stepIdx  = STEPS.indexOf(step);

  // Animate progress bar
  Animated.timing(progress, {
    toValue:  ((stepIdx + 1) / STEPS.length) * 100,
    duration: 300,
    useNativeDriver: false,
  }).start();

  // ── Username availability check ────────────────────────────────────────────

  const checkUsername = useCallback(async (val: string) => {
    setUsername(val);
    setUsernameOk(null);
    if (val.length < 3) return;
    setCheckingUsername(true);
    try {
      await get(`/api/auth/check-username?username=${encodeURIComponent(val)}`);
      setUsernameOk(true);
    } catch {
      setUsernameOk(false);
    } finally {
      setCheckingUsername(false);
    }
  }, []);

  // ── Custom photo picker with basic content warning ─────────────────────────

  const pickPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to set your avatar.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    // TODO Phase 8: Send to content moderation API (AWS Rekognition / Google Vision SafeSearch)
    // For now, inform user that photo will be reviewed
    Alert.alert(
      'Photo selected',
      'Your photo will be reviewed to ensure it meets our community standards. It will be active once approved.',
      [{ text: 'OK', onPress: () => { setCustomPhoto(uri); setSelectedAvatar('custom'); } }],
    );
  }, []);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const canNext: boolean = (() => {
    switch (step) {
      case 'username':      return usernameOk === true && username.length >= 3;
      case 'avatar':        return selectedAvatar !== null;
      case 'skill':         return skill !== null;
      case 'felt':          return true;
      case 'notifications': return true;
      case 'age':           return ageConfirmed;
    }
  })();

  const goNext = useCallback(async () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]!);
    } else {
      await finish();
    }
  }, [step, username, selectedAvatar, skill, feltChoice, notifOn, ageConfirmed]);

  const finish = useCallback(async () => {
    setIsSaving(true);
    try {
      setFelt(feltChoice as import('../../src/design/tokens').FeltId);
      // TODO: POST onboarding data to API
      router.replace('/');
    } finally {
      setIsSaving(false);
    }
  }, [feltChoice, router]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Step: username ─────────────────────────────────────────── */}
        {step === 'username' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Pick your username</Text>
            <Text style={styles.stepSub}>This is how other players will know you. Choose wisely.</Text>

            <View style={styles.inputRow}>
              <TextInput
                style={[
                  styles.input,
                  usernameOk === true  && styles.inputOk,
                  usernameOk === false && styles.inputError,
                ]}
                value={username}
                onChangeText={checkUsername}
                placeholder="e.g. sharpshooter99"
                placeholderTextColor={Colors.gray500}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
              <View style={styles.inputStatus}>
                {checkingUsername && <ActivityIndicator color={Colors.gold} size="small" />}
                {!checkingUsername && usernameOk === true  && <Text style={styles.statusOk}>✓</Text>}
                {!checkingUsername && usernameOk === false && <Text style={styles.statusErr}>✗</Text>}
              </View>
            </View>

            {usernameOk === false && (
              <Text style={styles.errorText}>Username taken — try another</Text>
            )}
            {usernameOk === true && (
              <Text style={styles.successText}>✓ Available!</Text>
            )}
          </View>
        )}

        {/* ── Step: avatar ──────────────────────────────────────────── */}
        {step === 'avatar' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Choose your avatar</Text>
            <Text style={styles.stepSub}>Pick a preset or use your own photo.</Text>

            <View style={styles.avatarGrid}>
              {PRESET_AVATARS.map(av => (
                <TouchableOpacity
                  key={av.id}
                  style={[styles.avatarCell, selectedAvatar === av.id && styles.avatarCellSelected]}
                  onPress={() => { setSelectedAvatar(av.id); setCustomPhoto(null); }}
                >
                  <Text style={styles.avatarEmoji}>{av.emoji}</Text>
                  <Text style={styles.avatarLabel}>{av.label}</Text>
                </TouchableOpacity>
              ))}

              {/* Custom photo */}
              <TouchableOpacity
                style={[styles.avatarCell, selectedAvatar === 'custom' && styles.avatarCellSelected]}
                onPress={pickPhoto}
              >
                {customPhoto ? (
                  <Image source={{ uri: customPhoto }} style={styles.customPhoto} />
                ) : (
                  <Text style={styles.avatarEmoji}>📷</Text>
                )}
                <Text style={styles.avatarLabel}>My Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step: skill ───────────────────────────────────────────── */}
        {step === 'skill' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>What's your level?</Text>
            <Text style={styles.stepSub}>We'll match you with similar players at first.</Text>

            {SKILL_OPTIONS.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.optionCard, skill === s.id && styles.optionCardSelected]}
                onPress={() => setSkill(s.id)}
              >
                <Text style={styles.optionIcon}>{s.icon}</Text>
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, skill === s.id && { color: Colors.gold }]}>{s.label}</Text>
                  <Text style={styles.optionDesc}>{s.desc}</Text>
                </View>
                {skill === s.id && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Step: felt ────────────────────────────────────────────── */}
        {step === 'felt' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Your table colour</Text>
            <Text style={styles.stepSub}>Pick your default felt. You can unlock more later.</Text>

            <View style={styles.feltGrid}>
              {Object.values(Felt).map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.feltCell, feltChoice === f.id && styles.feltCellSelected]}
                  onPress={() => setFeltChoice(f.id)}
                >
                  <View style={[styles.feltSwatch, { backgroundColor: f.color }]} />
                  <Text style={styles.feltLabel}>{f.label}</Text>
                  {feltChoice === f.id && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Step: notifications ───────────────────────────────────── */}
        {step === 'notifications' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Notifications</Text>
            <Text style={styles.stepSub}>Stay in the loop when tournaments start, friends challenge you, and prizes drop.</Text>

            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleLabel}>Enable notifications</Text>
                <Text style={styles.toggleDesc}>Challenges, tournaments, prizes, daily bonuses</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, notifOn && styles.toggleOn]}
                onPress={() => setNotifOn(v => !v)}
              >
                <View style={[styles.toggleKnob, notifOn && styles.toggleKnobOn]} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step: age ─────────────────────────────────────────────── */}
        {step === 'age' && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Age verification</Text>
            <Text style={styles.stepSub}>CueMaster involves real prize competitions. You must be 18 or older to participate.</Text>

            <TouchableOpacity
              style={[styles.checkRow, ageConfirmed && styles.checkRowSelected]}
              onPress={() => setAgeConfirmed(v => !v)}
            >
              <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
                {ageConfirmed && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
              <Text style={styles.checkRowLabel}>I confirm I am 18 years of age or older</Text>
            </TouchableOpacity>

            <Text style={styles.legalNote}>
              By continuing you agree to our Terms of Service and Privacy Policy.
              Prize competitions are only available in eligible regions.
            </Text>
          </View>
        )}

      </ScrollView>

      {/* Bottom navigation */}
      <View style={styles.bottomNav}>
        {stepIdx > 0 && (
          <GoldButton
            label="Back"
            variant="ghost"
            onPress={() => setStep(STEPS[stepIdx - 1]!)}
          />
        )}
        <GoldButton
          label={step === 'age' ? "Let's Play! 🎱" : 'Continue'}
          onPress={goNext}
          disabled={!canNext}
          loading={isSaving}
          size={step === 'age' ? 'lg' : 'md'}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  scroll:  { padding: 24, paddingBottom: 120 },

  progressTrack: { height: 3, backgroundColor: Colors.gray800 },
  progressFill:  { height: 3, backgroundColor: Colors.gold },

  stepContainer: { gap: 20, paddingTop: 32 },
  stepTitle:     { ...Typography.xxl, fontWeight: '800', color: Colors.white },
  stepSub:       { ...Typography.base, color: Colors.gray400, lineHeight: 22 },

  // Username
  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1, height: 52,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.gray700,
    paddingHorizontal: 16,
    color: Colors.white,
    ...Typography.md,
  },
  inputOk:    { borderColor: Colors.success },
  inputError: { borderColor: Colors.danger },
  inputStatus: { width: 32, alignItems: 'center' },
  statusOk:    { color: Colors.success, fontSize: 20 },
  statusErr:   { color: Colors.danger,  fontSize: 20 },
  errorText:   { color: Colors.danger,  ...Typography.sm },
  successText: { color: Colors.success, ...Typography.sm },

  // Avatar grid
  avatarGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
  },
  avatarCell: {
    width: 80, height: 88, borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1.5, borderColor: Colors.gray700,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  avatarCellSelected: { borderColor: Colors.gold, backgroundColor: Colors.bgCardLight },
  avatarEmoji:  { fontSize: 32 },
  avatarLabel:  { ...Typography.xs, color: Colors.gray400, textAlign: 'center' },
  customPhoto:  { width: 44, height: 44, borderRadius: 22 },

  // Skill options
  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.gray700,
    padding: 16,
  },
  optionCardSelected: { borderColor: Colors.gold },
  optionIcon:   { fontSize: 28 },
  optionText:   { flex: 1 },
  optionLabel:  { ...Typography.md, fontWeight: '700', color: Colors.white },
  optionDesc:   { ...Typography.sm, color: Colors.gray400, marginTop: 2 },
  checkmark:    { color: Colors.gold, fontSize: 18, fontWeight: '800' },

  // Felt grid
  feltGrid: { gap: 10 },
  feltCell: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.gray700,
    padding: 12,
  },
  feltCellSelected: { borderColor: Colors.gold },
  feltSwatch: { width: 36, height: 36, borderRadius: Radius.sm },
  feltLabel:  { ...Typography.base, fontWeight: '600', color: Colors.white, flex: 1 },

  // Toggle
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 18,
  },
  toggleLabel: { ...Typography.md, fontWeight: '700', color: Colors.white },
  toggleDesc:  { ...Typography.sm, color: Colors.gray400, marginTop: 2, maxWidth: '85%' },
  toggle: {
    width: 52, height: 30, borderRadius: 15,
    backgroundColor: Colors.gray700,
    justifyContent: 'center', padding: 3,
  },
  toggleOn:  { backgroundColor: Colors.gold },
  toggleKnob: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.white,
  },
  toggleKnobOn: { alignSelf: 'flex-end' },

  // Age check
  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.gray700, padding: 16,
  },
  checkRowSelected: { borderColor: Colors.gold },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.gray500,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  checkboxTick:    { color: Colors.bg, fontWeight: '800', fontSize: 13 },
  checkRowLabel:   { ...Typography.base, color: Colors.white, flex: 1, lineHeight: 22 },
  legalNote:       { ...Typography.xs, color: Colors.gray500, lineHeight: 16, marginTop: 8 },

  // Bottom nav
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'flex-end', gap: 12,
    padding: 20, paddingBottom: 36,
    backgroundColor: Colors.bg,
    borderTopWidth: 1, borderTopColor: Colors.gray800,
  },
});
