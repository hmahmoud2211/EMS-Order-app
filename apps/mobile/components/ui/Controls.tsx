import * as Haptics from 'expo-haptics';
import { Check, Minus, Plus } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, Switch, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/theme';

function tap() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
}

export function Chip({
  label,
  selected,
  onPress,
  count,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      className={`h-9 flex-row items-center gap-1.5 rounded-full px-4 ${
        selected ? 'bg-navy' : 'border border-line bg-surface active:bg-canvas'
      }`}
    >
      <Text variant="label" tone={selected ? 'white' : 'soft'}>
        {label}
      </Text>
      {count !== undefined ? (
        <View className={`rounded-full px-1.5 ${selected ? 'bg-white/20' : 'bg-canvas'}`}>
          <Text variant="caption" tone={selected ? 'white' : 'muted'}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {children}
    </ScrollView>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row rounded-2xl bg-line/70 p-1" accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              tap();
              onChange(option.value);
            }}
            className={`h-9 flex-1 flex-row items-center justify-center gap-1 rounded-xl ${selected ? 'bg-surface' : ''}`}
          >
            <Text variant="label" tone={selected ? 'ink' : 'muted'} numberOfLines={1}>
              {option.label}
            </Text>
            {option.count !== undefined ? (
              <Text variant="caption" tone={selected ? 'primary' : 'muted'}>
                {option.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 50,
  size = 'md',
  labels = { increase: 'Increase quantity', decrease: 'Decrease quantity' },
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  labels?: { increase: string; decrease: string };
}) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
  const icon = size === 'sm' ? 15 : 19;
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-canvas p-1" accessibilityRole="adjustable"
      accessibilityValue={{ min, max, now: value }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={labels.decrease}
        disabled={value <= min}
        onPress={() => {
          tap();
          onChange(Math.max(min, value - 1));
        }}
        className={`${box} items-center justify-center rounded-full bg-surface active:opacity-70 ${value <= min ? 'opacity-40' : ''}`}
      >
        <Minus size={icon} color={colors.ink} strokeWidth={2.4} />
      </Pressable>
      <Text variant={size === 'sm' ? 'label' : 'heading'} className="min-w-[28px] text-center">
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={labels.increase}
        disabled={value >= max}
        onPress={() => {
          tap();
          onChange(Math.min(max, value + 1));
        }}
        className={`${box} items-center justify-center rounded-full bg-primary active:opacity-80 ${value >= max ? 'opacity-40' : ''}`}
      >
        <Plus size={icon} color={colors.white} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

export function SelectRow({
  label,
  hint,
  selected,
  onPress,
  multiple = false,
  disabled = false,
  right,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  multiple?: boolean;
  disabled?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      className={`min-h-[52px] flex-row items-center gap-3 rounded-2xl border px-3.5 py-2.5 ${
        selected ? 'border-primary bg-primary-50' : 'border-line bg-surface active:bg-canvas'
      } ${disabled ? 'opacity-45' : ''}`}
    >
      <View
        className={`h-[22px] w-[22px] items-center justify-center ${multiple ? 'rounded-md' : 'rounded-full'} ${
          selected ? 'bg-primary' : 'border-2 border-line-strong bg-surface'
        }`}
      >
        {selected ? <Check size={14} color={colors.white} strokeWidth={3} /> : null}
      </View>
      <View className="flex-1">
        <Text variant="subheading" numberOfLines={2}>
          {label}
        </Text>
        {hint ? (
          <Text variant="small" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="min-h-[52px] flex-row items-center gap-3 py-2">
      <View className="flex-1">
        <Text variant="subheading">{label}</Text>
        {hint ? (
          <Text variant="small" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.lineStrong }}
        thumbColor={colors.white}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function Divider({ className = '' }: { className?: string }) {
  return <View className={`h-px bg-line ${className}`} />;
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View className="mb-2.5 mt-6 flex-row items-center justify-between">
      <Text variant="overline" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      {action}
    </View>
  );
}
