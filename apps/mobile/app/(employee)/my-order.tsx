import { router } from 'expo-router';
import { Lock, Pencil, ReceiptText, Trash2, UtensilsCrossed } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useCancelOrder, useMyTodayOrder, useToday } from '@/features/ordering/api';
import { OrderLines } from '@/features/ordering/components/OrderLines';
import { useEditOrder } from '@/features/ordering/useEditOrder';
import { errorMessage } from '@/utils/errors';
import { formatDateTime, formatTime } from '@/utils/time';

export default function MyOrderScreen() {
  const { t, i18n } = useTranslation();
  const today = useToday();
  const order = useMyTodayOrder();
  const cancel = useCancelOrder();
  const editOrder = useEditOrder();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const accepting = !!today.data?.is_accepting_orders;
  const refresh = () => Promise.all([today.refetch(), order.refetch()]);

  return (
    <Screen refreshing={order.isRefetching} onRefresh={refresh}>
      <ScreenHeader title={t('order.title')} subtitle={today.data?.session?.restaurant.name} />
      {order.isLoading || today.isLoading ? (
        <SkeletonCard lines={5} />
      ) : order.isError ? (
        <ErrorState error={order.error} onRetry={refresh} />
      ) : !order.data ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title={t('order.noneTitle')}
            message={t('order.noneMessage')}
            actionLabel={accepting ? t('home.browseMenu') : undefined}
            onAction={accepting ? () => router.push('/menu') : undefined}
            tone="muted"
          />
        </Card>
      ) : (
        <Animated.View entering={FadeInDown.duration(350)} className="gap-4">
          <Card className="gap-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text variant="caption" tone="muted">
                  {t('order.reference', { ref: order.data.reference })}
                </Text>
                <Text variant="heading">{order.data.session.restaurant.name}</Text>
                <Text variant="small" tone="muted">
                  {t('confirmation.submittedAt')}: {formatDateTime(order.data.submitted_at, i18n.language)}
                  {order.data.revision > 1 ? ` · ${t('order.revision', { n: order.data.revision })}` : ''}
                </Text>
              </View>
              <Badge label={t(`status.${order.data.status}`)} tone={statusTone(order.data.status)} dot />
            </View>
            <OrderLines items={order.data.items} total={order.data.total_amount} />
          </Card>

          {accepting ? (
            <>
              <Notice
                tone="primary"
                message={t('order.editable', { time: formatTime(order.data.session.closes_at, i18n.language) })}
              />
              <Button label={t('home.editOrder')} icon={Pencil} onPress={() => editOrder(order.data!)} />
              <Button label={t('cart.addMore')} icon={UtensilsCrossed} variant="secondary"
                onPress={() => editOrder(order.data!, '/menu')} />
              {today.data?.can_cancel_order ? (
                <Button label={t('order.cancelOrder')} icon={Trash2} variant="dangerOutline"
                  onPress={() => setConfirmCancel(true)} />
              ) : null}
            </>
          ) : (
            <Notice icon={Lock} tone="neutral" message={t('order.locked')} />
          )}
        </Animated.View>
      )}

      <ConfirmDialog
        visible={confirmCancel}
        title={t('order.cancelOrder')}
        message={t('order.cancelConfirm')}
        destructive
        confirmLabel={t('order.cancelOrder')}
        loading={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : null}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() =>
          order.data &&
          cancel.mutate(order.data.id, {
            onSuccess: () => {
              setConfirmCancel(false);
              toast.success(t('order.cancelled'));
            },
          })
        }
      />
    </Screen>
  );
}
