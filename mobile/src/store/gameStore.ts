// File: mobile/src/store/gameStore.ts

import { create } from 'zustand';
import { MatchState, BallState, PlayerState, ShotInput, MatchResult } from '../types/game';

interface GameState {
  match:        MatchState | null;
  myUserId:     string;
  isConnected:  boolean;
  lastFoul:     string | null;
  matchResult:  MatchResult | null;
  errorMsg:     string | null;

  // Called by ColyseusClient when state changes arrive
  setMatch:       (match: MatchState)   => void;
  patchBalls:     (balls: BallState[])  => void;
  patchPlayers:   (players: Record<string, PlayerState>) => void;
  setConnected:   (v: boolean)          => void;
  setMyUserId:    (id: string)          => void;
  setFoul:        (type: string | null) => void;
  setMatchResult: (r: MatchResult)      => void;
  setError:       (msg: string | null)  => void;
  reset:          ()                    => void;
}

export const useGameStore = create<GameState>((set) => ({
  match:       null,
  myUserId:    '',
  isConnected: false,
  lastFoul:    null,
  matchResult: null,
  errorMsg:    null,

  setMatch:     (match)   => set({ match }),

  patchBalls:   (balls)   => set(s => s.match
    ? { match: { ...s.match, balls } }
    : s
  ),

  patchPlayers: (players) => set(s => s.match
    ? { match: { ...s.match, players } }
    : s
  ),

  setConnected:   (isConnected)  => set({ isConnected }),
  setMyUserId:    (myUserId)     => set({ myUserId }),
  setFoul:        (lastFoul)     => set({ lastFoul }),
  setMatchResult: (matchResult)  => set({ matchResult }),
  setError:       (errorMsg)     => set({ errorMsg }),

  reset: () => set({
    match: null, isConnected: false, lastFoul: null,
    matchResult: null, errorMsg: null,
  }),
}));
