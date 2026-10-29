import { router, useLocalSearchParams } from 'expo-router';
import { Save, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Chip, ChipRow, SectionTitle, SwitchRow } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState, InlineError } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import {
  useArchiveItem,
  useMenuItem,
  useModifierMutations,
  useRestaurantMenu,
  useSaveMenuItem,
} from '@/features/restaurants/api';
import { ImageField } from '@/features/restaurants/components/ImageField';
import {
  draftsFromGroups,
  ModifierGroupsEditor,
  type GroupCallbacks,
  type GroupDraft,
} from '@/features/restaurants/components/ModifierGroupsEditor';
import type { MenuItem } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { isValidPriceInput } from '@/utils/money';

export default function ItemEditorScreen() {
  const { t } = useTranslation();
  const { id: restaurantId, itemId, categoryId } = useLocalSearchParams<{ id: string; itemId: string; categoryId?: string }>();
  const isNew = itemId === 'new';
  const item = useMenuItem(isNew ? undefined : itemId);

  if (!isNew && (item.isLoading || item.isError || !item.data)) {
    return (
      <Screen>
        <ScreenHeader back title={t('itemEditor.editTitle')} />
        {item.isLoading ? <SkeletonCard lines={6} /> : <ErrorState error={item.error} onRetry={() => item.refetch()} />}
      </Screen>
    );
  }
  return (
    <ItemEditorForm
      key={item.data?.id ?? 'new'}
      restaurantId={restaurantId}
      item={isNew ? undefined : item.data}
      defaultCategoryId={categoryId}
    />
  );
}

function ItemEditorForm({
  restaurantId,
  item,
  defaultCategoryId,
}: {
  restaurantId: string;
  item?: MenuItem;
  defaultCategoryId?: string;
}) {
  const { t } = useTranslation();
  const isNew = !item;
  const menu = useRestaurantMenu(restaurantId);
  const save = useSaveMenuItem(restaurantId, item?.id);
  const archive = useArchiveItem(restaurantId);
  const mutations = useModifierMutations(restaurantId, item?.id ?? '');

  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? item.base_price.replace(/\.00$/, '') : '');
  const [category, setCategory] = useState<string | null>(item?.category_id ?? defaultCategoryId ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image_url ?? null);
  const [available, setAvailable] = useState(item?.is_available ?? true);
  const [groups, setGroups] = useState<GroupDraft[]>(() => (item ? draftsFromGroups(item.modifier_groups) : []));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const categories = menu.data?.categories ?? [];
  const priceValid = isValidPriceInput(price);
  const canSave = name.trim().length > 0 && priceValid && !!category;

  /** In edit mode, option/group changes are saved immediately; keep unsaved new groups locally. */
  const sync = (server: MenuItem) =>
    setGroups((current) => [...draftsFromGroups(server.modifier_groups), ...current.filter((g) => !g.id && !g.name.trim())]);
  const onError = (e: unknown) => toast.error(errorMessage(e));

  const liveCallbacks: GroupCallbacks = isNew
    ? {}
    : {
        onCommitGroup: (group) => {
          if (!group.name.trim()) return;
          if (group.id) {
            mutations.updateGroup.mutate(
              {
                id: group.id,
                name: group.name.trim(),
                minimum_selections: group.minimum_selections,
                maximum_selections: group.maximum_selections,
                is_required: group.is_required,
              },
              { onSuccess: sync, onError },
            );
          } else {
            mutations.addGroup.mutate(
              {
                name: group.name.trim(),
                minimum_selections: group.minimum_selections,
                maximum_selections: group.maximum_selections,
                is_required: group.is_required,
                modifiers: group.modifiers
                  .filter((m) => m.name.trim())
                  .map((m) => ({ name: m.name.trim(), additional_price: m.additional_price || '0', is_available: m.is_available })),
              },
              { onSuccess: sync, onError },
            );
          }
        },
        onCommitOption: (_group, option) =>
          option.id &&
          mutations.updateModifier.mutate(
            { id: option.id, name: option.name.trim(), additional_price: option.additional_price || '0', is_available: option.is_available },
            { onError },
          ),
        onAddOption: (group, option) =>
          group.id &&
          mutations.addModifier.mutate(
            { groupId: group.id, name: option.name, additional_price: option.additional_price, is_available: true },
            { onSuccess: sync, onError },
          ),
        onRemoveOption: (_group, option) => option.id && mutations.deleteModifier.mutate(option.id, { onSuccess: sync, onError }),
        onRemoveGroup: (group) => group.id && mutations.deleteGroup.mutate(group.id, { onSuccess: sync, onError }),
      };

  const submit = () => {
    if (!canSave) return;
    save.mutate(
      {
        category_id: category!,
        name: name.trim(),
        description: description.trim() || null,
        image_url: imageUrl,
        base_price: price,
        is_available: available,
        modifier_groups: isNew
          ? groups
              .filter((g) => g.name.trim() && g.modifiers.length)
              .map((g) => ({
                name: g.name.trim(),
                minimum_selections: g.minimum_selections,
                maximum_selections: Math.min(g.maximum_selections, Math.max(1, g.modifiers.length)),
                is_required: g.is_required,
                modifiers: g.modifiers.map((m) => ({
                  name: m.name.trim(),
                  additional_price: m.additional_price || '0',
                  is_available: m.is_available,
                })),
              }))
          : undefined,
      },
      {
        onSuccess: () => {
          toast.success(t('itemEditor.saved'));
          router.back();
        },
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader back title={isNew ? t('itemEditor.newTitle') : t('itemEditor.editTitle')} subtitle={menu.data?.restaurant.name} />
      <Card className="gap-4">
        <ImageField label={t('itemEditor.photo')} value={imageUrl} onChange={setImageUrl} kind="items" />
        <Input label={t('itemEditor.name')} value={name} onChangeText={setName} maxLength={160} />
        <Input label={t('itemEditor.description')} value={description} onChangeText={setDescription} multiline maxLength={1000} />
        <Input label={t('itemEditor.price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad"
          error={price && !priceValid ? t('itemEditor.invalidPrice') : undefined} />
        <View className="gap-2">
          <Text variant="label" tone="soft">
            {t('itemEditor.category')}
          </Text>
          <ChipRow>
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} selected={category === c.id} onPress={() => setCategory(c.id)} />
            ))}
          </ChipRow>
        </View>
        <SwitchRow label={t('itemEditor.available')} value={available} onChange={setAvailable} />
      </Card>

      <SectionTitle title={t('itemEditor.modifierGroups')} />
      <ModifierGroupsEditor groups={groups} onChange={setGroups} callbacks={liveCallbacks} />

      <View className="mt-6 gap-3">
        <InlineError message={save.isError ? errorMessage(save.error) : null} />
        <Button label={t('common.save')} icon={Save} size="lg" disabled={!canSave} loading={save.isPending} onPress={submit} />
        {item ? (
          <Button label={t('itemEditor.deleteItem')} icon={Trash2} variant="dangerOutline" onPress={() => setConfirmDelete(true)} />
        ) : null}
      </View>
      <ConfirmDialog
        visible={confirmDelete}
        title={t('itemEditor.deleteItem')}
        message={t('itemEditor.deleteItemConfirm')}
        destructive
        confirmLabel={t('common.remove')}
        loading={archive.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          item &&
          archive.mutate(item.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              router.back();
            },
            onError,
          })
        }
      />
    </Screen>
  );
}
