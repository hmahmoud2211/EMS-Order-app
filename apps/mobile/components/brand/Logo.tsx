import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/ui/Text';

/**
 * Placeholder EMS Food mark: a plate with a cyan "serving" arc on a navy→blue tile.
 * Replace with the official EMS logo by swapping this component and the PNGs in
 * assets/images (see README → Branding).
 */
export function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="EMS Food logo">
      <Defs>
        <LinearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0B1736" />
          <Stop offset="1" stopColor="#185ADB" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="64" height="64" rx="18" fill="url(#tile)" />
      <Circle cx="32" cy="33" r="17" stroke="#FFFFFF" strokeWidth="3.5" fill="none" />
      <Circle cx="32" cy="33" r="10" fill="#FFFFFF" opacity="0.18" />
      <Path d="M17 26 A17 17 0 0 1 47 26" stroke="#18B7D8" strokeWidth="4" strokeLinecap="round" fill="none" />
      <Path d="M32 13 L32 8" stroke="#18B7D8" strokeWidth="3.5" strokeLinecap="round" />
    </Svg>
  );
}

export function Logo({ size = 44, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <LogoMark size={size} />
      <View>
        <Text variant="heading" tone={inverted ? 'white' : 'ink'} style={{ fontSize: size * 0.42, lineHeight: size * 0.5 }}>
          EMS <Text variant="heading" tone="cyan" style={{ fontSize: size * 0.42 }}>Food</Text>
        </Text>
        <Text variant="caption" tone={inverted ? 'whiteMuted' : 'muted'} style={{ fontSize: Math.max(10, size * 0.22) }}>
          Engineering Management Systems
        </Text>
      </View>
    </View>
  );
}
