import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { toneColors, type Tone } from '@/theme';

export function Badge({
  label,
  tone = 'neutral',
  icon: Icon,
  size = 'md',
  dot = false,
}: {
  label: string;
  tone?: Tone;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
  dot?: boolean;
}) {
  const { fg, bg } = toneColors[tone];
  return (
    <View
      className={`flex-row items-center self-start rounded-full ${size === 'sm' ? 'px-2 py-0.5 gap-1' : 'px-2.5 py-1 gap-1.5'}`}
      style={{ backgroundColor: bg }}
    >
      {dot ? <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: fg }} /> : null}
      {Icon ? <Icon size={size === 'sm' ? 11 : 13} color={fg} strokeWidth={2.4} /> : null}
      <Text variant="caption" style={{ color: fg }} className={size === 'sm' ? 'text-[11px]' : ''}>
        {label}
      </Text>
    </View>
  );
}

const statusTones: Record<string, Tone> = {
  DRAFT: 'neutral',
  OPEN: 'success',
  CLOSED: 'warning',
  FINALIZED: 'primary',
  CANCELLED: 'danger',
  SUBMITTED: 'success',
  ORDERED: 'success',
  NOT_ORDERED: 'warning',
  PROCESSING: 'cyan',
  NEEDS_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'neutral',
  FAILED: 'danger',
  VALID: 'success',
  INVALID: 'danger',
};

export function statusTone(status: string): Tone {
  return statusTones[status] ?? 'neutral';
}
