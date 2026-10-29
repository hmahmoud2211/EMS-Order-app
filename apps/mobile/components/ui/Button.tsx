import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Platform, Pressable, View, type PressableProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerOutline' | 'navy' | 'success';
type Size = 'sm' | 'md' | 'lg';

const containers: Record<Variant, string> = {
  primary: 'bg-primary active:bg-primary-600',
  secondary: 'bg-primary-50 active:bg-primary-100',
  outline: 'bg-surface border border-line-strong active:bg-canvas',
  ghost: 'bg-transparent active:bg-primary-50',
  danger: 'bg-danger active:bg-danger-700',
  dangerOutline: 'bg-surface border border-danger/40 active:bg-danger-50',
  navy: 'bg-navy active:bg-navy-700',
  success: 'bg-success active:bg-success-700',
};

const labelTone = {
  primary: 'white',
  secondary: 'primary',
  outline: 'ink',
  ghost: 'primary',
  danger: 'white',
  dangerOutline: 'danger',
  navy: 'white',
  success: 'white',
} as const;

const iconColor: Record<Variant, string> = {
  primary: colors.white,
  secondary: colors.primary,
  outline: colors.ink,
  ghost: colors.primary,
  danger: colors.white,
  dangerOutline: colors.danger,
  navy: colors.white,
  success: colors.white,
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 rounded-xl',
  md: 'h-12 px-4 rounded-2xl',
  lg: 'h-14 px-5 rounded-2xl',
};

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  haptic?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled,
  fullWidth = true,
  className = '',
  haptic = true,
  onPress,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={(event) => {
        if (haptic && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
        onPress?.(event);
      }}
      className={`flex-row items-center justify-center gap-2 ${sizes[size]} ${containers[variant]} ${
        fullWidth ? 'w-full' : 'self-start'
      } ${isDisabled ? 'opacity-50' : ''} ${className}`}
      hitSlop={size === 'sm' ? 6 : 0}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={iconColor[variant]} size="small" />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 16 : 19} color={iconColor[variant]} strokeWidth={2.2} />
      ) : null}
      <Text variant={size === 'sm' ? 'label' : 'subheading'} tone={labelTone[variant]} numberOfLines={1}>
        {label}
      </Text>
      {IconRight && !loading ? (
        <View>
          <IconRight size={size === 'sm' ? 16 : 19} color={iconColor[variant]} strokeWidth={2.2} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function IconButton({
  icon: Icon,
  onPress,
  label,
  tone = 'ink',
  size = 40,
  className = '',
  disabled,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  tone?: 'ink' | 'white' | 'primary' | 'danger';
  size?: number;
  className?: string;
  disabled?: boolean;
}) {
  const color = { ink: colors.ink, white: colors.white, primary: colors.primary, danger: colors.danger }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={{ width: size, height: size }}
      className={`items-center justify-center rounded-full active:opacity-70 ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <Icon size={Math.round(size * 0.5)} color={color} strokeWidth={2.2} />
    </Pressable>
  );
}
