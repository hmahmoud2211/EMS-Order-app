import * as Clipboard from 'expo-clipboard';
import { Copy, KeyRound } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { colors } from '@/theme';

/** Shows a one-time secret (temporary password / reset code) with a copy button. */
export function SecretCard({ title, message, secret }: { title: string; message: string; secret: string }) {
  const { t } = useTranslation();
  return (
    <Card className="gap-3 border-2 border-cyan bg-cyan-50" elevation="none">
      <View className="flex-row items-center gap-2">
        <KeyRound size={18} color={colors.navy} />
        <Text variant="heading" className="flex-1">
          {title}
        </Text>
      </View>
      <Text variant="small" tone="soft">
        {message}
      </Text>
      <Text variant="title" selectable className="rounded-2xl bg-surface px-4 py-3 text-center tracking-widest" testID="secret-value">
        {secret}
      </Text>
      <Button
        label={t('common.copy')}
        icon={Copy}
        variant="navy"
        onPress={async () => {
          await Clipboard.setStringAsync(secret);
          toast.success(t('common.copied'));
        }}
      />
    </Card>
  );
}
