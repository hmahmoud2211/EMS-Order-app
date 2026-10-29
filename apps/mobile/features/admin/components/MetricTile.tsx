import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { shadows, toneColors, type Tone } from '@/theme';

export function MetricTile({
  icon: Icon,
  label,
  value,
  tone = 'primary',
  testID,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: Tone;
  testID?: string;
}) {
  const { fg, bg } = toneColors[tone];
  return (
    <View
      className="min-w-[46%] flex-1 gap-3 rounded-3xl bg-surface p-4"
      style={shadows.card}
      accessible
      accessibilityLabel={`${label}: ${value}`}
      testID={testID}
    >
      <View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: bg }}>
        <Icon size={20} color={fg} />
      </View>
      <View>
        <Text variant="title">{value}</Text>
        <Text variant="small" tone="muted">
          {label}
        </Text>
      </View>
    </View>
  );
}
