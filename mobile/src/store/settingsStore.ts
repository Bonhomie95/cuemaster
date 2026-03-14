// File: mobile/src/store/settingsStore.ts

import { create } from 'zustand';
import { FeltId } from '../design/tokens';

interface SoundSettings {
  ballCollision:  boolean;
  ambientMusic:   boolean;
  victoryJingle:  boolean;
  countdownTick:  boolean;
  crowdReaction:  boolean;
  masterEnabled:  boolean;
}

interface AimAssistSettings {
  extendedAimLine:    boolean;
  wallReflection:     boolean;
  objectTrajectory:   boolean;
}

interface SettingsState {
  feltId:     FeltId;
  sound:      SoundSettings;
  aimAssist:  AimAssistSettings;
  vibration:  boolean;
  notifications: boolean;

  setFelt:        (id: FeltId) => void;
  setSound:       (key: keyof SoundSettings, val: boolean) => void;
  setAimAssist:   (key: keyof AimAssistSettings, val: boolean) => void;
  setVibration:   (val: boolean) => void;
  setNotifications: (val: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  feltId: 'green',

  sound: {
    ballCollision:  false,
    ambientMusic:   false,
    victoryJingle:  false,
    countdownTick:  false,
    crowdReaction:  false,
    masterEnabled:  false,
  },

  aimAssist: {
    extendedAimLine:  true,
    wallReflection:   true,
    objectTrajectory: true,
  },

  vibration:     true,
  notifications: false,

  setFelt:   (feltId) => set({ feltId }),
  setSound:  (key, val) => set(s => ({ sound: { ...s.sound, [key]: val } })),
  setAimAssist: (key, val) => set(s => ({ aimAssist: { ...s.aimAssist, [key]: val } })),
  setVibration:    (vibration)     => set({ vibration }),
  setNotifications: (notifications) => set({ notifications }),
}));
