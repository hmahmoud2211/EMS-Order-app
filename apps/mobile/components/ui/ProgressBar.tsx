import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';

import { colors } from '@/theme';

export function ProgressBar({
  value,
  color = colors.cyan,
  track = 'rgba(255,255,255,0.18)',
  height = 10,
  accessibilityLabel,
}: {
  value: number;
  color?: string;
  track?: string;
  height?: number;
  accessibilityLabel?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value || 0));
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(clamped, { duration: 650, easing: Easing.out(Easing.cubic) });
  }, [clamped, progress]);
  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ height, backgroundColor: track, borderRadius: height }}
      className="w-full overflow-hidden"
    >
      <Animated.View style={[{ height, backgroundColor: color, borderRadius: height }, style]} />
    </View>
  );
}
