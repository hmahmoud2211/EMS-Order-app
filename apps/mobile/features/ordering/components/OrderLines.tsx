import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Divider } from '@/components/ui/Controls';
import { Text } from '@/components/ui/Text';
import type { OrderItem, SelectedModifier } from '@/types/api';
import { formatPrice } from '@/utils/money';

export function modifierSummary(modifiers: SelectedModifier[]): string {
  return modifiers.map((m) => m.name).join(' · ');
}

/** Read-only list of an order's item snapshots (names/prices as they were when ordered). */
export function OrderLines({ items, total }: { items: OrderItem[]; total?: string }) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      {items.map((item) => (
        <View key={item.id} className="flex-row gap-3">
          <View className="h-7 min-w-[28px] items-center justify-center rounded-lg bg-primary-50 px-1.5">
            <Text variant="label" tone="primary">
              {item.quantity}×
            </Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="subheading">{item.item_name_snapshot}</Text>
            {item.selected_modifiers_snapshot.length ? (
              <Text variant="small" tone="muted">
                {modifierSummary(item.selected_modifiers_snapshot)}
              </Text>
            ) : null}
            {item.special_instructions ? (
              <Text variant="small" tone="warning">
                {t('order.lineNote', { note: item.special_instructions })}
              </Text>
            ) : null}
          </View>
          <Text variant="label">{formatPrice(item.line_total)}</Text>
        </View>
      ))}
      {total !== undefined ? (
        <>
          <Divider className="my-1" />
          <View className="flex-row items-center justify-between">
            <Text variant="heading">{t('common.total')}</Text>
            <Text variant="heading" tone="primary">
              {formatPrice(total)}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}
