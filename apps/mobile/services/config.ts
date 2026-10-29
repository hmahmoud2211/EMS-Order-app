import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API base URL resolution:
 *  1. EXPO_PUBLIC_API_URL (set it for builds — production must be HTTPS).
 *  2. In development, the machine running the Expo dev server, port 8000.
 *  3. Web: the same origin the admin page was served from (Caddy proxies /api).
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined' && !__DEV__) {
    return `${window.location.origin}/api/v1`;
  }
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (host) return `http://${host}:8000/api/v1`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000/api/v1' : 'http://localhost:8000/api/v1';
}

export const API_URL = resolveApiUrl();
export const API_ORIGIN = API_URL.replace(/\/api\/v1$/, '');

/** Uploaded images are stored as relative "/media/..." paths. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || path.startsWith('file:') || path.startsWith('data:')) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}
