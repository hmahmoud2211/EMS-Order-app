import { Platform } from 'react-native';

import { colors, fonts } from '@/theme';

export const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.muted,
  tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, marginBottom: Platform.OS === 'web' ? 4 : 0 },
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    height: Platform.OS === 'ios' ? 88 : 66,
    paddingTop: 8,
  },
  sceneStyle: { backgroundColor: colors.canvas },
} as const;
