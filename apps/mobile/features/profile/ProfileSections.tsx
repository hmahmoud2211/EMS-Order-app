import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Bell, Globe, KeyRound, LogOut } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Divider, SectionTitle, SegmentedControl, SwitchRow } from '@/components/ui/Controls';
import { Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { logout } from '@/features/auth/api';
import { useNotificationPrefs, useUpdateNotificationPrefs } from '@/features/notifications/api';
import { applyLanguage, type Language } from '@/i18n';
import { getPushStatus, registerForPush, type PushStatus } from '@/services/push';
import { useAuthStore } from '@/stores/auth';
import type { NotificationPrefs } from '@/types/api';
import { errorMessage } from '@/utils/errors';

/** Notification preferences, language, password and sign-out — shared by employee and admin profiles. */
export function AccountSections({ showOrderPrefs = true }: { showOrderPrefs?: boolean }) {
  const { t, i18n } = useTranslation();
  const prefs = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const user = useAuthStore((s) => s.user);
  const [push, setPush] = useState<PushStatus>('undetermined');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [restartHint, setRestartHint] = useState(false);

  useEffect(() => {
    getPushStatus().then(setPush);
  }, []);

  const toggle = (key: keyof NotificationPrefs, value: boolean) =>
    update.mutate({ [key]: value }, { onError: (e) => toast.error(errorMessage(e)) });

  const changeLanguage = (language: Language) => {
    const needsRestart = applyLanguage(language);
    setRestartHint(needsRestart);
    update.mutate({ preferred_language: language });
    if (user) useAuthStore.getState().setUser({ ...user, preferred_language: language });
  };

  return (
    <View>
      <SectionTitle title={t('profile.notifications')} />
      <Card className="gap-1">
        {Platform.OS !== 'web' ? (
          <>
            <View className="flex-row items-center gap-3 py-2">
              <Bell size={18} color="#78869B" />
              <View className="flex-1">
                <Text variant="subheading">{t('profile.pushStatus')}</Text>
                <Text variant="small" tone={push === 'granted' ? 'success' : 'muted'}>
                  {push === 'granted' ? t('profile.pushOn') : t('profile.pushOff')}
                </Text>
              </View>
              {push !== 'granted' && push !== 'unsupported' ? (
                <Button
                  label={t('profile.enablePush')}
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  onPress={async () => {
                    await registerForPush(true);
                    setPush(await getPushStatus());
                  }}
                />
              ) : null}
            </View>
            <Divider />
          </>
        ) : null}
        <SwitchRow
          label={t('profile.sessionUpdates')}
          hint={t('profile.sessionUpdatesHint')}
          value={prefs.data?.session_updates ?? true}
          onChange={(v) => toggle('session_updates', v)}
        />
        {showOrderPrefs ? (
          <>
            <SwitchRow
              label={t('profile.deadlineReminders')}
              hint={t('profile.deadlineRemindersHint')}
              value={prefs.data?.deadline_reminders ?? true}
              onChange={(v) => toggle('deadline_reminders', v)}
            />
            <SwitchRow
              label={t('profile.orderUpdates')}
              hint={t('profile.orderUpdatesHint')}
              value={prefs.data?.order_updates ?? true}
              onChange={(v) => toggle('order_updates', v)}
            />
          </>
        ) : null}
      </Card>

      <SectionTitle title={t('profile.language')} />
      <Card className="gap-3">
        <View className="flex-row items-center gap-3">
          <Globe size={18} color="#78869B" />
          <View className="flex-1">
            <SegmentedControl<Language>
              value={(i18n.language as Language) ?? 'en'}
              onChange={changeLanguage}
              options={[
                { value: 'en', label: 'English' },
                { value: 'ar', label: 'العربية' },
              ]}
            />
          </View>
        </View>
        {restartHint ? <Notice message={t('profile.restartForLanguage')} tone="warning" /> : null}
      </Card>

      <SectionTitle title={t('profile.account')} />
      <View className="gap-3">
        <Button label={t('auth.changePassword')} icon={KeyRound} variant="outline" onPress={() => router.push('/change-password')} />
        <Button label={t('auth.signOut')} icon={LogOut} variant="dangerOutline" onPress={() => setConfirmLogout(true)} />
      </View>
      <Text variant="caption" tone="muted" className="mt-6 text-center">
        EMS Food · {t('profile.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
      </Text>

      <ConfirmDialog
        visible={confirmLogout}
        title={t('auth.signOut')}
        message={t('auth.signOutConfirm')}
        confirmLabel={t('auth.signOut')}
        destructive
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
      />
    </View>
  );
}
