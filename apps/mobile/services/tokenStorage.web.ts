/**
 * Web (admin in the browser): SecureStore is unavailable, so the refresh token is kept
 * in localStorage. This is mitigated by short-lived access tokens kept in memory and
 * refresh-token rotation with reuse detection on the server (see docs/architecture.md).
 */
const REFRESH_KEY = 'ems_food_refresh_token';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const tokenStorage = {
  getRefreshToken: async () => safe(() => window.localStorage.getItem(REFRESH_KEY), null),
  setRefreshToken: async (token: string) => safe(() => window.localStorage.setItem(REFRESH_KEY, token), undefined),
  clearRefreshToken: async () => safe(() => window.localStorage.removeItem(REFRESH_KEY), undefined),
  getPushToken: async () => null as string | null,
  setPushToken: async (_token: string) => undefined,
  clearPushToken: async () => undefined,
};
