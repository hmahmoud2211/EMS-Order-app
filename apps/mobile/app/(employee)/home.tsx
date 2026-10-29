import { router } from 'expo-router';
import { CalendarClock, Lock, Pencil, ReceiptText, UtensilsCrossed } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { NotificationBell } from '@/components/navigation/NotificationBell';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useToday } from '@/features/ordering/api';
import { SessionHero } from '@/features/ordering/components/SessionHero';
import { useAuthStore } from '@/stores/auth';
import { colors } from '@/theme';
import { formatPrice } from '@/utils/money';
import { formatBusinessDate, formatTime, greetingKey } from '@/utils/time';

export default function EmployeeHome() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const today = useToday();
  const data = today.data;
  const session = data?.session ?? null;
  const myOrder = data?.my_order ?? null;
  const firstName = user?.full_name.split(' ')[0] ?? '';

  return (
    <Screen refreshing={today.isRefetching} onRefresh={() => today.refetch()}>
      <View className="mb-5 mt-3 flex-row items-center justify-between">
        <View className="flex-1">
          <Text variant="small" tone="muted">
            {formatBusinessDate(data?.business_date, i18n.language)}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t(`home.greeting_${greetingKey()}`)}, {firstName} 👋
          </Text>
        </View>
        <NotificationBell />
      </View>

      {today.isLoading ? (
        <SkeletonCard lines={4} />
      ) : today.isError ? (
        <ErrorState error={today.error} onRetry={() => today.refetch()} />
      ) : !session ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title={t('home.noRestaurantTitle')}
            message={t('home.noRestaurantMessage')}
            tone="muted"
          />
        </Card>
      ) : (
        <Animated.View entering={FadeInDown.duration(400)} className="gap-4">
          <Text variant="overline" tone="muted">
            {t('home.todaysLunch')}
          </Text>
          <SessionHero session={session} serverTime={data?.server_time} accepting={!!data?.is_accepting_orders}>
            {data?.accepting_reason === 'NOT_A_PARTICIPANT' ? (
              <Notice message={t('home.notParticipant')} tone="neutral" />
            ) : data?.is_accepting_orders && !myOrder ? (
              <Button
                label={t('home.browseMenu')}
                icon={UtensilsCrossed}
                size="lg"
                onPress={() => router.push('/menu')}
                testID="browse-menu"
              />
            ) : !data?.is_accepting_orders && session.status !== 'OPEN' ? (
              <Notice
                icon={Lock}
                tone={session.status === 'FINALIZED' ? 'primary' : 'warning'}
                message={session.status === 'FINALIZED' ? t('home.finalizedTitle') : t('home.closedMessage')}
              />
            ) : !data?.is_accepting_orders ? (
              <Button label={t('home.browseMenu')} variant="secondary" onPress={() => router.push('/menu')} />
            ) : null}
          </SessionHero>

          {myOrder ? (
            <Card accessibilityLabel={t('home.yourOrder')}>
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-success-50">
                  <ReceiptText size={21} color={colors.success} />
                </View>
                <View className="flex-1">
                  <Text variant="heading">{t('home.yourOrder')}</Text>
                  <Text variant="small" tone="muted">
                    {t('common.items', { count: myOrder.item_count })} · {formatTime(myOrder.updated_at, i18n.language)}
                  </Text>
                </View>
                <View className="items-end gap-1">
                  <Text variant="heading" tone="primary">
                    {formatPrice(myOrder.total_amount)}
                  </Text>
                  <Badge label={t(`status.${myOrder.status}`)} tone={statusTone(myOrder.status)} size="sm" />
                </View>
              </View>
              <View className="mt-3.5 flex-row gap-3">
                <View className="flex-1">
                  <Button
                    label={t('home.viewOrder')}
                    icon={ReceiptText}
                    variant="outline"
                    onPress={() => router.push({ pathname: '/my-orders/[orderId]', params: { orderId: myOrder.id } })}
                  />
                </View>
                {data?.is_accepting_orders ? (
                  <View className="flex-1">
                    <Button label={t('home.editOrder')} icon={Pencil} variant="secondary" onPress={() => router.push('/my-order')} />
                  </View>
                ) : null}
              </View>
            </Card>
          ) : data?.is_accepting_orders ? (
            <Notice message={`${t('home.noOrderYet')} — ${t('home.noOrderYetMessage')}`} tone="primary" />
          ) : session.status !== 'OPEN' ? (
            <Notice message={t('home.missedTitle')} tone="neutral" />
          ) : null}
        </Animated.View>
      )}
    </Screen>
  );
}
