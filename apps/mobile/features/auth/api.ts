import { useMutation } from '@tanstack/react-query';

import { api, refreshAccessToken } from '@/services/api';
import { unregisterPushToken } from '@/services/push';
import { tokenStorage } from '@/services/tokenStorage';
import { useAuthStore } from '@/stores/auth';
import type { CurrentUser, LoginResponse, TokenPair } from '@/types/api';

/** Restore a remembered session at startup using the stored refresh token. */
export async function bootstrapSession(): Promise<void> {
  const store = useAuthStore.getState();
  try {
    const token = await refreshAccessToken();
    if (!token) {
      store.setStatus('signedOut');
      return;
    }
    const { data } = await api.get<CurrentUser>('/auth/me');
    useAuthStore.setState({ user: data, status: 'signedIn' });
  } catch {
    // Network problems keep the stored token so the next launch can retry.
    useAuthStore.setState({ status: 'signedOut', user: null, accessToken: null });
  }
}

export function useLogin() {
  return useMutation({
    mutationFn: async (input: { username: string; password: string }) => {
      const { data } = await api.post<LoginResponse>('/auth/login', input);
      await useAuthStore.getState().setSession(data.user, data.access_token, data.refresh_token);
      return data;
    },
  });
}

export async function logout(): Promise<void> {
  try {
    const refreshToken = await tokenStorage.getRefreshToken();
    const pushToken = await tokenStorage.getPushToken();
    await api.post('/auth/logout', { refresh_token: refreshToken, push_token: pushToken });
    await unregisterPushToken();
  } catch {
    // Signing out locally must always succeed.
  }
  await useAuthStore.getState().signOut();
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: { current_password: string; new_password: string }) => {
      const { data } = await api.post<TokenPair>('/auth/change-password', input);
      const user = useAuthStore.getState().user;
      await tokenStorage.setRefreshToken(data.refresh_token);
      useAuthStore.getState().setAccessToken(data.access_token);
      if (user) useAuthStore.getState().setUser({ ...user, must_change_password: false });
      return data;
    },
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (username: string) => {
      const { data } = await api.post<{ message: string }>('/auth/request-password-reset', { username });
      return data;
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: { username: string; code: string; new_password: string }) => {
      const { data } = await api.post<{ message: string }>('/auth/reset-password', input);
      return data;
    },
  });
}
