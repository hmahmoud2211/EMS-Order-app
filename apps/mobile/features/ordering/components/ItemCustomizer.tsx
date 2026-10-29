import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/Badge';
import { QuantityStepper, SelectRow } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { InlineError } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import type { MenuItem, ModifierGroup } from '@/types/api';
import { defaultSelections, minimumFor, missingSelections, toggleModifier, unitPriceFor } from '@/utils/modifiers';
import { formatMoney, toPiastres } from '@/utils/money';

export interface ItemConfiguration {
  modifierIds: string[];
  quantity: number;
  instructions: string;
}

function groupRule(group: ModifierGroup, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const min = minimumFor(group);
  const max = group.maximum_selections;
  if (max === 1) return t('item.chooseOne');
  if (min === 0) return t('item.chooseUpTo', { count: max });
  if (min === max) return t('item.chooseAtLeast', { count: min });
  return t('item.chooseBetween', { min, max });
}

/**
 * Modifier groups, quantity and special instructions for one menu item, with a live total.
 * Used by the employee item sheet and by the admin order editor.
 */
export function useItemConfiguration(item: MenuItem | undefined, initial?: Partial<ItemConfiguration>) {
  const [modifierIds, setModifierIds] = useState<string[]>(
    () => initial?.modifierIds ?? (item ? defaultSelections(item) : []),
  );
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const missing = useMemo(() => (item ? missingSelections(item, modifierIds) : []), [item, modifierIds]);
  const unit = item ? unitPriceFor(item, modifierIds) : 0;
  return {
    modifierIds,
    setModifierIds,
    quantity,
    setQuantity,
    instructions,
    setInstructions,
    missing,
    unit,
    total: unit * quantity,
  };
}

export function ItemCustomizer({
  item,
  state,
  showErrors,
}: {
  item: MenuItem;
  state: ReturnType<typeof useItemConfiguration>;
  showErrors: boolean;
}) {
  const { t } = useTranslation();
  const missingIds = new Set(state.missing.map((m) => m.groupId));

  return (
    <View className="gap-6">
      {item.modifier_groups.map((group) => {
        const required = minimumFor(group) > 0;
        const showMissing = showErrors && missingIds.has(group.id);
        return (
          <View key={group.id} className="gap-2.5">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text variant="heading">{group.name}</Text>
                <Text variant="small" tone={showMissing ? 'danger' : 'muted'}>
                  {groupRule(group, t)}
                </Text>
              </View>
              <Badge
                label={required ? t('item.required') : t('item.optional')}
                tone={required ? (showMissing ? 'danger' : 'warning') : 'neutral'}
                size="sm"
              />
            </View>
            <View className="gap-2" accessibilityRole={group.maximum_selections === 1 ? 'radiogroup' : undefined}>
              {group.modifiers.map((modifier) => {
                const price = toPiastres(modifier.additional_price);
                return (
                  <SelectRow
                    key={modifier.id}
                    label={modifier.name}
                    hint={!modifier.is_available ? t('common.unavailable') : undefined}
                    multiple={group.maximum_selections > 1}
                    disabled={!modifier.is_available}
                    selected={state.modifierIds.includes(modifier.id)}
                    onPress={() => state.setModifierIds((current) => toggleModifier(group, current, modifier.id))}
                    right={
                      price > 0 ? (
                        <Text variant="label" tone="soft">
                          +{formatMoney(price)}
                        </Text>
                      ) : null
                    }
                  />
                );
              })}
            </View>
          </View>
        );
      })}

      <View className="gap-2.5">
        <Text variant="heading">{t('item.quantity')}</Text>
        <QuantityStepper value={state.quantity} onChange={state.setQuantity} />
      </View>

      <Input
        label={t('item.instructions')}
        placeholder={t('item.instructionsPlaceholder')}
        value={state.instructions}
        onChangeText={state.setInstructions}
        maxLength={300}
        multiline
      />

      {showErrors && state.missing.length ? (
        <InlineError message={t('item.missingChoice', { group: state.missing.map((m) => m.groupName).join(', ') })} />
      ) : null}
    </View>
  );
}
