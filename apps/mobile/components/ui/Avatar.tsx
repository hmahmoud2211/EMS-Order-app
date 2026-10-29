import { View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { initials } from '@/utils/id';

const PALETTE = ['#185ADB', '#18B7D8', '#0B1736', '#16A34A', '#7C3AED', '#DB2777', '#EA580C', '#0E7490'];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({ name, size = 44, muted = false }: { name: string; size?: number; muted?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: muted ? '#C9D1DE' : colorFor(name),
      }}
      className="items-center justify-center"
    >
      <Text tone="white" variant={size >= 56 ? 'heading' : 'label'} style={{ fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}
