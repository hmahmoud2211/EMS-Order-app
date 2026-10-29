import { AlertTriangle, CheckCircle2, Info } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { Text } from '@/components/ui/Text';
import { colors, shadows } from '@/theme';

type ToastTone = 'success' | 'error' | 'info';

interface ToastState {
  message: string | null;
  tone: ToastTone;
  id: number;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'success',
  id: 0,
  show: (message, tone = 'success') => set((s) => ({ message, tone, id: s.id + 1 })),
  hide: () => set({ message: null }),
}));

export const toast = {
  success: (message: string) => useToast.getState().show(message, 'success'),
  error: (message: string) => useToast.getState().show(message, 'error'),
  info: (message: string) => useToast.getState().show(message, 'info'),
};

export function ToastHost() {
  const { message, tone, id, hide } = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hide, tone === 'error' ? 4500 : 2600);
    return () => clearTimeout(timer);
  }, [message, id, tone, hide]);
  if (!message) return null;
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertTriangle : Info;
  const iconColor = tone === 'success' ? colors.success : tone === 'error' ? '#FCA5A5' : colors.cyan;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 10 }}>
      <Animated.View
        key={id}
        entering={FadeInUp.springify().damping(18)}
        exiting={FadeOutUp}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        className="mx-auto w-full max-w-[480px] flex-row items-center gap-3 rounded-2xl bg-navy px-4 py-3.5"
        style={shadows.floating}
      >
        <Icon size={20} color={iconColor} />
        <Text variant="small" tone="white" className="flex-1">
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}
