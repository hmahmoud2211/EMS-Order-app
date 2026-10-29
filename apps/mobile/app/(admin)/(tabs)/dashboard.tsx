import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  CalendarPlus,
  ChevronRight,
  ClipboardList,
  Clock,
  Coins,
  PlayCircle,
  Settings2,
  ShoppingBag,
  UserCheck,
  UserX,
  Users,
  UtensilsCrossed,
} from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { NotificationBell } from '@/components/navigation/NotificationBell';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/Controls';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RestaurantLogo } from '@/components/ui/RestaurantCover';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useDashboard, useSessionAction } from '@/features/admin/api';
import { LiveDot } from '@/features/admin/components/LiveDot';
import { MetricTile } from '@/features/admin/components/MetricTile';
import { useCountdown } from '@/hooks/useCountdown';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useAuthStore } from '@/stores/auth';
import { colors, shadows } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatPrice } from '@/utils/money';
import { formatBusinessDate, formatDuration, formatTime } from '@/utils/time';

export default function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const dashboard = useDashboard();
  const data = dashboard.data;
  const session = data?.session ?? null;
  const metrics = data?.metrics ?? null;
  const notOrdered = data?.not_ordered ?? [];
  const recentOrders = data?.recent_orders ?? [];
  const remaining = useCountdown(session?.status === 'OPEN' ? session.closes_at : null, data?.server_time);
  const action = useSessionAction(session?.id ?? '');
  const refresh = useManualRefresh(dashboard.refetch);

  return (
    <Screen refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} maxWidth={980}>
      <View className="mb-5 mt-3 flex-row items-center justify-between">
        <View className="flex-1">
          <Text variant="small" tone="muted">
            {formatBusinessDate(data?.business_date, i18n.language)}
          </Text>
          <Text variant="title" accessibilityRole="header">
            {t('tabs.dashboard')}
          </Text>
        </View>
        <NotificationBell />
      </View>

      {dashboard.isLoading ? (
        <View className="gap-4">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={2} />
        </View>
      ) : dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
      ) : !session || !metrics ? (
        <Card>
          <EmptyState
            icon={CalendarPlus}
            title={t('admin.noSessionTitle')}
            message={t('admin.noSessionMessage')}
            actionLabel={t('admin.selectRestaurant')}
            onAction={() => router.push('/session/new')}
          />
        </Card>
      ) : (
        <Animated.View entering={FadeInDown.duration(400)} className="gap-4">
          {/* Hero: today's restaurant and participation */}
          <View className="overflow-hidden rounded-3xl" style={shadows.raised}>
            <LinearGradient colors={[colors.navy, '#123C9C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18 }}>
              <View className="flex-row items-center justify-between">
                <Text variant="overline" tone="whiteMuted">
                  {t('admin.todaysRestaurant')}
                </Text>
                {session.status === 'OPEN' ? (
                  <LiveDot label={t('admin.live')} />
                ) : (
                  <Badge label={t(`status.${session.status}`)} tone={statusTone(session.status)} />
                )}
              </View>
              <View className="mt-3 flex-row items-center gap-3">
                <RestaurantLogo uri={session.restaurant.logo_url} name={session.restaurant.name} size={52} />
                <View className="flex-1">
                  <Text variant="title" tone="white" numberOfLines={1} testID="dashboard-restaurant">
                    {session.restaurant.name}
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <Clock size={13} color="rgba(255,255,255,0.7)" />
                    <Text variant="small" tone="whiteMuted">
                      {session.status === 'OPEN' && remaining !== null && remaining > 0
                        ? t('admin.closesIn', { time: formatDuration(remaining) })
                        : session.status === 'OPEN'
                          ? t('admin.deadlinePassed')
                          : session.closed_at
                            ? t('admin.closedAt', { time: formatTime(session.closed_at, i18n.language) })
                            : t('admin.opensAt', { time: formatTime(session.opens_at, i18n.language) })}
                    </Text>
                  </View>
                </View>
              </View>
              <View className="mt-5 gap-2">
                <View className="flex-row items-end justify-between">
                  <Text variant="small" tone="whiteMuted">
                    {t('admin.participation')}
                  </Text>
                  <Text variant="heading" tone="white" testID="dashboard-participation">
                    {metrics.ordered} / {metrics.total_employees}
                  </Text>
                </View>
                <ProgressBar
                  value={metrics.total_employees ? metrics.ordered / metrics.total_employees : 0}
                  accessibilityLabel={`${t('admin.participation')} ${metrics.participation_pct}%`}
                />
              </View>
            </LinearGradient>
          </View>

          {session.status === 'DRAFT' ? (
            <View className="gap-3">
              <Notice message={t('admin.draftHint')} tone="warning" />
              <Button
                label={t('admin.openNow')}
                icon={PlayCircle}
                loading={action.isPending}
                onPress={() =>
                  action.mutate({ action: 'open' }, { onError: (e) => toast.error(errorMessage(e)) })
                }
              />
            </View>
          ) : null}

          <View className="flex-row flex-wrap gap-3">
            <MetricTile icon={Users} label={t('admin.totalEmployees')} value={metrics.total_employees} tone="neutral"
              testID="metric-employees" />
            <MetricTile icon={UserCheck} label={t('admin.ordered')} value={metrics.ordered} tone="success"
              testID="metric-ordered" />
            <MetricTile icon={UserX} label={t('admin.notOrdered')} value={metrics.not_ordered} tone="warning"
              testID="metric-not-ordered" />
            <MetricTile icon={ShoppingBag} label={t('admin.totalItems')} value={metrics.total_items} tone="cyan" />
            <View className="w-full">
              <MetricTile icon={Coins} label={t('admin.totalValue')} value={formatPrice(metrics.total_value)} tone="primary"
                testID="metric-total" />
            </View>
          </View>

          <View className="gap-3">
            <Button label={t('admin.consolidated')} icon={ClipboardList}
              onPress={() => router.push({ pathname: '/consolidated/[sessionId]', params: { sessionId: session.id } })} />
            <Button label={t('admin.manageSession')} icon={Settings2} variant="outline"
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })} />
          </View>

          {user?.participates_in_orders ? (
            <Card onPress={() => router.push('/menu')} accessibilityLabel={t('admin.myLunch')}>
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary-50">
                  <UtensilsCrossed size={20} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text variant="heading">{t('admin.myLunch')}</Text>
                  <Text variant="small" tone="muted">
                    {t('admin.myLunchHint')}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.mutedLight} />
              </View>
            </Card>
          ) : null}

          {notOrdered.length ? (
            <View>
              <SectionTitle
                title={`${t('admin.waitingFor')} (${notOrdered.length})`}
                action={
                  <Pressable onPress={() => router.push({ pathname: '/orders', params: { filter: 'not_ordered' } })} hitSlop={8}>
                    <Text variant="label" tone="primary">
                      {t('admin.seeAll')}
                    </Text>
                  </Pressable>
                }
              />
              <Card className="flex-row flex-wrap gap-2">
                {notOrdered.slice(0, 12).map((person) => (
                  <View key={person.id} className="flex-row items-center gap-1.5 rounded-full bg-warning-50 py-1 pl-1 pr-3">
                    <Avatar name={person.full_name} size={24} />
                    <Text variant="caption" tone="warning">
                      {person.full_name}
                    </Text>
                  </View>
                ))}
                {notOrdered.length > 12 ? (
                  <Text variant="caption" tone="muted" className="self-center">
                    +{notOrdered.length - 12}
                  </Text>
                ) : null}
              </Card>
            </View>
          ) : null}

          {recentOrders.length ? (
            <View>
              <SectionTitle title={t('admin.recentOrders')} />
              <Card className="gap-1 py-2">
                {recentOrders.map((order) => (
                  <Pressable
                    key={order.order_id}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/order-detail/[orderId]', params: { orderId: order.order_id } })}
                    className="flex-row items-center gap-3 rounded-2xl px-1 py-2 active:bg-canvas"
                  >
                    <Avatar name={order.employee_name} size={38} />
                    <View className="flex-1">
                      <Text variant="subheading" numberOfLines={1}>
                        {order.employee_name}
                      </Text>
                      <Text variant="small" tone="muted">
                        {t('common.items', { count: order.item_count })} · {formatTime(order.updated_at, i18n.language)}
                      </Text>
                    </View>
                    <Text variant="subheading">{formatPrice(order.total_amount)}</Text>
                  </Pressable>
                ))}
              </Card>
            </View>
          ) : null}
        </Animated.View>
      )}
    </Screen>
  );
}
