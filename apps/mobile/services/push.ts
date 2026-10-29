import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/services/api';
import { tokenStorage } from '@/services/tokenStorage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPushStatus(): Promise<PushStatus> {
  if (!Device.isDevice && Platform.OS === 'android') return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status as PushStatus;
}

/**
 * Ask for permission (only when `prompt` is true), obtain the Expo push token and
 * register it with the API. Requires an EAS projectId and a development/production
 * build; failures are silent so the app keeps working with in-app notifications.
 */
export async function registerForPush(prompt = false): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Lunch updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#185ADB',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && prompt) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api.post('/notifications/register-device', {
      token,
      platform: Platform.OS,
      device_name: Device.deviceName ?? Device.modelName ?? null,
    });
    await tokenStorage.setPushToken(token);
    return token;
  } catch {
    return null;
  }
}

export async function unregisterPushToken(): Promise<void> {
  await tokenStorage.clearPushToken();
}

export function addNotificationResponseListener(handler: (data: Record<string, unknown>) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handler((response.notification.request.content.data ?? {}) as Record<string, unknown>);
  });
  return () => subscription.remove();
}
