// File: mobile/src/store/authStore.ts

import { create } from 'zustand';
import { setTokens, post } from '../api/client';

interface UserProfile {
  _id:         string;
  username:    string;
  displayName: string;
  email:       string;
  role:        string;
  avatarUrl?:  string;
  country?:    string;
  coinBalance: number;
  elo: {
    rating: number; tier: string;
    wins: number; losses: number;
  };
}

interface AuthState {
  user:          UserProfile | null;
  isLoggedIn:    boolean;
  isLoading:     boolean;
  error:         string | null;

  login:    (email: string, password: string)                                                                          => Promise<void>;
  register: (payload: { username: string; email: string; password: string; displayName: string; dateOfBirth: string; country: string }) => Promise<void>;
  logout:   () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:       null,
  isLoggedIn: false,
  isLoading:  false,
  error:      null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await post<{ accessToken: string; refreshToken: string; user: UserProfile }>(
        '/api/auth/login', { email, password },
      );
      setTokens(res.accessToken, res.refreshToken);
      set({ user: res.user, isLoggedIn: true, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Login failed', isLoading: false });
    }
  },

  register: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const res = await post<{ accessToken: string; refreshToken: string; user: UserProfile }>(
        '/api/auth/register', payload,
      );
      setTokens(res.accessToken, res.refreshToken);
      set({ user: res.user, isLoggedIn: true, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Registration failed', isLoading: false });
    }
  },

  logout: () => {
    setTokens('', '');
    set({ user: null, isLoggedIn: false });
  },

  clearError: () => set({ error: null }),
}));
