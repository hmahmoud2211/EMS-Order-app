import { useLocalSearchParams } from 'expo-router';
import { History, Pencil, Save, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SectionTitle } from '@/components/ui/Controls';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useAdminCancelOrder, useAdminOrder, useAdminUpdateOrder, useOrderRevisions } from '@/features/admin/api';
import { linesFromOrder, OrderEditor, toLineInputs, type EditorLine } from '@/features/admin/components/OrderEditor';
import { OrderLines } from '@/features/ordering/components/OrderLines';
import { errorMessage } from '@/utils/errors';
import { formatBusinessDate, formatDateTime } from '@/utils/time';

export default function AdminOrderDetail() {
  const { t, i18n } = useTranslation();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = useAdminOrder(orderId);
  const revisions = useOrderRevisions(orderId);
  const update = useAdminUpdateOrder(orderId);
  const cancel = useAdminCancelOrder(orderId);
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [dialog, setDialog] = useState<'save' | 'cancel' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const data = order.data;
  const finalized = data?.session.status === 'FINALIZED';

  return (
    <Screen refreshing={order.isRefetching} onRefresh={() => Promise.all([order.refetch(), revisions.refetch()])}>
      <ScreenHeader back title={t('orders.orderDetail')} subtitle={data?.reference} />
      {order.isLoading ? (
        <SkeletonCard lines={6} />
      ) : order.isError || !data ? (
        <ErrorState error={order.error} onRetry={() => order.refetch()} />
      ) : (
        <View className="gap-4">
          <Card className="gap-4">
            <View className="flex-row items-center gap-3">
              <Avatar name={data.employee.full_name} size={48} />
              <View className="flex-1">
                <Text variant="heading">{data.employee.full_name}</Text>
                <Text variant="small" tone="muted">
                  {data.employee.department ?? '—'}
                </Text>
              </View>
              <Badge label={t(`status.${data.status}`)} tone={statusTone(data.status)} dot />
            </View>
            <View className="gap-0.5">
              <Text variant="small" tone="muted">
                {data.session.restaurant.name} · {formatBusinessDate(data.session.session_date, i18n.language, 'short')}
              </Text>
              <Text variant="small" tone="muted">
                {t('orders.submittedAt', { time: formatDateTime(data.submitted_at, i18n.language) })}
                {data.revision > 1 ? ` · ${t('order.revision', { n: data.revision })}` : ''}
              </Text>
            </View>
            {!editing ? <OrderLines items={data.items} total={data.total_amount} /> : null}
          </Card>

          {data.status === 'CANCELLED' && data.cancel_reason ? (
            <Notice tone="warning" message={t('order.cancelledBecause', { reason: data.cancel_reason })} />
          ) : null}

          {data.status === 'SUBMITTED' ? (
            editing ? (
              <View className="gap-3">
                {finalized ? <Notice tone="warning" message={t('orders.overrideFinalized')} /> : null}
                <OrderEditor restaurantId={data.session.restaurant.id} lines={lines} onChange={setLines} />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Button label={t('common.cancel')} icon={X} variant="outline" onPress={() => setEditing(false)} />
                  </View>
                  <View className="flex-1">
                    <Button label={t('orders.saveChanges')} icon={Save} disabled={!lines.length}
                      onPress={() => { setDialogError(null); setDialog('save'); }} />
                  </View>
                </View>
              </View>
            ) : (
              <View className="gap-3">
                <Button label={t('orders.modify')} icon={Pencil} variant="secondary"
                  onPress={() => { setLines(linesFromOrder(data)); setEditing(true); }} />
                <Button label={t('orders.cancel')} icon={Trash2} variant="dangerOutline"
                  onPress={() => { setDialogError(null); setDialog('cancel'); }} />
              </View>
            )
          ) : null}

          {revisions.data && revisions.data.length > 1 ? (
            <View>
              <SectionTitle title={t('orders.revisions')} />
              <Card className="gap-3">
                {revisions.data.map((revision) => (
                  <View key={revision.revision_no} className="flex-row gap-3">
                    <History size={16} color="#78869B" style={{ marginTop: 2 }} />
                    <View className="flex-1">
                      <Text variant="label">
                        #{revision.revision_no} · {revision.action.replaceAll('_', ' ').toLowerCase()}
                      </Text>
                      <Text variant="small" tone="muted">
                        {[revision.actor_name, formatDateTime(revision.created_at, i18n.language)].filter(Boolean).join(' · ')}
                      </Text>
                      {revision.reason ? (
                        <Text variant="small" tone="soft">
                          “{revision.reason}”
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}
        </View>
      )}

      <ConfirmDialog
        visible={dialog === 'save'}
        title={t('orders.modify')}
        message={t('orders.modifyReason')}
        requireReason
        loading={update.isPending}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) =>
          update.mutate(
            { items: toLineInputs(lines), reason, admin_override: finalized || undefined },
            {
              onSuccess: () => {
                setDialog(null);
                setEditing(false);
                toast.success(t('order.updated'));
              },
              onError: (e) => setDialogError(errorMessage(e)),
            },
          )
        }
      />
      <ConfirmDialog
        visible={dialog === 'cancel'}
        title={t('orders.cancel')}
        message={t('orders.cancelConfirm')}
        destructive
        requireReason
        loading={cancel.isPending}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) =>
          cancel.mutate(
            { reason, admin_override: finalized || undefined },
            {
              onSuccess: () => {
                setDialog(null);
                toast.success(t('order.cancelled'));
              },
              onError: (e) => setDialogError(errorMessage(e)),
            },
          )
        }
      />
    </Screen>
  );
}
