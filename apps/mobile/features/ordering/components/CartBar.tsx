import { router } from 'expo-router';
import { ShoppingBag } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { cartCount, cartTotal, useCartStore } from '@/stores/cart';
import { colors, shadows } from '@/theme';
import { formatMoney } from '@/utils/money';

/** Sticky cart summary shown at the bottom of the menu. */
export function CartBar() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const lines = useCartStore((s) => s.lines);
  const count = cartCount(lines);
  if (count === 0) return null;
  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18)}
      exiting={SlideOutDown}
      style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 4 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('menu.viewCart')}, ${t('menu.cartSummary', { count })}, ${formatMoney(cartTotal(lines))}`}
        onPress={() => router.push('/cart')}
        className="mx-auto h-16 w-full max-w-[560px] flex-row items-center gap-3 rounded-2xl bg-navy px-4 active:opacity-90"
        style={shadows.floating}
        testID="cart-bar"
      >
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-white/10">
          <ShoppingBag size={20} color={colors.white} />
          <View className="absolute -right-1.5 -top-1.5 h-5 min-w-[20px] items-center justify-center rounded-full bg-cyan px-1">
            <Text variant="caption" tone="white" className="text-[11px]">
              {count}
            </Text>
          </View>
        </View>
        <Text variant="subheading" tone="white" className="flex-1">
          {t('menu.viewCart')}
        </Text>
        <Text variant="heading" tone="white">
          {formatMoney(cartTotal(lines))}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
