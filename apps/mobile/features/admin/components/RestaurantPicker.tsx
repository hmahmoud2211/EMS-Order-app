import { Search, Store } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/Input';
import { CoverImage } from '@/components/ui/RestaurantCover';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useRestaurants } from '@/features/restaurants/api';
import { formatBusinessDate } from '@/utils/time';

/** Choose the restaurant of the day. Only active restaurants with a menu can be selected. */
export function RestaurantPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const restaurants = useRestaurants(query.trim(), true);
  const items = restaurants.data?.items ?? [];

  return (
    <View className="gap-3">
      <Input icon={Search} placeholder={t('restaurants.searchPlaceholder')} value={query} onChangeText={setQuery} />
      {restaurants.isLoading ? (
        <SkeletonList count={3} />
      ) : !items.length ? (
        <EmptyState icon={Store} title={t('session.noRestaurants')} tone="muted" compact />
      ) : (
        <View className="gap-2.5" accessibilityRole="radiogroup">
          {items.map((restaurant) => {
            const selected = restaurant.id === value;
            const disabled = restaurant.item_count === 0;
            return (
              <Pressable
                key={restaurant.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled }}
                disabled={disabled}
                onPress={() => onChange(restaurant.id)}
                className={`flex-row items-center gap-3 rounded-3xl border-2 bg-surface p-2.5 ${
                  selected ? 'border-primary' : 'border-transparent'
                } ${disabled ? 'opacity-50' : 'active:opacity-90'}`}
              >
                <CoverImage uri={restaurant.cover_image_url} seed={restaurant.name} hint={restaurant.cuisine ?? ''}
                  height={60} radius={16} iconSize={24} style={{ width: 60 }} />
                <View className="flex-1 gap-0.5">
                  <Text variant="subheading" numberOfLines={1}>
                    {restaurant.name}
                  </Text>
                  <Text variant="small" tone="muted" numberOfLines={1}>
                    {[restaurant.cuisine, restaurant.branch].filter(Boolean).join(' · ') || '—'}
                  </Text>
                  <Text variant="caption" tone={disabled ? 'danger' : 'muted'}>
                    {t('session.menuItems', { count: restaurant.item_count })}
                    {restaurant.last_selected_on
                      ? ` · ${t('session.lastUsed', { date: formatBusinessDate(restaurant.last_selected_on, i18n.language, 'short') })}`
                      : ''}
                  </Text>
                </View>
                <View
                  className={`h-6 w-6 items-center justify-center rounded-full ${selected ? 'bg-primary' : 'border-2 border-line-strong'}`}
                >
                  {selected ? <View className="h-2.5 w-2.5 rounded-full bg-white" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
