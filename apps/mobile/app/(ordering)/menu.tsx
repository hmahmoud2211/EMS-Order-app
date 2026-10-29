import { router } from 'expo-router';
import { ChevronLeft, Search, SearchX, UtensilsCrossed } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui/Button';
import { Chip, ChipRow } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { CoverImage } from '@/components/ui/RestaurantCover';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useToday, useTodayMenu } from '@/features/ordering/api';
import { CartBar } from '@/features/ordering/components/CartBar';
import { MenuItemCard } from '@/features/ordering/components/MenuItemCard';
import { useCartStore } from '@/stores/cart';
import { colors } from '@/theme';
import type { MenuItem } from '@/types/api';
import { formatTime } from '@/utils/time';

export default function MenuScreen() {
  const { t, i18n } = useTranslation();
  const today = useToday();
  const menu = useTodayMenu(!!today.data?.session);
  const lines = useCartStore((s) => s.lines);
  const ensureSession = useCartStore((s) => s.ensureSession);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const listRef = useRef<SectionList<MenuItem>>(null);
  const session = today.data?.session;

  useEffect(() => {
    if (session) ensureSession(session.id);
  }, [session, ensureSession]);

  const quantities = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) map.set(line.menuItemId, (map.get(line.menuItemId) ?? 0) + line.quantity);
    return map;
  }, [lines]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (menu.data?.categories ?? [])
      .map((category) => ({
        key: category.id,
        title: category.name,
        data: category.items.filter(
          (item) => !q || item.name.toLowerCase().includes(q) || (item.description ?? '').toLowerCase().includes(q),
        ),
      }))
      .filter((section) => section.data.length > 0);
  }, [menu.data, query]);

  const jumpTo = (categoryId: string) => {
    setActiveCategory(categoryId);
    const index = sections.findIndex((s) => s.key === categoryId);
    if (index >= 0) {
      listRef.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, viewOffset: 56, animated: true });
    }
  };

  const restaurant = menu.data?.restaurant ?? session?.restaurant;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <OfflineBanner />
      <View className="w-full max-w-[760px] flex-1 self-center">
        <View className="flex-row items-center gap-2 px-4 pb-2 pt-1">
          <IconButton icon={ChevronLeft} label={t('common.back')} onPress={() => router.back()} className="-ml-2 bg-surface"
            size={40} />
          <View className="flex-1">
            <Text variant="heading" numberOfLines={1}>
              {restaurant?.name ?? t('menu.title')}
            </Text>
            {session ? (
              <Text variant="caption" tone="muted">
                {t('cart.deadline', { time: formatTime(session.closes_at, i18n.language) })}
              </Text>
            ) : null}
          </View>
        </View>

        {menu.isLoading || today.isLoading ? (
          <View className="px-4">
            <SkeletonList count={6} />
          </View>
        ) : menu.isError ? (
          <ErrorState error={menu.error} onRetry={() => menu.refetch()} />
        ) : !menu.data ? (
          <EmptyState icon={UtensilsCrossed} title={t('menu.unavailableTitle')} tone="muted" />
        ) : (
          <SectionList
            ref={listRef}
            sections={sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={() => undefined}
            ListHeaderComponent={
              <View className="gap-3 pb-1">
                <CoverImage uri={restaurant?.cover_image_url} seed={restaurant?.name ?? 'menu'}
                  hint={restaurant?.cuisine ?? ''} height={120} />
                {!today.data?.is_accepting_orders ? <Notice message={t('menu.notAccepting')} tone="warning" /> : null}
                <Input
                  icon={Search}
                  placeholder={t('menu.searchPlaceholder')}
                  value={query}
                  onChangeText={setQuery}
                  returnKeyType="search"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
                <ChipRow>
                  {menu.data.categories.map((category) => (
                    <Chip
                      key={category.id}
                      label={category.name}
                      selected={activeCategory === category.id}
                      onPress={() => jumpTo(category.id)}
                    />
                  ))}
                </ChipRow>
              </View>
            }
            renderSectionHeader={({ section }) => (
              <Text variant="heading" className="mb-2.5 mt-5" accessibilityRole="header">
                {section.title}
              </Text>
            )}
            ItemSeparatorComponent={() => <View className="h-3" />}
            renderItem={({ item }) => (
              <MenuItemCard
                item={item}
                quantityInCart={quantities.get(item.id) ?? 0}
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              />
            )}
            ListEmptyComponent={
              <EmptyState icon={SearchX} title={t('menu.emptyTitle')} message={t('menu.emptyMessage')} tone="muted" compact />
            }
          />
        )}
      </View>
      <CartBar />
    </SafeAreaView>
  );
}
