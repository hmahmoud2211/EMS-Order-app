import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { useNotifications } from '@/features/notifications/api';
import { colors, shadows } from '@/theme';

export function NotificationBell() {
  const { t } = useTranslation();
  const { data } = useNotifications();
  const unread = data?.unread ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('notifications.title')}${unread ? `, ${unread}` : ''}`}
      onPress={() => router.push('/notifications')}
      className="h-11 w-11 items-center justify-center rounded-full bg-surface active:opacity-70"
      style={shadows.card}
      hitSlop={6}
    >
      <Bell size={20} color={colors.ink} />
      {unread > 0 ? (
        <View className="absolute right-1.5 top-1.5 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1">
          <Text variant="caption" tone="white" className="text-[10px]">
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
