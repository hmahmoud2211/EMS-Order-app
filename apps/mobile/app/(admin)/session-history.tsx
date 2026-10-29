import { router } from 'expo-router';
import { BarChart3, CalendarDays, ChevronRight } from 'lucide-react-native';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Badge, statusTone } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useSessionHistory } from '@/features/admin/api';
import { colors } from '@/theme';
import { formatPrice } from '@/utils/money';
import { formatBusinessDate } from '@/utils/time';

export default function SessionHistoryScreen() {
  const { t, i18n } = useTranslation();
  const history = useSessionHistory();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <FlatList
        data={history.data?.items ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10, width: '100%', maxWidth: 860, alignSelf: 'center' }}
        refreshing={history.isRefetching}
        onRefresh={() => history.refetch()}
        ListHeaderComponent={
          <ScreenHeader back title={t('admin.history')}
            right={<IconButton icon={BarChart3} label={t('admin.analytics')} className="bg-surface"
              onPress={() => router.push('/analytics')} />} />
        }
        ListEmptyComponent={
          history.isLoading ? (
            <SkeletonList />
          ) : history.isError ? (
            <ErrorState error={history.error} onRetry={() => history.refetch()} />
          ) : (
            <EmptyState icon={CalendarDays} title={t('analytics.empty')} tone="muted" />
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push({ pathname: '/session/[id]', params: { id: item.id } })}>
            <View className="flex-row items-center gap-3">
              <View className="flex-1 gap-1">
                <Text variant="subheading">{item.restaurant.name}</Text>
                <Text variant="small" tone="muted">
                  {formatBusinessDate(item.session_date, i18n.language, 'weekday')} ·{' '}
                  {item.stats.ordered}/{item.stats.participants} {t('admin.ordered').toLowerCase()}
                </Text>
              </View>
              <View className="items-end gap-1">
                <Text variant="subheading">{formatPrice(item.stats.total_value)}</Text>
                <Badge label={t(`status.${item.status}`)} tone={statusTone(item.status)} size="sm" />
              </View>
              <ChevronRight size={18} color={colors.mutedLight} />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
