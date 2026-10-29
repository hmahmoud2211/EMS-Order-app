import { router, useLocalSearchParams } from 'expo-router';
import { Check, House, ReceiptText } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/Controls';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useMyOrder } from '@/features/ordering/api';
import { OrderLines } from '@/features/ordering/components/OrderLines';
import { useAuthStore } from '@/stores/auth';
import { colors } from '@/theme';
import { formatDateTime } from '@/utils/time';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-1.5">
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text variant="label" className="flex-1 text-right" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function ConfirmationScreen() {
  const { t, i18n } = useTranslation();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useMyOrder(orderId);
  const user = useAuthStore((s) => s.user);
  const scale = useSharedValue(0.6);
  useEffect(() => {
    scale.value = withDelay(100, withSpring(1, { damping: 9 }));
  }, [scale]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const home = user?.role === 'ADMIN' ? '/dashboard' : '/home';

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="items-center pb-6 pt-10">
        <Animated.View style={ring} className="h-24 w-24 items-center justify-center rounded-full bg-success-50">
          <Animated.View entering={ZoomIn.delay(250)} className="h-16 w-16 items-center justify-center rounded-full bg-success">
            <Check size={34} color={colors.white} strokeWidth={3} />
          </Animated.View>
        </Animated.View>
        <Text variant="title" className="mt-5 text-center" accessibilityRole="header">
          {t('confirmation.title')}
        </Text>
        <Text variant="small" tone="muted" className="mt-2 max-w-[340px] text-center">
          {t('confirmation.subtitle')}
        </Text>
      </View>

      {order.isLoading ? (
        <SkeletonCard lines={5} />
      ) : order.isError || !order.data ? (
        <ErrorState error={order.error} onRetry={() => order.refetch()} />
      ) : (
        <View className="gap-4">
          <Card className="gap-1">
            <DetailRow label={t('confirmation.reference')} value={order.data.reference} />
            <DetailRow label={t('confirmation.employee')} value={order.data.employee.full_name} />
            <DetailRow label={t('confirmation.restaurant')} value={order.data.session.restaurant.name} />
            <DetailRow label={t('confirmation.submittedAt')} value={formatDateTime(order.data.updated_at, i18n.language)} />
            <Divider className="my-2" />
            <OrderLines items={order.data.items} total={order.data.total_amount} />
          </Card>
          <Notice message={t('consolidated.disclaimer')} tone="neutral" />
          <Button label={t('confirmation.backHome')} icon={House} onPress={() => router.replace(home)} />
          <Button
            label={t('confirmation.viewOrder')}
            icon={ReceiptText}
            variant="secondary"
            onPress={() => router.replace(user?.role === 'ADMIN' ? '/dashboard' : '/my-order')}
          />
        </View>
      )}
    </Screen>
  );
}
