import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, FileUp, MapPin, Pencil, Phone, Plus, Trash2, UtensilsCrossed } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Divider, SectionTitle } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { CoverImage, RestaurantLogo } from '@/components/ui/RestaurantCover';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import {
  useCreateCategory,
  useDeleteCategory,
  useRestaurant,
  useRestaurantMenu,
  useToggleItemAvailability,
} from '@/features/restaurants/api';
import { colors } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatPrice } from '@/utils/money';

export default function RestaurantDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurant = useRestaurant(id);
  const menu = useRestaurantMenu(id);
  const createCategory = useCreateCategory(id);
  const deleteCategory = useDeleteCategory(id);
  const toggle = useToggleItemAvailability(id);
  const [newCategory, setNewCategory] = useState('');
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const r = restaurant.data;

  return (
    <Screen refreshing={menu.isRefetching} onRefresh={() => Promise.all([restaurant.refetch(), menu.refetch()])}>
      <ScreenHeader back title={r?.name ?? t('restaurants.title')}
        right={r ? <IconButton icon={Pencil} label={t('restaurants.editDetails')} className="bg-surface"
          onPress={() => router.push({ pathname: '/restaurant/[id]/edit', params: { id } })} /> : undefined} />
      {restaurant.isLoading ? (
        <SkeletonCard lines={5} />
      ) : restaurant.isError || !r ? (
        <ErrorState error={restaurant.error} onRetry={() => restaurant.refetch()} />
      ) : (
        <View className="gap-4">
          <Card padded={false} className="overflow-hidden">
            <CoverImage uri={r.cover_image_url} seed={r.name} hint={r.cuisine ?? ''} height={140} radius={0} />
            <View className="gap-2 p-4">
              <View className="-mt-12 flex-row items-end gap-3">
                <RestaurantLogo uri={r.logo_url} name={r.name} size={64} />
                <View className="flex-1 flex-row flex-wrap justify-end gap-1.5 pb-1">
                  {!r.is_active ? <Badge label={t('restaurants.inactive')} tone="neutral" /> : null}
                  <Badge label={t(`restaurants.source_${r.source_provider}`)} tone="cyan" />
                </View>
              </View>
              <Text variant="small" tone="muted">
                {[r.cuisine, r.branch].filter(Boolean).join(' · ') || '—'}
              </Text>
              {r.description ? <Text variant="small" tone="soft">{r.description}</Text> : null}
              {r.phone ? (
                <View className="flex-row items-center gap-2">
                  <Phone size={14} color={colors.muted} />
                  <Text variant="small" tone="soft">{r.phone}</Text>
                </View>
              ) : null}
              {r.address ? (
                <View className="flex-row items-center gap-2">
                  <MapPin size={14} color={colors.muted} />
                  <Text variant="small" tone="soft">{r.address}</Text>
                </View>
              ) : null}
            </View>
          </Card>

          <Button label={t('restaurants.importMenu')} icon={FileUp}
            onPress={() => router.push({ pathname: '/restaurant/[id]/import', params: { id } })} />

          <SectionTitle title={`${t('restaurants.menu')}${menu.data ? ` · ${t('session.menuItems', { count: menu.data.item_count })}` : ''}`} />
          {menu.isLoading ? (
            <SkeletonCard lines={4} />
          ) : menu.isError ? (
            <ErrorState error={menu.error} onRetry={() => menu.refetch()} />
          ) : !menu.data?.categories.length ? (
            <Card>
              <EmptyState icon={UtensilsCrossed} title={t('restaurants.noMenuTitle')} message={t('restaurants.noMenuMessage')}
                tone="muted" compact />
            </Card>
          ) : (
            <View className="gap-4">
              {menu.data.categories.map((category) => (
                <Card key={category.id} className="gap-1">
                  <View className="mb-1 flex-row items-center gap-2">
                    <Text variant="heading" className="flex-1">
                      {category.name}
                    </Text>
                    <IconButton icon={Plus} tone="primary" size={36} label={`${t('restaurants.addItem')} – ${category.name}`}
                      onPress={() => router.push({ pathname: '/restaurant/[id]/item/[itemId]', params: { id, itemId: 'new', categoryId: category.id } })} />
                    <IconButton icon={Trash2} tone="danger" size={36} label={t('restaurants.deleteCategory')}
                      onPress={() => setDeleting({ id: category.id, name: category.name })} />
                  </View>
                  {category.items.length === 0 ? (
                    <Text variant="small" tone="muted" className="py-2">
                      {t('common.noResults')}
                    </Text>
                  ) : null}
                  {category.items.map((item, index) => (
                    <View key={item.id}>
                      {index > 0 ? <Divider /> : null}
                      <View className="flex-row items-center gap-3 py-2.5">
                        <Pressable
                          accessibilityRole="button"
                          className="flex-1 flex-row items-center gap-3 active:opacity-70"
                          onPress={() => router.push({ pathname: '/restaurant/[id]/item/[itemId]', params: { id, itemId: item.id } })}
                        >
                          <View className="flex-1">
                            <Text variant="subheading" tone={item.is_available ? 'ink' : 'muted'} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text variant="caption" tone="muted">
                              {formatPrice(item.base_price)}
                              {item.modifier_groups.length ? ` · ${item.modifier_groups.map((g) => g.name).join(', ')}` : ''}
                            </Text>
                          </View>
                          <ChevronRight size={16} color={colors.mutedLight} />
                        </Pressable>
                        <Switch
                          value={item.is_available}
                          onValueChange={(value) =>
                            toggle.mutate({ id: item.id, is_available: value }, { onError: (e) => toast.error(errorMessage(e)) })
                          }
                          trackColor={{ true: colors.success, false: colors.lineStrong }}
                          thumbColor={colors.white}
                          accessibilityLabel={`${item.name} ${t('common.available')}`}
                        />
                      </View>
                    </View>
                  ))}
                </Card>
              ))}
            </View>
          )}

          <Card className="gap-3">
            <Input label={t('restaurants.addCategory')} placeholder={t('restaurants.categoryName')} value={newCategory}
              onChangeText={setNewCategory} />
            <Button label={t('restaurants.addCategory')} icon={Plus} variant="secondary" disabled={!newCategory.trim()}
              loading={createCategory.isPending}
              onPress={() =>
                createCategory.mutate(newCategory.trim(), {
                  onSuccess: () => setNewCategory(''),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              } />
          </Card>
        </View>
      )}
      <ConfirmDialog
        visible={!!deleting}
        title={t('restaurants.deleteCategory')}
        message={`${deleting?.name ?? ''} — ${t('restaurants.deleteCategoryConfirm')}`}
        destructive
        confirmLabel={t('common.delete')}
        loading={deleteCategory.isPending}
        error={deleteCategory.isError ? errorMessage(deleteCategory.error) : null}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting && deleteCategory.mutate({ id: deleting.id, archiveItems: true }, { onSuccess: () => setDeleting(null) })
        }
      />
    </Screen>
  );
}
