import { ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { I18nManager, Platform, RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui/Button';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: React.ReactNode;
  contentClassName?: string;
  scrollProps?: ScrollViewProps;
  background?: string;
  /** Constrain content width on tablets / desktop web. */
  maxWidth?: number;
}

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  refreshing = false,
  onRefresh,
  footer,
  contentClassName = '',
  scrollProps,
  background = colors.canvas,
  maxWidth = 760,
}: ScreenProps) {
  const inner = (
    <View className={`w-full self-center ${contentClassName}`} style={{ maxWidth }}>
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: background }}>
      <OfflineBanner />
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: footer ? 24 : 40, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            ) : undefined
          }
          {...scrollProps}
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 16 }}>{inner}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  back = false,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="mb-4 mt-2 flex-row items-center gap-2">
      {back ? (
        <IconButton
          icon={ChevronLeft}
          label={t('common.back')}
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          className="-ml-2 bg-surface"
          size={40}
        />
      ) : null}
      <View className="flex-1">
        <Text variant="title" accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Flip directional icons (chevrons, arrows) in right-to-left layouts. */
export const rtlFlip = Platform.OS !== 'web' && I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;
