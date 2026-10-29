import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function OrderingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="item/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="confirmation/[orderId]" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
