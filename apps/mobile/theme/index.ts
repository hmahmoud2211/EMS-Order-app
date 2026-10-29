import { Platform, type ViewStyle } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const palette = require('./colors') as typeof import('./colors');

export const colors = {
  navy: palette.navy.DEFAULT,
  navy700: palette.navy[700],
  primary: palette.primary.DEFAULT,
  primary50: palette.primary[50],
  primary100: palette.primary[100],
  primary700: palette.primary[700],
  cyan: palette.cyan.DEFAULT,
  cyan50: palette.cyan[50],
  canvas: palette.canvas,
  surface: palette.surface,
  ink: palette.ink.DEFAULT,
  inkSoft: palette.ink.soft,
  muted: palette.muted.DEFAULT,
  mutedLight: palette.muted.light,
  line: palette.line.DEFAULT,
  lineStrong: palette.line.strong,
  success: palette.success.DEFAULT,
  success50: palette.success[50],
  warning: palette.warning.DEFAULT,
  warning50: palette.warning[50],
  warning700: palette.warning[700],
  danger: palette.danger.DEFAULT,
  danger50: palette.danger[50],
  white: '#FFFFFF',
} as const;

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'cyan' | 'navy';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: colors.primary, bg: colors.primary50 },
  success: { fg: colors.success, bg: colors.success50 },
  warning: { fg: colors.warning700, bg: colors.warning50 },
  danger: { fg: colors.danger, bg: colors.danger50 },
  neutral: { fg: colors.inkSoft, bg: '#EEF1F6' },
  cyan: { fg: '#0E7C93', bg: colors.cyan50 },
  navy: { fg: colors.white, bg: colors.navy },
};

export const shadows: Record<'card' | 'raised' | 'floating', ViewStyle> = {
  card: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B1736', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 2 },
    default: { boxShadow: '0 4px 16px rgba(11, 23, 54, 0.06)' } as ViewStyle,
  })!,
  raised: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B1736', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 5 },
    default: { boxShadow: '0 8px 24px rgba(11, 23, 54, 0.10)' } as ViewStyle,
  })!,
  floating: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B1736', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
    android: { elevation: 10 },
    default: { boxShadow: '0 10px 30px rgba(11, 23, 54, 0.18)' } as ViewStyle,
  })!,
};

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
