import { Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { QuantityStepper, SegmentedControl, SwitchRow } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme';
import type { ModifierGroup } from '@/types/api';
import { randomId } from '@/utils/id';
import { isValidPriceInput } from '@/utils/money';

export interface OptionDraft {
  key: string;
  id?: string;
  name: string;
  additional_price: string;
  is_available: boolean;
}

export interface GroupDraft {
  key: string;
  id?: string;
  name: string;
  minimum_selections: number;
  maximum_selections: number;
  is_required: boolean;
  modifiers: OptionDraft[];
}

export function draftsFromGroups(groups: ModifierGroup[]): GroupDraft[] {
  return groups.map((g) => ({
    key: g.id,
    id: g.id,
    name: g.name,
    minimum_selections: g.minimum_selections,
    maximum_selections: g.maximum_selections,
    is_required: g.is_required,
    modifiers: g.modifiers.map((m) => ({
      key: m.id,
      id: m.id,
      name: m.name,
      additional_price: m.additional_price.replace(/\.00$/, ''),
      is_available: m.is_available,
    })),
  }));
}

export interface GroupCallbacks {
  /** Called after edits that should be persisted immediately (live mode). */
  onCommitGroup?: (group: GroupDraft) => void;
  onCommitOption?: (group: GroupDraft, option: OptionDraft) => void;
  onAddOption?: (group: GroupDraft, option: OptionDraft) => void;
  onRemoveOption?: (group: GroupDraft, option: OptionDraft) => void;
  onRemoveGroup?: (group: GroupDraft) => void;
  onAddGroup?: (group: GroupDraft) => void;
}

function GroupCard({
  group,
  onChange,
  callbacks,
}: {
  group: GroupDraft;
  onChange: (group: GroupDraft | null) => void;
  callbacks: GroupCallbacks;
}) {
  const { t } = useTranslation();
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('0');
  const single = group.maximum_selections === 1;

  const update = (patch: Partial<GroupDraft>, commit = false) => {
    const next = { ...group, ...patch };
    if (next.is_required && next.minimum_selections < 1) next.minimum_selections = 1;
    if (!next.is_required) next.minimum_selections = 0;
    onChange(next);
    if (commit) callbacks.onCommitGroup?.(next);
  };
  const updateOption = (key: string, patch: Partial<OptionDraft>, commit = false) => {
    const modifiers = group.modifiers.map((m) => (m.key === key ? { ...m, ...patch } : m));
    onChange({ ...group, modifiers });
    const option = modifiers.find((m) => m.key === key)!;
    if (commit && isValidPriceInput(option.additional_price || '0') && option.name.trim()) {
      callbacks.onCommitOption?.(group, option);
    }
  };

  return (
    <Card className="gap-3" elevation="none" style={{ borderWidth: 1, borderColor: colors.line }}>
      <View className="flex-row items-end gap-2">
        <Input
          containerClassName="flex-1"
          label={t('itemEditor.groupName')}
          placeholder={t('itemEditor.groupNamePlaceholder')}
          value={group.name}
          onChangeText={(name) => update({ name })}
          onEndEditing={() => group.name.trim() && callbacks.onCommitGroup?.(group)}
        />
        <IconButton icon={Trash2} tone="danger" label={t('itemEditor.deleteGroup')} onPress={() => {
          callbacks.onRemoveGroup?.(group);
          onChange(null);
        }} />
      </View>
      <SegmentedControl<'single' | 'multiple'>
        value={single ? 'single' : 'multiple'}
        onChange={(mode) =>
          update({ maximum_selections: mode === 'single' ? 1 : Math.max(2, group.modifiers.length || 2) }, true)
        }
        options={[
          { value: 'single', label: t('item.chooseOne') },
          { value: 'multiple', label: t('item.chooseUpTo', { count: Math.max(2, group.maximum_selections) }) },
        ]}
      />
      {!single ? (
        <View className="flex-row items-center justify-between">
          <Text variant="label" tone="soft">
            {t('itemEditor.maximum')}
          </Text>
          <QuantityStepper size="sm" min={2} max={20} value={group.maximum_selections}
            onChange={(maximum_selections) => update({ maximum_selections }, true)} />
        </View>
      ) : null}
      <SwitchRow label={t('itemEditor.requiredGroup')} value={group.is_required}
        onChange={(is_required) => update({ is_required }, true)} />

      {group.modifiers.map((option) => (
        <View key={option.key} className="flex-row items-center gap-2">
          <Input
            containerClassName="flex-1"
            placeholder={t('itemEditor.optionName')}
            value={option.name}
            onChangeText={(name) => updateOption(option.key, { name })}
            onEndEditing={() => updateOption(option.key, {}, true)}
          />
          <Input
            containerClassName="w-24"
            placeholder={t('itemEditor.optionPrice')}
            keyboardType="decimal-pad"
            value={option.additional_price}
            onChangeText={(additional_price) => updateOption(option.key, { additional_price })}
            onEndEditing={() => updateOption(option.key, {}, true)}
            error={isValidPriceInput(option.additional_price || '0') ? undefined : ' '}
          />
          <Switch
            value={option.is_available}
            onValueChange={(is_available) => updateOption(option.key, { is_available }, true)}
            trackColor={{ true: colors.success, false: colors.lineStrong }}
            thumbColor={colors.white}
            accessibilityLabel={`${option.name} ${t('common.available')}`}
          />
          <IconButton icon={Trash2} tone="danger" size={34} label={t('common.remove')} onPress={() => {
            callbacks.onRemoveOption?.(group, option);
            onChange({ ...group, modifiers: group.modifiers.filter((m) => m.key !== option.key) });
          }} />
        </View>
      ))}
      <View className="flex-row items-center gap-2">
        <Input containerClassName="flex-1" placeholder={t('itemEditor.optionName')} value={newName} onChangeText={setNewName} />
        <Input containerClassName="w-24" placeholder={t('itemEditor.optionPrice')} keyboardType="decimal-pad" value={newPrice}
          onChangeText={setNewPrice} />
        <IconButton
          icon={Plus}
          tone="primary"
          label={t('itemEditor.addOption')}
          disabled={!newName.trim() || !isValidPriceInput(newPrice || '0')}
          onPress={() => {
            const option: OptionDraft = { key: randomId(), name: newName.trim(), additional_price: newPrice || '0', is_available: true };
            onChange({ ...group, modifiers: [...group.modifiers, option] });
            callbacks.onAddOption?.(group, option);
            setNewName('');
            setNewPrice('0');
          }}
        />
      </View>
    </Card>
  );
}

export function ModifierGroupsEditor({
  groups,
  onChange,
  callbacks = {},
}: {
  groups: GroupDraft[];
  onChange: (groups: GroupDraft[]) => void;
  callbacks?: GroupCallbacks;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      {groups.map((group) => (
        <GroupCard
          key={group.key}
          group={group}
          callbacks={callbacks}
          onChange={(next) =>
            onChange(next ? groups.map((g) => (g.key === group.key ? next : g)) : groups.filter((g) => g.key !== group.key))
          }
        />
      ))}
      <Button
        label={t('itemEditor.addGroup')}
        icon={Plus}
        variant="secondary"
        onPress={() => {
          const group: GroupDraft = {
            key: randomId(),
            name: '',
            minimum_selections: 0,
            maximum_selections: 1,
            is_required: false,
            modifiers: [],
          };
          onChange([...groups, group]);
          callbacks.onAddGroup?.(group);
        }}
      />
    </View>
  );
}
