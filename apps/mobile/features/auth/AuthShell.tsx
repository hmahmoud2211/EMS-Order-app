import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/brand/Logo';
import { Text } from '@/components/ui/Text';
import { colors, shadows } from '@/theme';

/** Branded hero + floating form card shared by the sign-in and password screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.canvas }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <LinearGradient
          colors={[colors.navy, '#123C9C', colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + 36, paddingBottom: 96, paddingHorizontal: 24 }}
        >
          <View className="w-full max-w-[460px] self-center">
            <Animated.View entering={FadeInUp.duration(500)}>
              <Logo size={52} inverted />
            </Animated.View>
            <Animated.View entering={FadeInUp.delay(120).duration(500)} className="mt-10">
              <Text variant="display" tone="white" accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? (
                <Text variant="body" tone="whiteMuted" className="mt-2">
                  {subtitle}
                </Text>
              ) : null}
            </Animated.View>
          </View>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', right: -60, top: insets.top + 10, width: 220, height: 220, borderRadius: 110,
              backgroundColor: 'rgba(24,183,216,0.18)' }}
          />
        </LinearGradient>
        <Animated.View
          entering={FadeInDown.delay(150).duration(500)}
          className="-mt-16 w-full max-w-[460px] self-center px-4"
        >
          <View className="gap-4 rounded-3xl bg-surface p-5" style={shadows.raised}>
            {children}
          </View>
          {footer ? <View className="mt-5 items-center px-4 pb-10">{footer}</View> : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
