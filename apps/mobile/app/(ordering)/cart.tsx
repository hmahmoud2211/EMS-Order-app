import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Clock, Pencil, Plus, ShoppingBag, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { QuantityStepper } from '@/components/ui/Controls';
import { CoverImage } from '@/components/ui/RestaurantCover';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { EmptyState, InlineError, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useSubmitOrder, useToday, useUpdateOrder } from '@/features/ordering/api';
import { repriceCart } from '@/features/ordering/reprice';
import { api } from '@/services/api';
import { qk } from '@/services/queryKeys';
import { cartTotal, lineTotal, toOrderLines, unitPrice, useCartStore } from '@/stores/cart';
import { colors, shadows } from '@/theme';
import type { Menu } from '@/types/api';
import { errorCode, errorMessage } from '@/utils/errors';
import { formatMoney, toDecimalString } from '@/utils/money';
import { formatTime } from '@/utils/time';

export default function CartScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const today = useToday();
  const { lines, editingOrderId, updateLine, removeLine, startSubmission, clear } = useCartStore();
  const submit = useSubmitOrder();
  const update = useUpdateOrder();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = today.data?.session;
  const total = cartTotal(lines);
  const pending = submit.isPending || update.isPending;

  const handleError = async (e: unknown) => {
    const code = errorCode(e);
    if (code === 'PRICE_CHANGED' || code === 'ITEM_UNAVAILABLE' || code === 'MODIFIER_UNAVAILABLE' || code === 'ITEM_NOT_IN_MENU') {
      const fresh = await api
        .get<Menu>('/sessions/today/menu')
        .then((r) => {
          client.setQueryData(qk.todayMenu, r.data);
          return r.data;
        })
        .catch(() => client.getQueryData<Menu>(qk.todayMenu));
      if (fresh) {
        const result = repriceCart(useCartStore.getState().lines, fresh);
        useCartStore.setState({ lines: result.lines, idempotencyKey: null });
        setNotice(
          result.removed.length
            ? `${errorMessage(e)} (${result.removed.join(', ')})`
            : t('cart.priceChanged'),
        );
        setError(null);
        return;
      }
    }
    if (code === 'ORDER_EXISTS') {
      client.invalidateQueries({ queryKey: qk.today });
    }
    setError(errorMessage(e));
  };

  const onSubmit = () => {
    if (!session || !lines.length) return;
    setError(null);
    setNotice(null);
    const items = toOrderLines(lines);
    const expectedTotal = toDecimalString(total);
    const onSuccess = (order: { id: string }) => {
      clear();
      router.dismissAll();
      router.replace({ pathname: '/confirmation/[orderId]', params: { orderId: order.id } });
    };
    if (editingOrderId) {
      update.mutate({ orderId: editingOrderId, items, expectedTotal }, { onSuccess, onError: handleError });
    } else {
      submit.mutate(
        { sessionId: session.id, items, expectedTotal, idempotencyKey: startSubmission() },
        { onSuccess, onError: handleError },
      );
    }
  };

  const footer = lines.length ? (
    <View className="border-t border-line bg-surface px-4 pt-3" style={[{ paddingBottom: Math.max(insets.bottom, 14) }, shadows.floating]}>
      <View className="w-full max-w-[640px] gap-3 self-center">
        <View className="flex-row items-center justify-between">
          <Text variant="subheading" tone="soft">
            {t('common.total')}
          </Text>
          <Text variant="title" tone="primary" testID="cart-total">
            {formatMoney(total)}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          {t('cart.estimated')}
        </Text>
        <Button
          size="lg"
          label={pending ? t('cart.submitting') : editingOrderId ? t('cart.update') : t('cart.submit')}
          loading={pending}
          disabled={!today.data?.is_accepting_orders}
          onPress={onSubmit}
          testID="submit-order"
        />
      </View>
    </View>
  ) : null;

  return (
    <Screen footer={footer}>
      <ScreenHeader
        back
        title={editingOrderId ? t('cart.editingTitle') : t('cart.title')}
        subtitle={session ? t('cart.restaurant', { name: session.restaurant.name }) : undefined}
      />
      {!lines.length ? (
        <Card>
          <EmptyState
            icon={ShoppingBag}
            title={t('cart.empty')}
            message={t('cart.emptyMessage')}
            actionLabel={t('home.browseMenu')}
            onAction={() => router.replace('/menu')}
            tone="muted"
          />
        </Card>
      ) : (
        <View className="gap-3">
          {session ? (
            <View className="flex-row items-center gap-2 px-1">
              <Clock size={15} color={colors.muted} />
              <Text variant="small" tone="muted">
                {t('cart.deadline', { time: formatTime(session.closes_at, i18n.language) })}
              </Text>
            </View>
          ) : null}
          {notice ? <Notice message={notice} tone="warning" /> : null}
          {lines.map((line) => (
            <Animated.View key={line.key} exiting={FadeOut} layout={LinearTransition}>
              <Card className="gap-3">
                <View className="flex-row gap-3">
                  <CoverImage uri={line.imageUrl} seed={line.name} hint={line.name} height={64} radius={16} iconSize={22}
                    style={{ width: 64 }} />
                  <View className="flex-1 gap-0.5">
                    <Text variant="subheading">{line.name}</Text>
                    {line.modifiers.length ? (
                      <Text variant="small" tone="muted">
                        {line.modifiers.map((m) => m.name).join(' · ')}
                      </Text>
                    ) : null}
                    {line.instructions ? (
                      <Text variant="small" tone="warning">
                        {t('order.lineNote', { note: line.instructions })}
                      </Text>
                    ) : null}
                    <Text variant="caption" tone="muted">
                      {t('cart.each', { price: formatMoney(unitPrice(line)) })}
                    </Text>
                  </View>
                  <Text variant="subheading">{formatMoney(lineTotal(line))}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <QuantityStepper size="sm" value={line.quantity} onChange={(quantity) => updateLine(line.key, { quantity })} />
                  <View className="flex-row gap-1">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('common.edit')} ${line.name}`}
                      onPress={() => router.push({ pathname: '/item/[id]', params: { id: line.menuItemId, editKey: line.key } })}
                      className="h-10 w-10 items-center justify-center rounded-full active:bg-primary-50"
                    >
                      <Pencil size={18} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('common.remove')} ${line.name}`}
                      onPress={() => removeLine(line.key)}
                      className="h-10 w-10 items-center justify-center rounded-full active:bg-danger-50"
                    >
                      <Trash2 size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              </Card>
            </Animated.View>
          ))}
          <Button label={t('cart.addMore')} icon={Plus} variant="secondary" onPress={() => router.push('/menu')} />
          <InlineError message={error} />
        </View>
      )}
    </Screen>
  );
}
