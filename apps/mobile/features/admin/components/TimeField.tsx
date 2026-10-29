import { Minus, Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chip, ChipRow } from '@/components/ui/Controls';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme';
import { addMinutesHHMM, formatHHMM } from '@/utils/time';

const PRESETS = ['09:00', '10:00', '11:00', '11:30', '12:00', '12:30', '13:00'];

/** Cairo wall-clock time picker ("HH:MM") that works the same on iOS, Android and web. */
export function TimeField({
  label,
  value,
  onChange,
  presets = PRESETS,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets?: string[];
}) {
  const { i18n } = useTranslation();
  return (
    <View className="gap-2">
      <Text variant="label" tone="soft">
        {label}
      </Text>
      <View className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-1.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} −15`}
          onPress={() => onChange(addMinutesHHMM(value, -15))}
          className="h-11 w-11 items-center justify-center rounded-xl bg-canvas active:opacity-70"
        >
          <Minus size={18} color={colors.ink} />
        </Pressable>
        <Text variant="title" className="flex-1 text-center" accessibilityLiveRegion="polite">
          {formatHHMM(value, i18n.language)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} +15`}
          onPress={() => onChange(addMinutesHHMM(value, 15))}
          className="h-11 w-11 items-center justify-center rounded-xl bg-canvas active:opacity-70"
        >
          <Plus size={18} color={colors.ink} />
        </Pressable>
      </View>
      <ChipRow>
        {presets.map((preset) => (
          <Chip key={preset} label={formatHHMM(preset, i18n.language)} selected={preset === value} onPress={() => onChange(preset)} />
        ))}
      </ChipRow>
    </View>
  );
}
