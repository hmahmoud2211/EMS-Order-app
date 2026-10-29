import { Pressable, View, type ViewProps } from 'react-native';

import { shadows } from '@/theme';

interface CardProps extends ViewProps {
  className?: string;
  onPress?: () => void;
  padded?: boolean;
  elevation?: 'card' | 'raised' | 'none';
  accessibilityLabel?: string;
}

export function Card({
  className = '',
  onPress,
  padded = true,
  elevation = 'card',
  style,
  children,
  accessibilityLabel,
  ...rest
}: CardProps) {
  const base = `bg-surface rounded-3xl ${padded ? 'p-4' : ''} ${className}`;
  const shadow = elevation === 'none' ? undefined : shadows[elevation];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        className={`${base} active:opacity-90`}
        style={[shadow, style]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View className={base} style={[shadow, style]} accessibilityLabel={accessibilityLabel} {...rest}>
      {children}
    </View>
  );
}
