import { router } from 'expo-router';
import { Bell, BellRing, CheckCheck } from 'lucide-react-native';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useMarkAllRead, useMarkRead, useNotifications } from '@/features/notifications/api';
import { useAuthStore } from '@/stores/auth';
import { colors } from '@/theme';
import type { AppNotification } from '@/types/api';
import { formatDateTime } from '@/utils/time';

export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const open = (n: AppNotification) => {
    if (!n.is_read) markRead.mutate(n.id);
    if (user?.role === 'ADMIN') {
      if (n.data.employee_id) router.push({ pathname: '/employee/[id]', params: { id: n.data.employee_id } });
      else if (n.data.order_id) router.push({ pathname: '/order-detail/[orderId]', params: { orderId: n.data.order_id } });
      return;
    }
    if (n.data.order_id) router.push({ pathname: '/my-orders/[orderId]', params: { orderId: n.data.order_id } });
    else router.push('/home');
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <FlatList
        data={notifications.data?.items ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 8, width: '100%', maxWidth: 760, alignSelf: 'center' }}
        refreshing={notifications.isRefetching}
        onRefresh={() => notifications.refetch()}
        ListHeaderComponent={
          <ScreenHeader
            back
            title={t('notifications.title')}
            right={
              notifications.data?.unread ? (
                <IconButton icon={CheckCheck} label={t('notifications.markAllRead')} className="bg-surface"
                  onPress={() => markAll.mutate()} />
              ) : undefined
            }
          />
        }
        ListEmptyComponent={
          notifications.isLoading ? (
            <SkeletonList />
          ) : notifications.isError ? (
            <ErrorState error={notifications.error} onRetry={() => notifications.refetch()} />
          ) : (
            <EmptyState icon={Bell} title={t('notifications.emptyTitle')} message={t('notifications.emptyMessage')} tone="muted" />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.message}`}
            onPress={() => open(item)}
            className={`flex-row gap-3 rounded-2xl p-3.5 active:opacity-90 ${item.is_read ? 'bg-surface' : 'bg-primary-50'}`}
          >
            <View className={`h-10 w-10 items-center justify-center rounded-full ${item.is_read ? 'bg-canvas' : 'bg-surface'}`}>
              <BellRing size={18} color={item.is_read ? colors.muted : colors.primary} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text variant="subheading">{item.title}</Text>
              <Text variant="small" tone="soft">
                {item.message}
              </Text>
              <Text variant="caption" tone="muted">
                {formatDateTime(item.created_at, i18n.language)}
              </Text>
            </View>
            {!item.is_read ? <View className="mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" /> : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
