import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, WifiOff } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme';
import { errorCode, errorMessage } from '@/utils/errors';

export function EmptyState({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
  tone = 'primary',
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'primary' | 'warning' | 'muted';
  compact?: boolean;
}) {
  const color = tone === 'warning' ? colors.warning700 : tone === 'muted' ? colors.muted : colors.primary;
  const bg = tone === 'warning' ? colors.warning50 : tone === 'muted' ? '#EEF1F6' : colors.primary50;
  return (
    <Animated.View entering={FadeIn.duration(250)} className={`items-center ${compact ? 'py-6' : 'py-12'} px-6`}>
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: bg }}>
        <Icon size={28} color={color} strokeWidth={2} />
      </View>
      <Text variant="heading" className="text-center">
        {title}
      </Text>
      {message ? (
        <Text variant="small" tone="muted" className="mt-1.5 max-w-[320px] text-center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View className="mt-5 w-full max-w-[280px]">
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </Animated.View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const offline = errorCode(error) === 'NETWORK_ERROR';
  return (
    <EmptyState
      icon={offline ? WifiOff : AlertTriangle}
      tone="warning"
      title={offline ? t('errors.NETWORK_ERROR') : errorMessage(error)}
      actionLabel={onRetry ? t('common.retry') : undefined}
      onAction={onRetry}
    />
  );
}

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View className="flex-row items-start gap-2 rounded-2xl bg-danger-50 px-3.5 py-3" accessibilityLiveRegion="polite">
      <AlertTriangle size={17} color={colors.danger} />
      <Text variant="small" tone="danger" className="flex-1">
        {message}
      </Text>
    </View>
  );
}

export function Notice({
  message,
  tone = 'primary',
  icon: Icon,
}: {
  message: string;
  tone?: 'primary' | 'warning' | 'success' | 'neutral';
  icon?: LucideIcon;
}) {
  const palette = {
    primary: { bg: colors.primary50, fg: colors.primary700 },
    warning: { bg: colors.warning50, fg: colors.warning700 },
    success: { bg: colors.success50, fg: '#0F7A37' },
    neutral: { bg: '#EEF1F6', fg: colors.inkSoft },
  }[tone];
  return (
    <View className="flex-row items-start gap-2.5 rounded-2xl px-3.5 py-3" style={{ backgroundColor: palette.bg }}>
      {Icon ? <Icon size={17} color={palette.fg} style={{ marginTop: 1 }} /> : null}
      <Text variant="small" style={{ color: palette.fg }} className="flex-1">
        {message}
      </Text>
    </View>
  );
}
