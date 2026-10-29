import * as SecureStore from 'expo-secure-store';

/** Native: the refresh token lives in the Keychain / Android Keystore. Access tokens stay in memory. */
const REFRESH_KEY = 'ems_food_refresh_token';
const PUSH_KEY = 'ems_food_push_token';

export const tokenStorage = {
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
  setRefreshToken: (token: string) => SecureStore.setItemAsync(REFRESH_KEY, token),
  clearRefreshToken: () => SecureStore.deleteItemAsync(REFRESH_KEY),
  getPushToken: () => SecureStore.getItemAsync(PUSH_KEY),
  setPushToken: (token: string) => SecureStore.setItemAsync(PUSH_KEY, token),
  clearPushToken: () => SecureStore.deleteItemAsync(PUSH_KEY),
};
