import { useNetInfo } from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { colors } from '@/theme';

export function OfflineBanner() {
  const { t } = useTranslation();
  const { isConnected } = useNetInfo();
  if (isConnected !== false) return null;
  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp} accessibilityLiveRegion="polite">
      <View className="mx-4 mb-2 flex-row items-center gap-2 rounded-2xl bg-navy px-3.5 py-2.5">
        <WifiOff size={16} color={colors.white} />
        <Text variant="small" tone="white" className="flex-1">
          {t('common.offline')}
        </Text>
      </View>
    </Animated.View>
  );
}
