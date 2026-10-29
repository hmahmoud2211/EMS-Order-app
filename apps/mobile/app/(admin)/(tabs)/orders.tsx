import { router, useLocalSearchParams } from 'expo-router';
import { CalendarPlus, ChevronRight, ClipboardList, History, PenLine, Search } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { ScreenHeader } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useDashboard, useEmployeeStatus } from '@/features/admin/api';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { colors, shadows } from '@/theme';
import type { EmployeeStatusRow } from '@/types/api';
import { formatPrice } from '@/utils/money';
import { formatTime } from '@/utils/time';

type Filter = 'all' | 'ordered' | 'not_ordered';

export default function AdminOrders() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ filter?: Filter }>();
  const [filter, setFilter] = useState<Filter>(params.filter ?? 'all');
  const [lastParam, setLastParam] = useState(params.filter);
  if (params.filter !== lastParam) {
    setLastParam(params.filter);
    if (params.filter) setFilter(params.filter);
  }
  const [query, setQuery] = useState('');
  const dashboard = useDashboard();
  const session = dashboard.data?.session;
  const status = useEmployeeStatus(session?.id, filter, query.trim());
  const refresh = useManualRefresh(status.refetch);

  const renderRow = ({ item }: { item: EmployeeStatusRow }) => {
    const ordered = item.status === 'ORDERED';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.full_name}, ${t(`status.${item.status}`)}`}
        onPress={() =>
          ordered
            ? router.push({ pathname: '/order-detail/[orderId]', params: { orderId: item.order_id! } })
            : session &&
              router.push({ pathname: '/record-order/[sessionId]', params: { sessionId: session.id, employeeId: item.employee_id } })
        }
        className="flex-row items-center gap-3 rounded-3xl bg-surface p-3.5 active:opacity-90"
        style={shadows.card}
      >
        <Avatar name={item.full_name} size={44} muted={!ordered} />
        <View className="flex-1 gap-0.5">
          <Text variant="subheading" numberOfLines={1}>
            {item.full_name}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {[item.department, ordered && item.submitted_at ? formatTime(item.updated_at ?? item.submitted_at, i18n.language) : null]
              .filter(Boolean)
              .join(' · ') || '—'}
          </Text>
        </View>
        <View className="items-end gap-1">
          {ordered ? (
            <Text variant="subheading">{formatPrice(item.total_amount)}</Text>
          ) : (
            <PenLine size={16} color={colors.mutedLight} />
          )}
          <Badge label={t(`status.${item.status}`)} tone={statusTone(item.status)} size="sm" />
        </View>
        {ordered ? <ChevronRight size={18} color={colors.mutedLight} /> : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <FlatList
        data={session ? status.data?.rows ?? [] : []}
        keyExtractor={(row) => row.employee_id}
        renderItem={renderRow}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10, width: '100%', maxWidth: 860, alignSelf: 'center' }}
        refreshing={refresh.refreshing}
        onRefresh={refresh.onRefresh}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <ScreenHeader
              title={t('orders.title')}
              subtitle={session?.restaurant.name}
              right={
                <IconButton icon={History} label={t('admin.history')} onPress={() => router.push('/session-history')}
                  className="bg-surface" />
              }
            />
            {session ? (
              <>
                <Button
                  label={t('admin.consolidated')}
                  icon={ClipboardList}
                  onPress={() => router.push({ pathname: '/consolidated/[sessionId]', params: { sessionId: session.id } })}
                />
                <SegmentedControl<Filter>
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: t('orders.filterAll'), count: status.data?.counts.all },
                    { value: 'ordered', label: t('orders.filterOrdered'), count: status.data?.counts.ordered },
                    { value: 'not_ordered', label: t('orders.filterNotOrdered'), count: status.data?.counts.not_ordered },
                  ]}
                />
                <Input icon={Search} placeholder={t('orders.searchEmployees')} value={query} onChangeText={setQuery}
                  autoCorrect={false} />
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          dashboard.isLoading || status.isLoading ? (
            <SkeletonList count={6} />
          ) : dashboard.isError ? (
            <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
          ) : !session ? (
            <Card>
              <EmptyState icon={CalendarPlus} title={t('orders.noSession')} message={t('admin.noSessionMessage')}
                actionLabel={t('admin.selectRestaurant')} onAction={() => router.push('/session/new')} />
            </Card>
          ) : status.isError ? (
            <ErrorState error={status.error} onRetry={() => status.refetch()} />
          ) : (
            <EmptyState icon={Search} title={t('common.noResults')} tone="muted" compact />
          )
        }
      />
    </SafeAreaView>
  );
}
