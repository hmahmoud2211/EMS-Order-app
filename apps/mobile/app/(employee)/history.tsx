import { router } from 'expo-router';
import { ChevronRight, History } from 'lucide-react-native';
import { useMemo } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Badge, statusTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useMyHistory } from '@/features/ordering/api';
import { colors } from '@/theme';
import type { OrderHistoryItem } from '@/types/api';
import { formatPrice } from '@/utils/money';
import { formatBusinessDate } from '@/utils/time';

type Row = { type: 'month'; label: string; key: string } | { type: 'order'; order: OrderHistoryItem; key: string };

export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const history = useMyHistory();

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];
    let currentMonth = '';
    for (const order of history.data?.items ?? []) {
      const month = new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${order.session_date}T12:00:00Z`));
      if (month !== currentMonth) {
        currentMonth = month;
        result.push({ type: 'month', label: month, key: `m-${month}` });
      }
      result.push({ type: 'order', order, key: order.id });
    }
    return result;
  }, [history.data, i18n.language]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        refreshing={history.isRefetching}
        onRefresh={() => history.refetch()}
        ListHeaderComponent={<ScreenHeader title={t('history.title')} />}
        ListEmptyComponent={
          history.isLoading ? (
            <SkeletonList />
          ) : history.isError ? (
            <ErrorState error={history.error} onRetry={() => history.refetch()} />
          ) : (
            <EmptyState icon={History} title={t('history.emptyTitle')} message={t('history.emptyMessage')} tone="muted" />
          )
        }
        renderItem={({ item: row }) =>
          row.type === 'month' ? (
            <Text variant="overline" tone="muted" className="mt-3">
              {row.label}
            </Text>
          ) : (
            <Card
              onPress={() => router.push({ pathname: '/my-orders/[orderId]', params: { orderId: row.order.id } })}
              accessibilityLabel={`${row.order.restaurant_name}, ${formatBusinessDate(row.order.session_date, i18n.language)}`}
            >
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary-50">
                  <Text variant="caption" tone="primary">
                    {new Date(`${row.order.session_date}T12:00:00Z`).getUTCDate()}
                  </Text>
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="subheading" numberOfLines={1}>
                    {row.order.restaurant_name}
                  </Text>
                  <Text variant="small" tone="muted" numberOfLines={1}>
                    {row.order.item_names.join(', ')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatBusinessDate(row.order.session_date, i18n.language, 'weekday')}
                  </Text>
                </View>
                <View className="items-end gap-1">
                  <Text variant="subheading" tone={row.order.status === 'CANCELLED' ? 'muted' : 'ink'}
                    className={row.order.status === 'CANCELLED' ? 'line-through' : ''}>
                    {formatPrice(row.order.total_amount)}
                  </Text>
                  {row.order.status === 'CANCELLED' ? (
                    <Badge label={t('status.CANCELLED')} tone={statusTone('CANCELLED')} size="sm" />
                  ) : null}
                </View>
                <ChevronRight size={18} color={colors.mutedLight} />
              </View>
            </Card>
          )
        }
      />
    </SafeAreaView>
  );
}
