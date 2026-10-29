import { router } from 'expo-router';
import { PlayCircle, Save } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionTitle, SegmentedControl, SwitchRow } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { InlineError } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { useAppSettings, useCreateSession } from '@/features/admin/api';
import { RestaurantPicker } from '@/features/admin/components/RestaurantPicker';
import { TimeField } from '@/features/admin/components/TimeField';
import { errorMessage } from '@/utils/errors';
import { cairoDateTimeISO, cairoToday } from '@/utils/time';

export default function NewSessionScreen() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const create = useCreateSession();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [opensAtEdit, setOpensAt] = useState<string | null>(null);
  const [closesAtEdit, setClosesAt] = useState<string | null>(null);
  const opensAt = opensAtEdit ?? settings.data?.default_opens_at ?? '09:00';
  const closesAt = closesAtEdit ?? settings.data?.default_closes_at ?? '12:00';
  const [openNow, setOpenNow] = useState(true);
  const [notes, setNotes] = useState('');

  const sessionDate = cairoToday(day === 'today' ? 0 : 1);
  const immediate = openNow && day === 'today';

  const submit = () => {
    if (!restaurantId) return;
    create.mutate(
      {
        restaurant_id: restaurantId,
        session_date: sessionDate,
        opens_at: immediate ? undefined : cairoDateTimeISO(sessionDate, opensAt),
        closes_at: cairoDateTimeISO(sessionDate, closesAt),
        notes: notes.trim() || null,
        open_now: immediate,
      },
      {
        onSuccess: (session) => {
          toast.success(t('session.created'));
          router.replace({ pathname: '/session/[id]', params: { id: session.id } });
        },
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader back title={t('session.newTitle')} />
      <SectionTitle title={t('session.restaurant')} />
      <RestaurantPicker value={restaurantId} onChange={setRestaurantId} />

      <SectionTitle title={t('session.date')} />
      <SegmentedControl
        value={day}
        onChange={setDay}
        options={[
          { value: 'today', label: t('common.today') },
          { value: 'tomorrow', label: t('common.tomorrow') },
        ]}
      />

      <Card className="mt-4 gap-5">
        {day === 'today' ? (
          <SwitchRow label={t('session.openNow')} hint={t('session.openNowHint')} value={openNow} onChange={setOpenNow} />
        ) : null}
        {!immediate ? <TimeField label={t('session.opensAt')} value={opensAt} onChange={setOpensAt} /> : null}
        <TimeField label={t('session.closesAt')} value={closesAt} onChange={setClosesAt} />
        <Input label={t('session.notes')} placeholder={t('session.notesPlaceholder')} value={notes} onChangeText={setNotes}
          multiline maxLength={500} />
      </Card>

      <View className="mt-5 gap-3">
        <InlineError message={create.isError ? errorMessage(create.error) : null} />
        <Button
          size="lg"
          label={immediate ? t('session.createAndOpen') : t('session.create')}
          icon={immediate ? PlayCircle : Save}
          disabled={!restaurantId}
          loading={create.isPending}
          onPress={submit}
          testID="create-session"
        />
      </View>
    </Screen>
  );
}
