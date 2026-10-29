/** Push notifications are mobile-only; the web admin uses in-app notifications. */
export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPushStatus(): Promise<PushStatus> {
  return 'unsupported';
}

export async function registerForPush(_prompt = false): Promise<string | null> {
  return null;
}

export async function unregisterPushToken(): Promise<void> {}

export function addNotificationResponseListener(_handler: (data: Record<string, unknown>) => void) {
  return () => undefined;
}
