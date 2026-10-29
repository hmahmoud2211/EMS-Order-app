import { router, useLocalSearchParams } from 'expo-router';
import { Save } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useAdminCreateOrder, useSessionSummary } from '@/features/admin/api';
import { OrderEditor, toLineInputs, type EditorLine } from '@/features/admin/components/OrderEditor';
import { useEmployee } from '@/features/employees/api';
import { errorMessage } from '@/utils/errors';

/** Record an order on behalf of an employee (e.g. ordered by phone). Audited with a reason. */
export default function RecordOrderScreen() {
  const { t } = useTranslation();
  const { sessionId, employeeId } = useLocalSearchParams<{ sessionId: string; employeeId: string }>();
  const session = useSessionSummary(sessionId);
  const employee = useEmployee(employeeId);
  const create = useAdminCreateOrder(sessionId);
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalized = session.data?.status === 'FINALIZED';

  return (
    <Screen>
      <ScreenHeader back title={t('orders.record')} subtitle={session.data?.restaurant.name} />
      {session.isLoading || employee.isLoading ? (
        <SkeletonCard />
      ) : session.isError || employee.isError || !session.data || !employee.data ? (
        <ErrorState error={session.error ?? employee.error} onRetry={() => session.refetch()} />
      ) : (
        <View className="gap-4">
          <Card className="flex-row items-center gap-3">
            <Avatar name={employee.data.full_name} size={46} />
            <View className="flex-1">
              <Text variant="heading">{employee.data.full_name}</Text>
              <Text variant="small" tone="muted">
                {employee.data.department ?? '—'}
              </Text>
            </View>
          </Card>
          {finalized ? <Notice tone="warning" message={t('orders.overrideFinalized')} /> : null}
          <OrderEditor restaurantId={session.data.restaurant_id} lines={lines} onChange={setLines} />
          <Button label={t('orders.saveChanges')} icon={Save} disabled={!lines.length}
            onPress={() => { setError(null); setConfirm(true); }} />
        </View>
      )}
      <ConfirmDialog
        visible={confirm}
        title={t('orders.record')}
        message={t('orders.modifyReason')}
        requireReason
        loading={create.isPending}
        error={error}
        onCancel={() => setConfirm(false)}
        onConfirm={(reason) =>
          create.mutate(
            { employee_id: employeeId, items: toLineInputs(lines), reason, admin_override: finalized || undefined },
            {
              onSuccess: (order) => {
                setConfirm(false);
                toast.success(t('order.updated'));
                router.replace({ pathname: '/order-detail/[orderId]', params: { orderId: order.id } });
              },
              onError: (e) => setError(errorMessage(e)),
            },
          )
        }
      />
    </Screen>
  );
}
