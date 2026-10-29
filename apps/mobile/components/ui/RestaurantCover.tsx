import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Coffee, Drumstick, Fish, Flame, Leaf, Pizza, Salad, Sandwich, Soup, UtensilsCrossed } from 'lucide-react-native';
import { View, type ViewStyle } from 'react-native';

import { mediaUrl } from '@/services/config';
import { colors } from '@/theme';

const GRADIENTS: [string, string][] = [
  ['#0B1736', '#185ADB'],
  ['#185ADB', '#18B7D8'],
  ['#14244D', '#18B7D8'],
  ['#0F3A8F', '#16A34A'],
];

type IconKind = 'pizza' | 'sandwich' | 'grill' | 'salad' | 'chicken' | 'fish' | 'soup' | 'drink' | 'leaf' | 'default';

function iconKind(text: string): IconKind {
  const t = text.toLowerCase();
  if (/(pizza|ital|pasta)/.test(t)) return 'pizza';
  if (/(burger|sandwich|wrap|shawarma)/.test(t)) return 'sandwich';
  if (/(grill|kofta|bbq|kebab)/.test(t)) return 'grill';
  if (/(salad|healthy|bowl|vegan)/.test(t)) return 'salad';
  if (/(chicken)/.test(t)) return 'chicken';
  if (/(fish|sea|sushi)/.test(t)) return 'fish';
  if (/(soup|koshary|egypt)/.test(t)) return 'soup';
  if (/(coffee|cafe|juice|drink)/.test(t)) return 'drink';
  if (/(green|leaf)/.test(t)) return 'leaf';
  return 'default';
}

/** Food illustration for the gradient placeholder, chosen from the cuisine/name. */
function CuisineIcon({ kind, size }: { kind: IconKind; size: number }) {
  const props = { size, color: 'rgba(255,255,255,0.85)', strokeWidth: 1.6 };
  switch (kind) {
    case 'pizza':
      return <Pizza {...props} />;
    case 'sandwich':
      return <Sandwich {...props} />;
    case 'grill':
      return <Flame {...props} />;
    case 'salad':
      return <Salad {...props} />;
    case 'chicken':
      return <Drumstick {...props} />;
    case 'fish':
      return <Fish {...props} />;
    case 'soup':
      return <Soup {...props} />;
    case 'drink':
      return <Coffee {...props} />;
    case 'leaf':
      return <Leaf {...props} />;
    default:
      return <UtensilsCrossed {...props} />;
  }
}

function gradientFor(seed: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 17 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

/** Restaurant or food image with a branded gradient fallback (no stock photos needed). */
export function CoverImage({
  uri,
  seed,
  hint = '',
  height = 160,
  radius = 24,
  iconSize = 44,
  style,
  children,
}: {
  uri: string | null | undefined;
  seed: string;
  hint?: string;
  height?: number;
  radius?: number;
  iconSize?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const source = mediaUrl(uri);
  return (
    <View style={[{ height, borderRadius: radius, overflow: 'hidden' }, style]}>
      {source ? (
        <Image
          source={{ uri: source }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={250}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <LinearGradient
          colors={gradientFor(seed)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <CuisineIcon kind={iconKind(`${hint} ${seed}`)} size={iconSize} />
        </LinearGradient>
      )}
      {children}
    </View>
  );
}

export function RestaurantLogo({ uri, name, size = 52 }: { uri?: string | null; name: string; size?: number }) {
  const source = mediaUrl(uri);
  return (
    <View
      style={{ width: size, height: size, borderRadius: size * 0.3, borderWidth: 3, borderColor: colors.white }}
      className="overflow-hidden bg-surface"
    >
      {source ? (
        <Image source={{ uri: source }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <CoverImage uri={null} seed={name} hint={name} height={size - 6} radius={0} iconSize={size * 0.45} />
      )}
    </View>
  );
}
