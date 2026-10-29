import { create } from 'zustand';

import { tokenStorage } from '@/services/tokenStorage';
import type { CurrentUser } from '@/types/api';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: CurrentUser | null;
  accessToken: string | null;
  /** Reason for the last automatic sign-out (shown on the login screen). */
  notice: string | null;
  setSession: (user: CurrentUser, accessToken: string, refreshToken: string) => Promise<void>;
  setAccessToken: (token: string) => void;
  setUser: (user: CurrentUser) => void;
  setStatus: (status: Status) => void;
  signOut: (notice?: string | null) => Promise<void>;
  clearNotice: () => void;
}

const signOutListeners = new Set<() => void>();

/** Lets other modules (query cache, cart) clear their state on sign-out without import cycles. */
export function onSignOut(listener: () => void): () => void {
  signOutListeners.add(listener);
  return () => signOutListeners.delete(listener);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  notice: null,
  setSession: async (user, accessToken, refreshToken) => {
    await tokenStorage.setRefreshToken(refreshToken);
    set({ user, accessToken, status: 'signedIn', notice: null });
  },
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  signOut: async (notice = null) => {
    if (get().status === 'signedOut' && !get().user) return;
    await tokenStorage.clearRefreshToken();
    set({ user: null, accessToken: null, status: 'signedOut', notice });
    signOutListeners.forEach((listener) => listener());
  },
  clearNotice: () => set({ notice: null }),
}));

export const selectIsAdmin = (state: AuthState) => state.user?.role === 'ADMIN';
