import '../global.css';
import '@/components/nativewindSetup';

import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { router, SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/components/ui/Toast';
import { bootstrapSession } from '@/features/auth/api';
import { applyLanguage } from '@/i18n';
import { addNotificationResponseListener, registerForPush } from '@/services/push';
import { queryClient } from '@/services/queryClient';
import { onSignOut, useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    bootstrapSession();
    return onSignOut(() => {
      queryClient.clear();
      useCartStore.getState().clear();
    });
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && status !== 'loading') SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError, status]);

  const ready = status === 'signedIn' && !!user && !user.must_change_password;

  useEffect(() => {
    if (!ready || !user) return;
    if (user.preferred_language === 'ar' || user.preferred_language === 'en') applyLanguage(user.preferred_language);
    registerForPush(false);
    return addNotificationResponseListener((data) => {
      if (user.role === 'ADMIN') router.push('/dashboard');
      else if (typeof data.order_id === 'string') router.push({ pathname: '/my-orders/[orderId]', params: { orderId: data.order_id } });
      else router.push('/home');
    });
  }, [ready, user]);

  if ((!fontsLoaded && !fontError) || status === 'loading') return null;

  const signedIn = status === 'signedIn' && !!user;
  const isAdmin = user?.role === 'ADMIN';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
            <Stack.Screen name="index" />
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="change-password" />
            </Stack.Protected>
            <Stack.Protected guard={ready && isAdmin}>
              <Stack.Screen name="(admin)" />
            </Stack.Protected>
            <Stack.Protected guard={ready && !isAdmin}>
              <Stack.Screen name="(employee)" />
            </Stack.Protected>
            <Stack.Protected guard={ready && !!user?.participates_in_orders}>
              <Stack.Screen name="(ordering)" />
            </Stack.Protected>
            <Stack.Protected guard={ready}>
              <Stack.Screen name="notifications" />
            </Stack.Protected>
          </Stack>
          <ToastHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
