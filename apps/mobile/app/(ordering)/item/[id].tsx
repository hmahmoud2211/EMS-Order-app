import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { CoverImage } from '@/components/ui/RestaurantCover';
import { EmptyState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useToday, useTodayMenu } from '@/features/ordering/api';
import { ItemCustomizer, useItemConfiguration } from '@/features/ordering/components/ItemCustomizer';
import { useCartStore } from '@/stores/cart';
import { colors, shadows } from '@/theme';
import { selectedModifiers } from '@/utils/modifiers';
import { formatMoney, toPiastres } from '@/utils/money';

export default function ItemScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id, editKey } = useLocalSearchParams<{ id: string; editKey?: string }>();
  const menu = useTodayMenu();
  const today = useToday();
  const item = useMemo(
    () => menu.data?.categories.flatMap((c) => c.items).find((i) => i.id === id),
    [menu.data, id],
  );
  const existing = useCartStore((s) => (editKey ? s.lines.find((l) => l.key === editKey) : undefined));
  const addLine = useCartStore((s) => s.addLine);
  const updateLine = useCartStore((s) => s.updateLine);
  const state = useItemConfiguration(item, existing
    ? { modifierIds: existing.modifiers.map((m) => m.id), quantity: existing.quantity, instructions: existing.instructions }
    : undefined);
  const [showErrors, setShowErrors] = useState(false);

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <EmptyState icon={X} title={t('menu.unavailableTitle')} actionLabel={t('common.close')} onAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  const canOrder = item.is_available && !!today.data?.is_accepting_orders;

  const submit = () => {
    if (state.missing.length) {
      setShowErrors(true);
      return;
    }
    const line = {
      menuItemId: item.id,
      name: item.name,
      imageUrl: item.image_url,
      quantity: state.quantity,
      basePrice: toPiastres(item.base_price),
      modifiers: selectedModifiers(item, state.modifierIds),
      instructions: state.instructions.trim(),
    };
    if (existing) updateLine(existing.key, line);
    else addLine(line);
    toast.success(t('item.added'));
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-[640px] self-center">
          <CoverImage uri={item.image_url} seed={item.name} hint={item.name} height={260} radius={0} iconSize={64} />
          <View className="absolute right-4" style={{ top: Platform.OS === 'ios' ? 16 : insets.top + 12 }}>
            <IconButton icon={X} label={t('common.close')} onPress={() => router.back()} className="bg-surface" size={40} />
          </View>
          <View className="-mt-6 gap-5 rounded-t-3xl bg-canvas px-4 pt-6">
            <View className="gap-2">
              <View className="flex-row items-start justify-between gap-3">
                <Text variant="title" className="flex-1">
                  {item.name}
                </Text>
                <Text variant="title" tone="primary">
                  {formatMoney(toPiastres(item.base_price))}
                </Text>
              </View>
              {item.description ? (
                <Text variant="body" tone="soft">
                  {item.description}
                </Text>
              ) : null}
              {!item.is_available ? <Badge label={t('menu.unavailable')} tone="danger" /> : null}
            </View>
            <ItemCustomizer item={item} state={state} showErrors={showErrors} />
          </View>
        </View>
      </ScrollView>
      <View
        className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-4 pt-3"
        style={[{ paddingBottom: Math.max(insets.bottom, 14) }, shadows.floating]}
      >
        <View className="w-full max-w-[640px] self-center">
          <Button
            size="lg"
            label={
              !today.data?.is_accepting_orders
                ? t('menu.notAccepting')
                : t(existing ? 'item.updateCart' : 'item.addToCart', { price: formatMoney(state.total) })
            }
            disabled={!canOrder}
            onPress={submit}
            testID="add-to-cart"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
