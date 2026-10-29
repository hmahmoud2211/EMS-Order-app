import { router, useLocalSearchParams } from 'expo-router';
import {
  Ban,
  CheckCheck,
  ClipboardList,
  Lock,
  LockOpen,
  PlayCircle,
  RefreshCw,
  Save,
  StopCircle,
} from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SectionTitle, SegmentedControl } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { CoverImage } from '@/components/ui/RestaurantCover';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useSessionAction, useSessionSummary, useUpdateSession } from '@/features/admin/api';
import { RestaurantPicker } from '@/features/admin/components/RestaurantPicker';
import { TimeField } from '@/features/admin/components/TimeField';
import type { FeeAllocation } from '@/types/api';
import { errorCode, errorMessage, toApiError } from '@/utils/errors';
import { formatPrice, isValidPriceInput } from '@/utils/money';
import { cairoDateTimeISO, cairoHHMM, formatBusinessDate, formatTime } from '@/utils/time';

type DialogKind = 'close' | 'finalize' | 'cancel' | 'restaurant' | 'feesOverride' | null;

export default function ManageSessionScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const summary = useSessionSummary(id);
  const action = useSessionAction(id);
  const update = useUpdateSession(id);
  const session = summary.data;

  const [deadlineEdit, setDeadline] = useState<string | null>(null);
  const [changingRestaurant, setChangingRestaurant] = useState(false);
  const [newRestaurant, setNewRestaurant] = useState<string | null>(null);
  const [deliveryEdit, setDelivery] = useState<string | null>(null);
  const [serviceEdit, setService] = useState<string | null>(null);
  const [feeNoteEdit, setFeeNote] = useState<string | null>(null);
  const [allocationEdit, setAllocation] = useState<FeeAllocation | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [ordersToCancel, setOrdersToCancel] = useState(0);
  const [dialogError, setDialogError] = useState<string | null>(null);

  if (summary.isLoading) {
    return (
      <Screen>
        <ScreenHeader back title={t('session.manageTitle')} />
        <SkeletonCard lines={6} />
      </Screen>
    );
  }
  if (summary.isError || !session) {
    return (
      <Screen>
        <ScreenHeader back title={t('session.manageTitle')} />
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      </Screen>
    );
  }

  // Edits override the server values until saved; saving resets them so fresh data shows.
  const deadline = deadlineEdit ?? cairoHHMM(session.closes_at);
  const delivery = deliveryEdit ?? session.delivery_fee.replace(/\.00$/, '');
  const service = serviceEdit ?? session.service_fee.replace(/\.00$/, '');
  const feeNote = feeNoteEdit ?? session.fee_note ?? '';
  const allocation = allocationEdit ?? session.fee_allocation;
  const finalized = session.status === 'FINALIZED';
  const cancelled = session.status === 'CANCELLED';
  const editable = !finalized && !cancelled;
  const deadlineIso = cairoDateTimeISO(session.session_date, deadline);
  const deadlineChanged = cairoHHMM(session.closes_at) !== deadline;

  const runAction = (kind: 'open' | 'close' | 'finalize' | 'cancel', reason?: string) =>
    action.mutate(
      { action: kind, reason, closes_at: kind === 'open' ? deadlineIso : undefined },
      {
        onSuccess: () => {
          setDialog(null);
          setDeadline(null);
          toast.success(t('session.saved'));
        },
        onError: (e) => (dialog ? setDialogError(errorMessage(e)) : toast.error(errorMessage(e))),
      },
    );

  const saveDeadline = () =>
    update.mutate({ closes_at: deadlineIso }, {
      onSuccess: () => {
        setDeadline(null);
        toast.success(t('session.saved'));
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  const saveRestaurant = (confirmCancel: boolean, reason?: string) => {
    if (!newRestaurant) return;
    update.mutate(
      {
        restaurant_id: newRestaurant,
        existing_orders_action: confirmCancel ? 'cancel' : undefined,
        reason: reason || undefined,
      },
      {
        onSuccess: () => {
          setDialog(null);
          setChangingRestaurant(false);
          toast.success(t('session.saved'));
        },
        onError: (e) => {
          if (errorCode(e) === 'SESSION_HAS_ORDERS') {
            const details = toApiError(e).details as { order_count?: number } | null;
            setOrdersToCancel(details?.order_count ?? 0);
            setDialogError(null);
            setDialog('restaurant');
          } else if (dialog) setDialogError(errorMessage(e));
          else toast.error(errorMessage(e));
        },
      },
    );
  };

  const feesValid = isValidPriceInput(delivery || '0') && isValidPriceInput(service || '0');
  const saveFees = (override = false, reason?: string) =>
    update.mutate(
      {
        delivery_fee: delivery || '0',
        service_fee: service || '0',
        fee_note: feeNote.trim() || null,
        fee_allocation: allocation,
        admin_override: override || undefined,
        reason,
      },
      {
        onSuccess: () => {
          setDialog(null);
          setDelivery(null);
          setService(null);
          setFeeNote(null);
          setAllocation(null);
          toast.success(t('session.saved'));
        },
        onError: (e) => (dialog ? setDialogError(errorMessage(e)) : toast.error(errorMessage(e))),
      },
    );

  return (
    <Screen refreshing={summary.isRefetching} onRefresh={() => summary.refetch()}>
      <ScreenHeader back title={t('session.manageTitle')} subtitle={formatBusinessDate(session.session_date, i18n.language)} />

      <Card padded={false} className="overflow-hidden">
        <CoverImage uri={session.restaurant.cover_image_url} seed={session.restaurant.name}
          hint={session.restaurant.cuisine ?? ''} height={110} radius={0} />
        <View className="gap-3 p-4">
          <View className="flex-row items-center justify-between gap-2">
            <Text variant="title" className="flex-1" numberOfLines={1}>
              {session.restaurant.name}
            </Text>
            <Badge label={t(`status.${session.status}`)} tone={statusTone(session.status)} dot />
          </View>
          <View className="flex-row flex-wrap gap-x-5 gap-y-1">
            <Text variant="small" tone="muted">
              {t('session.opensAt')}: {formatTime(session.opens_at, i18n.language)}
            </Text>
            <Text variant="small" tone="muted">
              {t('session.closesAt')}: {formatTime(session.closes_at, i18n.language)}
            </Text>
          </View>
          <View className="flex-row gap-2">
            {[
              [t('admin.ordered'), `${session.stats.ordered}/${session.stats.participants}`],
              [t('admin.totalItems'), String(session.stats.total_items)],
              [t('admin.totalValue'), formatPrice(session.stats.total_value)],
            ].map(([label, value]) => (
              <View key={label} className="flex-1 rounded-2xl bg-canvas p-3">
                <Text variant="heading">{value}</Text>
                <Text variant="caption" tone="muted">
                  {label}
                </Text>
              </View>
            ))}
          </View>
          {session.cancel_reason ? <Notice tone="warning" message={session.cancel_reason} /> : null}
        </View>
      </Card>

      <View className="mt-4 gap-3">
        <Button
          label={t('admin.consolidated')}
          icon={ClipboardList}
          variant="secondary"
          onPress={() => router.push({ pathname: '/consolidated/[sessionId]', params: { sessionId: session.id } })}
        />
      </View>

      {finalized ? (
        <View className="mt-4">
          <Notice icon={Lock} tone="primary" message={t('session.locked')} />
        </View>
      ) : null}

      {editable ? (
        <>
          <SectionTitle title={t('session.deadline')} />
          <Card className="gap-4">
            <TimeField label={t('session.closesAt')} value={deadline} onChange={setDeadline} />
            {session.status === 'CLOSED' ? (
              <Button label={t('session.reopen')} icon={LockOpen} variant="secondary" loading={action.isPending}
                onPress={() => runAction('open')} />
            ) : (
              <Button label={t('session.changeDeadline')} icon={Save} variant="secondary" disabled={!deadlineChanged}
                loading={update.isPending} onPress={saveDeadline} />
            )}
          </Card>

          <SectionTitle title={t('common.status')} />
          <View className="gap-3">
            {session.status === 'DRAFT' ? (
              <Button label={t('session.open')} icon={PlayCircle} loading={action.isPending} onPress={() => runAction('open')} />
            ) : null}
            {session.status === 'OPEN' ? (
              <Button label={t('session.close')} icon={StopCircle} variant="navy" onPress={() => { setDialogError(null); setDialog('close'); }}
                testID="close-session" />
            ) : null}
            {session.status === 'CLOSED' ? (
              <Button label={t('session.finalize')} icon={CheckCheck} variant="success"
                onPress={() => { setDialogError(null); setDialog('finalize'); }} testID="finalize-session" />
            ) : null}
            <Button label={t('session.cancel')} icon={Ban} variant="dangerOutline"
              onPress={() => { setDialogError(null); setDialog('cancel'); }} />
          </View>

          <SectionTitle title={t('session.changeRestaurant')} />
          {changingRestaurant ? (
            <Card className="gap-3">
              <RestaurantPicker value={newRestaurant} onChange={setNewRestaurant} />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button label={t('common.cancel')} variant="outline" onPress={() => setChangingRestaurant(false)} />
                </View>
                <View className="flex-1">
                  <Button label={t('common.save')} disabled={!newRestaurant || newRestaurant === session.restaurant_id}
                    loading={update.isPending && !dialog} onPress={() => saveRestaurant(false)} />
                </View>
              </View>
            </Card>
          ) : (
            <Button label={t('session.changeRestaurant')} icon={RefreshCw} variant="outline"
              onPress={() => setChangingRestaurant(true)} />
          )}
        </>
      ) : null}

      {!cancelled ? (
        <>
          <SectionTitle title={t('session.fees')} />
          <Card className="gap-4">
            <Notice message={t('session.feesHint')} tone="neutral" />
            <View className="flex-row gap-3">
              <Input containerClassName="flex-1" label={t('session.deliveryFee')} keyboardType="decimal-pad" value={delivery}
                onChangeText={setDelivery} error={isValidPriceInput(delivery || '0') ? undefined : t('itemEditor.invalidPrice')} />
              <Input containerClassName="flex-1" label={t('session.serviceFee')} keyboardType="decimal-pad" value={service}
                onChangeText={setService} error={isValidPriceInput(service || '0') ? undefined : t('itemEditor.invalidPrice')} />
            </View>
            <Input label={t('session.feeNote')} value={feeNote} onChangeText={setFeeNote} maxLength={255} />
            <Text variant="label" tone="soft">
              {t('session.feeAllocation')}
            </Text>
            <SegmentedControl<FeeAllocation>
              value={allocation}
              onChange={setAllocation}
              options={(['NONE', 'EQUAL', 'PROPORTIONAL'] as const).map((value) => ({
                value,
                label: t(`session.allocation_${value}`),
              }))}
            />
            <Button
              label={t('common.save')}
              icon={Save}
              disabled={!feesValid}
              loading={update.isPending && !dialog}
              onPress={() => (finalized ? (setDialogError(null), setDialog('feesOverride')) : saveFees())}
            />
          </Card>
        </>
      ) : null}

      <ConfirmDialog
        visible={dialog === 'close'}
        title={t('session.close')}
        message={t('session.closeConfirm')}
        confirmLabel={t('session.close')}
        loading={action.isPending}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={() => runAction('close')}
      />
      <ConfirmDialog
        visible={dialog === 'finalize'}
        title={t('session.finalize')}
        message={t('session.finalizeConfirm')}
        confirmLabel={t('session.finalize')}
        loading={action.isPending}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={() => runAction('finalize')}
      />
      <ConfirmDialog
        visible={dialog === 'cancel'}
        title={t('session.cancel')}
        message={t('session.cancelConfirm')}
        confirmLabel={t('session.cancel')}
        destructive
        requireReason
        loading={action.isPending}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => runAction('cancel', reason)}
      />
      <ConfirmDialog
        visible={dialog === 'restaurant'}
        title={t('session.changeRestaurant')}
        message={t('session.changeRestaurantConfirm', { count: ordersToCancel })}
        confirmLabel={t('session.changeRestaurant')}
        destructive
        requireReason
        loading={update.isPending}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => saveRestaurant(true, reason)}
      />
      <ConfirmDialog
        visible={dialog === 'feesOverride'}
        title={t('session.fees')}
        message={t('orders.overrideFinalized')}
        requireReason
        loading={update.isPending}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => saveFees(true, reason)}
      />
    </Screen>
  );
}
