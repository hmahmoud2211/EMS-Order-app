import { BarChart3 } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/Controls';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useParticipation, useSpending } from '@/features/admin/api';
import { colors } from '@/theme';
import { formatPrice, toPiastres } from '@/utils/money';
import { formatBusinessDate } from '@/utils/time';

export default function AnalyticsScreen() {
  const { t, i18n } = useTranslation();
  const spending = useSpending();
  const participation = useParticipation();
  const loading = spending.isLoading || participation.isLoading;
  const error = spending.error ?? participation.error;
  const maxDay = Math.max(1, ...(spending.data?.by_day.map((d) => toPiastres(d.total_value)) ?? [1]));

  return (
    <Screen refreshing={spending.isRefetching} onRefresh={() => Promise.all([spending.refetch(), participation.refetch()])}>
      <ScreenHeader back title={t('analytics.title')} subtitle={t('analytics.last30')} />
      {loading ? (
        <SkeletonCard lines={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => spending.refetch()} />
      ) : !spending.data?.by_day.length ? (
        <EmptyState icon={BarChart3} title={t('analytics.empty')} tone="muted" />
      ) : (
        <View>
          <View className="flex-row gap-3">
            <Card className="flex-1 gap-1">
              <Text variant="small" tone="muted">
                {t('analytics.spending')}
              </Text>
              <Text variant="title">{formatPrice(spending.data.total_value)}</Text>
            </Card>
            <Card className="flex-1 gap-1">
              <Text variant="small" tone="muted">
                {t('analytics.averageRate')}
              </Text>
              <Text variant="title">{participation.data?.average_rate_pct ?? 0}%</Text>
            </Card>
          </View>

          <SectionTitle title={t('analytics.byDay')} />
          <Card className="gap-3">
            {spending.data.by_day.map((day) => {
              const rate = participation.data?.by_day.find((p) => p.session_date === day.session_date);
              return (
                <View key={day.session_date} className="gap-1.5">
                  <View className="flex-row justify-between gap-2">
                    <Text variant="label" numberOfLines={1} className="flex-1">
                      {formatBusinessDate(day.session_date, i18n.language, 'weekday')} · {day.restaurant_name}
                    </Text>
                    <Text variant="label">{formatPrice(day.total_value)}</Text>
                  </View>
                  <ProgressBar value={toPiastres(day.total_value) / maxDay} color={colors.primary} track={colors.line} height={8} />
                  {rate ? (
                    <Text variant="caption" tone="muted">
                      {t('analytics.participation')}: {rate.ordered}/{rate.participants} · {rate.rate_pct}%
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </Card>

          <SectionTitle title={t('analytics.topSpenders')} />
          <Card className="gap-2.5">
            {spending.data.by_employee.map((row) => (
              <View key={row.employee_id} className="flex-row items-center gap-3">
                <Avatar name={row.full_name} size={34} />
                <View className="flex-1">
                  <Text variant="subheading" numberOfLines={1}>
                    {row.full_name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t('analytics.orders', { count: row.orders })}
                  </Text>
                </View>
                <Text variant="label">{formatPrice(row.total_value)}</Text>
              </View>
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}
