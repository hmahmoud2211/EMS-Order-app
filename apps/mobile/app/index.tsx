import { Redirect } from 'expo-router';

import { useAuthStore } from '@/stores/auth';

/** Entry point: send each user to the right place for their role. */
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  if (status !== 'signedIn' || !user) return <Redirect href="/login" />;
  if (user.must_change_password) return <Redirect href="/change-password" />;
  return <Redirect href={user.role === 'ADMIN' ? '/dashboard' : '/home'} />;
}
