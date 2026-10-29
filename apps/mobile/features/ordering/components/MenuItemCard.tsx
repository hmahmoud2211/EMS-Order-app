import { Plus, SlidersHorizontal } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/Badge';
import { CoverImage } from '@/components/ui/RestaurantCover';
import { Text } from '@/components/ui/Text';
import { colors, shadows } from '@/theme';
import type { MenuItem } from '@/types/api';
import { startingPrice } from '@/utils/modifiers';
import { formatMoney } from '@/utils/money';

export const MenuItemCard = memo(function MenuItemCard({
  item,
  quantityInCart,
  onPress,
}: {
  item: MenuItem;
  quantityInCart: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const hasOptions = item.modifier_groups.length > 0;
  const price = startingPrice(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatMoney(price)}${item.is_available ? '' : `, ${t('menu.unavailable')}`}`}
      onPress={onPress}
      disabled={!item.is_available}
      className="flex-row gap-3 rounded-3xl bg-surface p-3 active:opacity-90"
      style={[shadows.card, !item.is_available && { opacity: 0.55 }]}
    >
      <View className="flex-1 justify-between gap-1.5 py-1">
        <View className="gap-1">
          <Text variant="subheading" numberOfLines={2}>
            {item.name}
          </Text>
          {item.description ? (
            <Text variant="small" tone="muted" numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="subheading" tone="primary">
            {hasOptions && item.modifier_groups.some((g) => g.is_required) ? t('menu.from', { price: formatMoney(price) }) : formatMoney(price)}
          </Text>
          {!item.is_available ? <Badge label={t('menu.unavailable')} tone="danger" size="sm" /> : null}
          {item.is_available && hasOptions ? (
            <View className="flex-row items-center gap-1">
              <SlidersHorizontal size={12} color={colors.muted} />
              <Text variant="caption" tone="muted">
                {t('menu.customize')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View>
        <CoverImage uri={item.image_url} seed={item.name} hint={item.name} height={104} radius={18} iconSize={30}
          style={{ width: 104 }} />
        {item.is_available ? (
          <View
            className={`absolute -bottom-1 -right-1 h-9 min-w-[36px] flex-row items-center justify-center rounded-full px-2 ${
              quantityInCart ? 'bg-navy' : 'bg-primary'
            }`}
            style={shadows.card}
          >
            {quantityInCart ? (
              <Text variant="label" tone="white">
                {quantityInCart}
              </Text>
            ) : (
              <Plus size={18} color={colors.white} strokeWidth={2.6} />
            )}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});
