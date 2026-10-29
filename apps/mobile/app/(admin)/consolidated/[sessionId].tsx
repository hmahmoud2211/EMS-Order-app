import { useLocalSearchParams } from 'expo-router';
import { Copy, FileSpreadsheet, FileText, Share2, Sheet } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider, SectionTitle, SegmentedControl } from '@/components/ui/Controls';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useConsolidated } from '@/features/admin/api';
import { modifierSummary } from '@/features/ordering/components/OrderLines';
import { copyExportText, shareExport, shareExportText, type ExportFormat } from '@/services/exports';
import { errorMessage } from '@/utils/errors';
import { formatPrice, toPiastres } from '@/utils/money';
import { formatBusinessDate } from '@/utils/time';

function Row({ label, value, strong = false, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1.5">
      <View className="flex-1">
        <Text variant={strong ? 'heading' : 'small'} tone={strong ? 'ink' : 'soft'}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Text variant={strong ? 'title' : 'label'} tone={strong ? 'primary' : 'ink'}>
        {value}
      </Text>
    </View>
  );
}

export default function ConsolidatedScreen() {
  const { t, i18n } = useTranslation();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const query = useConsolidated(sessionId);
  const [view, setView] = useState<'item' | 'employee'>('item');
  const [busy, setBusy] = useState<string | null>(null);
  const data = query.data;

  const run = async (key: string, task: () => Promise<void>, success?: string) => {
    setBusy(key);
    try {
      await task();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const exportFile = (format: ExportFormat) =>
    data && run(format, () => shareExport(sessionId, format, data.summary.order_date));

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <ScreenHeader
        back
        title={t('consolidated.title')}
        subtitle={data ? `${data.summary.restaurant_name} · ${formatBusinessDate(data.summary.order_date, i18n.language, 'short')}` : undefined}
      />
      {query.isLoading ? (
        <SkeletonCard lines={6} />
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <View className="gap-4">
          <Card className="gap-1">
            <View className="mb-2 flex-row items-center justify-between">
              <Text variant="heading">{t('consolidated.summary')}</Text>
              <Badge label={t(`status.${data.summary.session_status}`)} tone={statusTone(data.summary.session_status)} />
            </View>
            <Row label={t('consolidated.employeesOrdered')} value={String(data.summary.employees_ordered)} />
            <Row label={t('consolidated.meals')} value={String(data.summary.meals)} />
            <Row label={t('consolidated.foodSubtotal')} value={formatPrice(data.summary.food_subtotal)} />
            {toPiastres(data.summary.delivery_fee) > 0 ? (
              <Row label={t('consolidated.deliveryFee')} value={formatPrice(data.summary.delivery_fee)} />
            ) : null}
            {toPiastres(data.summary.service_fee) > 0 ? (
              <Row label={t('consolidated.serviceFee')} value={formatPrice(data.summary.service_fee)} hint={data.summary.fee_note ?? undefined} />
            ) : null}
            <Divider className="my-2" />
            <Row label={t('consolidated.finalTotal')} value={formatPrice(data.summary.final_total)} strong />
          </Card>

          <SectionTitle title={t('consolidated.export')} />
          <View className="flex-row flex-wrap gap-2.5">
            {(
              [
                ['pdf', t('consolidated.exportPdf'), FileText],
                ['xlsx', t('consolidated.exportExcel'), FileSpreadsheet],
                ['csv', t('consolidated.exportCsv'), Sheet],
              ] as const
            ).map(([format, label, icon]) => (
              <View key={format} className="min-w-[30%] flex-1">
                <Button label={label} icon={icon} variant={format === 'pdf' ? 'primary' : 'outline'}
                  loading={busy === format} disabled={!!busy && busy !== format} onPress={() => exportFile(format)}
                  testID={`export-${format}`} />
              </View>
            ))}
          </View>
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button label={t('consolidated.copyText')} icon={Copy} variant="secondary" loading={busy === 'copy'}
                onPress={() => run('copy', () => copyExportText(sessionId), t('common.copied'))} />
            </View>
            <View className="flex-1">
              <Button label={t('consolidated.shareText')} icon={Share2} variant="secondary" loading={busy === 'share'}
                onPress={() => run('share', () => shareExportText(sessionId))} />
            </View>
          </View>
          <Notice message={t('consolidated.disclaimer')} tone="neutral" />

          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { value: 'item', label: t('consolidated.byItem'), count: data.by_item.length },
              { value: 'employee', label: t('consolidated.byEmployee'), count: data.by_employee.length },
            ]}
          />

          {!data.by_item.length ? (
            <EmptyState icon={FileText} title={t('consolidated.empty')} tone="muted" compact />
          ) : view === 'item' ? (
            <View className="gap-3">
              {data.by_item.map((item) => (
                <Card key={`${item.config_key}-${item.unit_price}`} className="gap-2.5">
                  <View className="flex-row items-start gap-3">
                    <View className="h-10 min-w-[40px] items-center justify-center rounded-2xl bg-navy px-2">
                      <Text variant="heading" tone="white">
                        {item.total_quantity}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text variant="subheading">{item.item_name}</Text>
                      {item.modifiers.length ? (
                        <Text variant="small" tone="muted">
                          {modifierSummary(item.modifiers)}
                        </Text>
                      ) : null}
                      <Text variant="caption" tone="muted">
                        {formatPrice(item.unit_price)} × {item.total_quantity}
                      </Text>
                    </View>
                    <Text variant="subheading">{formatPrice(item.total_value)}</Text>
                  </View>
                  <View className="gap-1 rounded-2xl bg-canvas px-3 py-2">
                    {item.employees.map((person, index) => (
                      <Text key={`${person.full_name}-${index}`} variant="small" tone="soft">
                        {person.full_name} ×{person.quantity}
                        {person.special_instructions ? (
                          <Text variant="small" tone="warning">{`  — ${person.special_instructions}`}</Text>
                        ) : null}
                      </Text>
                    ))}
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            <View className="gap-3">
              {data.by_employee.map((person) => (
                <Card key={person.employee_id} className="gap-3">
                  <View className="flex-row items-center gap-3">
                    <Avatar name={person.full_name} size={40} />
                    <View className="flex-1">
                      <Text variant="subheading">{person.full_name}</Text>
                      <Text variant="caption" tone="muted">
                        {person.order_reference}
                      </Text>
                    </View>
                    <Text variant="heading" tone="primary">
                      {formatPrice(person.total)}
                    </Text>
                  </View>
                  {person.lines.map((line, index) => (
                    <View key={index} className="flex-row gap-2">
                      <Text variant="label" tone="primary">
                        {line.quantity}×
                      </Text>
                      <View className="flex-1">
                        <Text variant="small">{line.item_name}</Text>
                        {line.modifiers.length ? (
                          <Text variant="caption" tone="muted">
                            {modifierSummary(line.modifiers)}
                          </Text>
                        ) : null}
                        {line.special_instructions ? (
                          <Text variant="caption" tone="warning">
                            {t('order.lineNote', { note: line.special_instructions })}
                          </Text>
                        ) : null}
                      </View>
                      <Text variant="small">{formatPrice(line.line_total)}</Text>
                    </View>
                  ))}
                  {toPiastres(person.allocated_fees) > 0 ? (
                    <Text variant="caption" tone="muted">
                      {t('consolidated.feeShare')}: {formatPrice(person.allocated_fees)}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}
