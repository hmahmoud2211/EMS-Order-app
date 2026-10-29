import { ChevronLeft, Plus, Search, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { QuantityStepper } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { ItemCustomizer, useItemConfiguration } from '@/features/ordering/components/ItemCustomizer';
import { useRestaurantMenu } from '@/features/restaurants/api';
import { colors } from '@/theme';
import type { MenuItem, Order, OrderLineInput } from '@/types/api';
import { randomId } from '@/utils/id';
import { selectedModifiers, unitPriceFor } from '@/utils/modifiers';
import { formatMoney, toPiastres, type Piastres } from '@/utils/money';

export interface EditorLine {
  key: string;
  menuItemId: string;
  name: string;
  quantity: number;
  modifierIds: string[];
  modifierNames: string[];
  instructions: string;
  unitPrice: Piastres;
}

export function linesFromOrder(order: Order): EditorLine[] {
  return order.items
    .filter((item) => item.menu_item_id)
    .map((item) => ({
      key: randomId(),
      menuItemId: item.menu_item_id!,
      name: item.item_name_snapshot,
      quantity: item.quantity,
      modifierIds: item.selected_modifiers_snapshot.map((m) => m.modifier_id).filter(Boolean) as string[],
      modifierNames: item.selected_modifiers_snapshot.map((m) => m.name),
      instructions: item.special_instructions ?? '',
      unitPrice: toPiastres(item.unit_price_snapshot),
    }));
}

export function toLineInputs(lines: EditorLine[]): OrderLineInput[] {
  return lines.map((line) => ({
    menu_item_id: line.menuItemId,
    quantity: line.quantity,
    modifier_ids: line.modifierIds,
    special_instructions: line.instructions.trim() || null,
  }));
}

function CustomizeStep({ item, onAdd, onBack }: { item: MenuItem; onAdd: (line: EditorLine) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const state = useItemConfiguration(item);
  const [showErrors, setShowErrors] = useState(false);
  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-2 px-4 py-2">
        <IconButton icon={ChevronLeft} label={t('common.back')} onPress={onBack} className="bg-surface" />
        <Text variant="heading" className="flex-1" numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ItemCustomizer item={item} state={state} showErrors={showErrors} />
        <View className="mt-6">
          <Button
            label={t('item.addToCart', { price: formatMoney(state.total) })}
            onPress={() => {
              if (state.missing.length) {
                setShowErrors(true);
                return;
              }
              onAdd({
                key: randomId(),
                menuItemId: item.id,
                name: item.name,
                quantity: state.quantity,
                modifierIds: state.modifierIds,
                modifierNames: selectedModifiers(item, state.modifierIds).map((m) => m.name),
                instructions: state.instructions,
                unitPrice: unitPriceFor(item, state.modifierIds),
              });
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function AddItemModal({
  restaurantId,
  visible,
  onClose,
  onAdd,
}: {
  restaurantId: string;
  visible: boolean;
  onClose: () => void;
  onAdd: (line: EditorLine) => void;
}) {
  const { t } = useTranslation();
  const menu = useRestaurantMenu(visible ? restaurantId : '');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (menu.data?.categories ?? []).flatMap((c) =>
      c.items.filter((i) => !q || i.name.toLowerCase().includes(q)).map((i) => ({ ...i, category: c.name })),
    );
  }, [menu.data, query]);

  const close = () => {
    setSelected(null);
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        {selected ? (
          <CustomizeStep item={selected} onBack={() => setSelected(null)} onAdd={(line) => { onAdd(line); close(); }} />
        ) : (
          <View className="flex-1">
            <View className="flex-row items-center gap-2 px-4 py-2">
              <Text variant="heading" className="flex-1">
                {t('orders.addItem')}
              </Text>
              <IconButton icon={X} label={t('common.close')} onPress={close} className="bg-surface" />
            </View>
            <View className="px-4 pb-2">
              <Input icon={Search} placeholder={t('menu.searchPlaceholder')} value={query} onChangeText={setQuery} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
              {menu.isLoading ? <SkeletonList /> : null}
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => setSelected(item)}
                  className="flex-row items-center gap-3 rounded-2xl bg-surface p-3.5 active:opacity-80"
                >
                  <View className="flex-1">
                    <Text variant="subheading">{item.name}</Text>
                    <Text variant="caption" tone="muted">
                      {item.category}
                      {!item.is_available ? ` · ${t('menu.unavailable')}` : ''}
                    </Text>
                  </View>
                  <Text variant="label" tone="primary">
                    {formatMoney(toPiastres(item.base_price))}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

/** Editable list of order lines for admin corrections. Prices shown are previews; the server re-prices. */
export function OrderEditor({
  restaurantId,
  lines,
  onChange,
}: {
  restaurantId: string;
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return (
    <View className="gap-3">
      {lines.map((line) => (
        <Card key={line.key} className="gap-2.5">
          <View className="flex-row items-start gap-3">
            <View className="flex-1">
              <Text variant="subheading">{line.name}</Text>
              {line.modifierNames.length ? (
                <Text variant="small" tone="muted">
                  {line.modifierNames.join(' · ')}
                </Text>
              ) : null}
            </View>
            <Text variant="label">{formatMoney(line.unitPrice * line.quantity)}</Text>
          </View>
          <Input
            placeholder={t('item.instructionsPlaceholder')}
            value={line.instructions}
            onChangeText={(instructions) => onChange(lines.map((l) => (l.key === line.key ? { ...l, instructions } : l)))}
            maxLength={300}
          />
          <View className="flex-row items-center justify-between">
            <QuantityStepper size="sm" value={line.quantity}
              onChange={(quantity) => onChange(lines.map((l) => (l.key === line.key ? { ...l, quantity } : l)))} />
            <IconButton icon={Trash2} tone="danger" label={t('common.remove')}
              onPress={() => onChange(lines.filter((l) => l.key !== line.key))} />
          </View>
        </Card>
      ))}
      <Button label={t('orders.addItem')} icon={Plus} variant="secondary" onPress={() => setAdding(true)} />
      <View className="flex-row items-center justify-between px-1">
        <Text variant="heading">{t('common.total')}</Text>
        <Text variant="heading" tone="primary">
          {formatMoney(total)}
        </Text>
      </View>
      <AddItemModal restaurantId={restaurantId} visible={adding} onClose={() => setAdding(false)}
        onAdd={(line) => onChange([...lines, line])} />
    </View>
  );
}
