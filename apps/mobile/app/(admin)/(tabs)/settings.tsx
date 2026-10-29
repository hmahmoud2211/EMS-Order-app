import { router } from 'expo-router';
import { BarChart3, ChevronRight, Database, History, ScanText, Save } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider, QuantityStepper, SectionTitle, SegmentedControl, SwitchRow } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useAppSettings, useOcrStatus, useProviders, useUpdateAppSettings } from '@/features/admin/api';
import { TimeField } from '@/features/admin/components/TimeField';
import { AccountSections } from '@/features/profile/ProfileSections';
import { useAuthStore } from '@/stores/auth';
import { colors } from '@/theme';
import type { AppSettings, FeeAllocation } from '@/types/api';
import { errorMessage } from '@/utils/errors';

function LinkRow({ icon: Icon, label, onPress }: { icon: typeof History; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="flex-row items-center gap-3 py-3 active:opacity-70">
      <Icon size={19} color={colors.primary} />
      <Text variant="subheading" className="flex-1">
        {label}
      </Text>
      <ChevronRight size={18} color={colors.mutedLight} />
    </Pressable>
  );
}

function CompanySettingsForm({ initial }: { initial: AppSettings }) {
  const { t } = useTranslation();
  const update = useUpdateAppSettings();
  const [form, setForm] = useState<AppSettings>(initial);
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setForm((f) => ({ ...f, [key]: value }));
  return (
      <Card className="gap-5">
        <Input label={t('settings.companyName')} value={form.company_name} onChangeText={(v) => set('company_name', v)} />
        <SwitchRow label={t('settings.allowCancel')} hint={t('settings.allowCancelHint')} value={form.allow_employee_cancellation}
          onChange={(v) => set('allow_employee_cancellation', v)} />
        <TimeField label={t('settings.defaultOpens')} value={form.default_opens_at} onChange={(v) => set('default_opens_at', v)} />
        <TimeField label={t('settings.defaultCloses')} value={form.default_closes_at} onChange={(v) => set('default_closes_at', v)} />
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text variant="subheading">{t('settings.reminder')}</Text>
            <Text variant="small" tone="muted">
              {t('settings.reminderMinutes', { count: form.reminder_minutes_before_deadline })}
            </Text>
          </View>
          <QuantityStepper value={form.reminder_minutes_before_deadline} min={5} max={180}
            onChange={(v) => set('reminder_minutes_before_deadline', v)} />
        </View>
        <View className="gap-2">
          <Text variant="label" tone="soft">
            {t('settings.defaultFees')}
          </Text>
          <SegmentedControl<FeeAllocation>
            value={form.default_fee_allocation}
            onChange={(v) => set('default_fee_allocation', v)}
            options={(['NONE', 'EQUAL', 'PROPORTIONAL'] as const).map((value) => ({
              value,
              label: t(`session.allocation_${value}`),
            }))}
          />
        </View>
        <Button
          label={t('common.save')}
          icon={Save}
          loading={update.isPending}
          onPress={() =>
            update.mutate(
              {
                company_name: form.company_name.trim() || initial.company_name,
                allow_employee_cancellation: form.allow_employee_cancellation,
                default_opens_at: form.default_opens_at,
                default_closes_at: form.default_closes_at,
                reminder_minutes_before_deadline: form.reminder_minutes_before_deadline,
                default_fee_allocation: form.default_fee_allocation,
              },
              { onSuccess: () => toast.success(t('settings.saved')), onError: (e) => toast.error(errorMessage(e)) },
            )
          }
        />
      </Card>
  );
}

export default function AdminSettings() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const settings = useAppSettings();
  const providers = useProviders();
  const ocr = useOcrStatus();

  return (
    <Screen refreshing={settings.isRefetching} onRefresh={() => settings.refetch()}>
      <ScreenHeader title={t('settings.title')} subtitle={user?.full_name} />

      <Card className="gap-1 py-1">
        <LinkRow icon={History} label={t('admin.history')} onPress={() => router.push('/session-history')} />
        <Divider />
        <LinkRow icon={BarChart3} label={t('admin.analytics')} onPress={() => router.push('/analytics')} />
      </Card>

      <SectionTitle title={t('settings.ordering')} />
      {settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      ) : !settings.data ? (
        <SkeletonCard lines={5} />
      ) : (
        <CompanySettingsForm initial={settings.data} />
      )}

      <SectionTitle title={t('settings.dataSources')} />
      <Card className="gap-3">
        {(providers.data ?? []).map((provider, index) => (
          <View key={provider.key} className="gap-1">
            {index > 0 ? <Divider className="mb-2" /> : null}
            <View className="flex-row items-center gap-2">
              <Database size={17} color={colors.muted} />
              <Text variant="subheading" className="flex-1">
                {provider.name}
              </Text>
              <Badge label={provider.enabled ? t('common.available') : t('common.unavailable')}
                tone={provider.enabled ? 'success' : 'neutral'} size="sm" />
            </View>
            <Text variant="small" tone="muted">
              {provider.message}
            </Text>
          </View>
        ))}
      </Card>

      <SectionTitle title={t('settings.ocr')} />
      <Card className="gap-1.5">
        <View className="flex-row items-center gap-2">
          <ScanText size={17} color={colors.muted} />
          <Text variant="subheading" className="flex-1">
            Tesseract {ocr.data?.version ?? ''}
          </Text>
          <Badge label={ocr.data?.available ? t('common.available') : t('common.unavailable')}
            tone={ocr.data?.available ? 'success' : 'warning'} size="sm" />
        </View>
        {ocr.data?.languages.length ? (
          <Text variant="small" tone="muted">
            {t('settings.ocrLanguages', { langs: ocr.data.languages.join(', ') })}
          </Text>
        ) : null}
        <Text variant="small" tone="muted">
          {ocr.data?.message}
        </Text>
      </Card>

      <AccountSections showOrderPrefs={!!user?.participates_in_orders} />
    </Screen>
  );
}
