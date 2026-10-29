import { router } from 'expo-router';
import { Plus, Search, Store } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CoverImage } from '@/components/ui/RestaurantCover';
import { ScreenHeader } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useRestaurants } from '@/features/restaurants/api';
import { colors, shadows } from '@/theme';
import { formatBusinessDate } from '@/utils/time';

export default function RestaurantsTab() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const restaurants = useRestaurants(query.trim());
  const items = restaurants.data?.items ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        numColumns={1}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12, width: '100%', maxWidth: 860, alignSelf: 'center' }}
        refreshing={restaurants.isRefetching}
        onRefresh={() => restaurants.refetch()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <ScreenHeader title={t('restaurants.title')} />
            <Button label={t('restaurants.add')} icon={Plus} onPress={() => router.push('/restaurant/new')} />
            <Input icon={Search} placeholder={t('restaurants.searchPlaceholder')} value={query} onChangeText={setQuery} />
          </View>
        }
        ListEmptyComponent={
          restaurants.isLoading ? (
            <SkeletonList />
          ) : restaurants.isError ? (
            <ErrorState error={restaurants.error} onRetry={() => restaurants.refetch()} />
          ) : (
            <EmptyState icon={Store} title={t('restaurants.emptyTitle')} message={t('restaurants.emptyMessage')} tone="muted" />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.name}
            onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: item.id } })}
            className="overflow-hidden rounded-3xl bg-surface active:opacity-90"
            style={shadows.card}
          >
            <CoverImage uri={item.cover_image_url} seed={item.name} hint={item.cuisine ?? ''} height={96} radius={0} />
            <View className="gap-1 p-3.5">
              <View className="flex-row items-center gap-2">
                <Text variant="heading" className="flex-1" numberOfLines={1}>
                  {item.name}
                </Text>
                {!item.is_active ? <Badge label={t('restaurants.inactive')} tone="neutral" size="sm" /> : null}
                <Badge label={t(`restaurants.source_${item.source_provider}`)} tone="cyan" size="sm" />
              </View>
              <Text variant="small" tone="muted" numberOfLines={1}>
                {[item.cuisine, item.branch].filter(Boolean).join(' · ') || '—'}
              </Text>
              <Text variant="caption" tone={item.item_count ? 'muted' : 'warning'}>
                {t('session.menuItems', { count: item.item_count })}
                {item.last_selected_on
                  ? ` · ${t('session.lastUsed', { date: formatBusinessDate(item.last_selected_on, i18n.language, 'short') })}`
                  : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
