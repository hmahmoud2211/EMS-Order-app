import { Building2, Mail, Phone, UserRound } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/Controls';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { AccountSections } from '@/features/profile/ProfileSections';
import { useAuthStore } from '@/stores/auth';
import { colors } from '@/theme';

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string | null }) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <Icon size={18} color={colors.muted} />
      <Text variant="small" tone="muted" className="w-28">
        {label}
      </Text>
      <Text variant="subheading" className="flex-1" numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return (
    <Screen>
      <ScreenHeader title={t('profile.title')} />
      <Card className="items-center gap-2 py-6">
        <Avatar name={user.full_name} size={76} />
        <Text variant="title" className="mt-2 text-center">
          {user.full_name}
        </Text>
        <Text variant="small" tone="muted">
          {user.department ?? t('common.company')}
        </Text>
      </Card>
      <Card className="mt-4 px-4 py-1.5">
        <InfoRow icon={UserRound} label={t('profile.username')} value={user.username} />
        <Divider />
        <InfoRow icon={Building2} label={t('profile.department')} value={user.department} />
        <Divider />
        <InfoRow icon={Mail} label={t('profile.email')} value={user.email} />
        <Divider />
        <InfoRow icon={Phone} label={t('profile.phone')} value={user.phone} />
      </Card>
      <AccountSections />
    </Screen>
  );
}
