import { LinearGradient } from 'expo-linear-gradient';
import { Clock, MapPin } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, statusTone } from '@/components/ui/Badge';
import { CoverImage, RestaurantLogo } from '@/components/ui/RestaurantCover';
import { Text } from '@/components/ui/Text';
import { useCountdown } from '@/hooks/useCountdown';
import { shadows } from '@/theme';
import type { Session } from '@/types/api';
import { formatDuration, formatTime } from '@/utils/time';

/** Large restaurant-of-the-day card with live countdown. */
export function SessionHero({
  session,
  serverTime,
  accepting,
  children,
}: {
  session: Session;
  serverTime?: string;
  accepting: boolean;
  children?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const restaurant = session.restaurant;
  const remaining = useCountdown(session.status === 'OPEN' ? session.closes_at : null, serverTime);
  const notStarted = session.status === 'OPEN' && new Date(session.opens_at).getTime() > Date.now();
  const urgent = remaining !== null && remaining <= 30 * 60 && remaining > 0;

  return (
    <View className="overflow-hidden rounded-3xl bg-surface" style={shadows.raised}>
      <CoverImage uri={restaurant.cover_image_url} seed={restaurant.name} hint={restaurant.cuisine ?? ''} height={170} radius={0}>
        <LinearGradient
          colors={['rgba(11,23,54,0)', 'rgba(11,23,54,0.78)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 }}
        />
        <View className="absolute left-4 top-4">
          <Badge label={t(`status.${session.status}`)} tone={statusTone(session.status)} dot />
        </View>
        <View className="absolute bottom-3 left-4 right-4 flex-row items-end gap-3">
          <RestaurantLogo uri={restaurant.logo_url} name={restaurant.name} size={56} />
          <View className="flex-1 pb-0.5">
            <Text variant="title" tone="white" numberOfLines={1}>
              {restaurant.name}
            </Text>
            <Text variant="small" tone="whiteMuted" numberOfLines={1}>
              {[restaurant.cuisine, restaurant.branch].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
      </CoverImage>
      <View className="gap-3 p-4">
        <View className="flex-row items-center gap-2.5">
          <View className={`h-10 w-10 items-center justify-center rounded-2xl ${urgent ? 'bg-warning-50' : 'bg-primary-50'}`}>
            <Clock size={19} color={urgent ? '#B45309' : '#185ADB'} />
          </View>
          <View className="flex-1">
            <Text variant="subheading">
              {notStarted
                ? t('home.opensAt', { time: formatTime(session.opens_at, i18n.language) })
                : t('home.orderBy', { time: formatTime(session.closes_at, i18n.language) })}
            </Text>
            {accepting && remaining !== null ? (
              <Text variant="small" tone={urgent ? 'warning' : 'muted'}>
                {t('home.timeLeft', { time: formatDuration(remaining) })}
              </Text>
            ) : null}
          </View>
        </View>
        {restaurant.address ? (
          <View className="flex-row items-center gap-2">
            <MapPin size={15} color="#78869B" />
            <Text variant="small" tone="muted" numberOfLines={1} className="flex-1">
              {restaurant.address}
            </Text>
          </View>
        ) : null}
        {session.notes ? (
          <Text variant="small" tone="soft" className="rounded-2xl bg-canvas px-3 py-2.5">
            {session.notes}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}
