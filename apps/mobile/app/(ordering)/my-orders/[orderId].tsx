import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, statusTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useMyOrder } from '@/features/ordering/api';
import { OrderLines } from '@/features/ordering/components/OrderLines';
import { formatBusinessDate, formatDateTime } from '@/utils/time';

export default function MyOrderDetail() {
  const { t, i18n } = useTranslation();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useMyOrder(orderId);
  const data = order.data;

  return (
    <Screen refreshing={order.isRefetching} onRefresh={() => order.refetch()}>
      <ScreenHeader
        back
        title={data?.session.restaurant.name ?? t('order.title')}
        subtitle={data ? formatBusinessDate(data.session.session_date, i18n.language) : undefined}
      />
      {order.isLoading ? (
        <SkeletonCard lines={5} />
      ) : order.isError || !data ? (
        <ErrorState error={order.error} onRetry={() => order.refetch()} />
      ) : (
        <View className="gap-4">
          <Card className="gap-4">
            <View className="flex-row items-start justify-between">
              <View>
                <Text variant="caption" tone="muted">
                  {t('order.reference', { ref: data.reference })}
                </Text>
                <Text variant="small" tone="muted">
                  {t('confirmation.submittedAt')}: {formatDateTime(data.submitted_at, i18n.language)}
                </Text>
              </View>
              <Badge label={t(`status.${data.status}`)} tone={statusTone(data.status)} dot />
            </View>
            <OrderLines items={data.items} total={data.total_amount} />
          </Card>
          {data.status === 'CANCELLED' && data.cancel_reason ? (
            <Notice tone="warning" message={t('order.cancelledBecause', { reason: data.cancel_reason })} />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
