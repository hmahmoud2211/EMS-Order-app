import type { LucideIcon } from 'lucide-react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  icon?: LucideIcon;
  secureToggle?: boolean;
  containerClassName?: string;
  right?: React.ReactNode;
}

export type TextInputRef = ComponentRef<typeof TextInput>;

export const Input = forwardRef<TextInputRef, InputProps>(function Input(
  { label, hint, error, icon: Icon, secureToggle, secureTextEntry, containerClassName = '', right, multiline, style, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  const borderClass = error ? 'border-danger' : focused ? 'border-primary' : 'border-line';
  return (
    <View className={`gap-1.5 ${containerClassName}`}>
      {label ? (
        <Text variant="label" tone="soft">
          {label}
        </Text>
      ) : null}
      <View
        className={`flex-row items-center gap-2 rounded-2xl border bg-surface px-3.5 ${borderClass} ${
          multiline ? 'min-h-[96px] py-2.5 items-start' : 'h-12'
        }`}
      >
        {Icon ? <Icon size={18} color={focused ? colors.primary : colors.muted} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.mutedLight}
          secureTextEntry={secureToggle ? hidden : secureTextEntry}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          accessibilityLabel={label ?? rest.placeholder}
          className="flex-1 text-[15px] text-ink"
          style={[
            { fontFamily: fonts.regular, paddingVertical: 0, textAlignVertical: multiline ? 'top' : 'center' },
            multiline ? { minHeight: 76 } : { height: '100%' },
            style,
          ]}
          {...rest}
        />
        {secureToggle ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('auth.showPassword') : t('auth.hidePassword')}
            hitSlop={10}
          >
            {hidden ? <Eye size={19} color={colors.muted} /> : <EyeOff size={19} color={colors.muted} />}
          </Pressable>
        ) : null}
        {right}
      </View>
      {error ? (
        <Text variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
