import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';

/** Pulsing indicator that the dashboard is updating live. */
export function LiveDot({ label }: { label: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, false);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 1 - pulse.value, transform: [{ scale: 1 + pulse.value * 1.6 }] }));
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
      <View className="h-2 w-2 items-center justify-center">
        <Animated.View className="absolute h-2 w-2 rounded-full bg-success" style={ring} />
        <View className="h-2 w-2 rounded-full bg-success" />
      </View>
      <Text variant="caption" tone="white">
        {label}
      </Text>
    </View>
  );
}
