import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

import i18n from '@/i18n';
import { API_URL } from '@/services/config';
import { tokenStorage } from '@/services/tokenStorage';
import { useAuthStore } from '@/stores/auth';
import type { TokenPair } from '@/types/api';
import { toApiError } from '@/utils/errors';

export const api = axios.create({ baseURL: API_URL, timeout: 25_000 });

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['Accept-Language'] = i18n.language;
  return config;
});

const RETRYABLE_AUTH_CODES = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN', 'NOT_AUTHENTICATED']);
let refreshing: Promise<string | null> | null = null;

/** Exchange the stored refresh token for a new pair. Concurrent callers share one request. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) return null;
      try {
        const { data } = await axios.post<TokenPair>(`${API_URL}/auth/refresh`, { refresh_token: refreshToken }, {
          timeout: 20_000,
        });
        await tokenStorage.setRefreshToken(data.refresh_token);
        useAuthStore.getState().setAccessToken(data.access_token);
        return data.access_token;
      } catch (error) {
        const apiError = toApiError(error);
        // Keep the session on transient network problems; sign out on rejected tokens.
        if (apiError.status === 401) await useAuthStore.getState().signOut(apiError.code);
        throw apiError;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const apiError = toApiError(error);
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/login') || original?.url?.startsWith('/auth/refresh');
    if (apiError.status === 401 && RETRYABLE_AUTH_CODES.has(apiError.code) && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        if (token) {
          original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${token}` };
          return api.request(original);
        }
      } catch {
        // fall through to the original error
      }
    }
    if (apiError.code === 'ACCOUNT_DISABLED' || apiError.code === 'TOKEN_REUSED') {
      await useAuthStore.getState().signOut(apiError.code);
    }
    if (apiError.code === 'PASSWORD_CHANGE_REQUIRED') {
      const user = useAuthStore.getState().user;
      if (user) useAuthStore.getState().setUser({ ...user, must_change_password: true });
    }
    return Promise.reject(apiError);
  },
);
