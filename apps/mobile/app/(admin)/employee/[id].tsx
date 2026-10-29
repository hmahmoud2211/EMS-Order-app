import { useLocalSearchParams } from 'expo-router';
import { KeyRound, Pencil, UserCheck, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SectionTitle, SelectRow } from '@/components/ui/Controls';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import {
  useEmployee,
  useEmployeeOrders,
  useResetEmployeePassword,
  useSetEmployeeActive,
  useUpdateEmployee,
} from '@/features/employees/api';
import { EmployeeForm } from '@/features/employees/components/EmployeeForm';
import { SecretCard } from '@/features/employees/components/SecretCard';
import type { PasswordResetIssued } from '@/types/api';
import { errorMessage } from '@/utils/errors';
import { formatPrice } from '@/utils/money';
import { formatBusinessDate, formatDateTime } from '@/utils/time';

export default function EmployeeDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const employee = useEmployee(id);
  const orders = useEmployeeOrders(id);
  const update = useUpdateEmployee(id);
  const setActive = useSetEmployeeActive(id);
  const reset = useResetEmployeePassword(id);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'deactivate' | 'reset' | null>(null);
  const [resetMethod, setResetMethod] = useState<'code' | 'temporary_password'>('code');
  const [issued, setIssued] = useState<PasswordResetIssued | null>(null);
  const e = employee.data;

  return (
    <Screen refreshing={employee.isRefetching} onRefresh={() => Promise.all([employee.refetch(), orders.refetch()])}>
      <ScreenHeader back title={e?.full_name ?? t('employees.title')} />
      {employee.isLoading ? (
        <SkeletonCard lines={5} />
      ) : employee.isError || !e ? (
        <ErrorState error={employee.error} onRetry={() => employee.refetch()} />
      ) : editing ? (
        <EmployeeForm
          employee={e}
          loading={update.isPending}
          error={update.isError ? errorMessage(update.error) : null}
          onSubmit={(input) =>
            update.mutate(input, {
              onSuccess: () => {
                setEditing(false);
                toast.success(t('session.saved'));
              },
            })
          }
        />
      ) : (
        <View className="gap-4">
          <Card className="items-center gap-2 py-6">
            <Avatar name={e.full_name} size={72} muted={!e.is_active} />
            <Text variant="title" className="mt-1 text-center">
              {e.full_name}
            </Text>
            <Text variant="small" tone="muted">
              @{e.username}
              {e.department ? ` · ${e.department}` : ''}
            </Text>
            <View className="mt-1 flex-row gap-2">
              <Badge label={t(`employees.role_${e.role}`)} tone={e.role === 'ADMIN' ? 'navy' : 'primary'} />
              <Badge label={e.is_active ? t('employees.active') : t('employees.inactive')} tone={e.is_active ? 'success' : 'neutral'} />
            </View>
            <Text variant="caption" tone="muted" className="mt-1">
              {e.last_login_at ? t('employees.lastLogin', { date: formatDateTime(e.last_login_at, i18n.language) }) : t('employees.neverLoggedIn')}
            </Text>
          </Card>

          {issued ? (
            <SecretCard
              title={t('employees.resetIssuedTitle', { name: e.full_name })}
              message={issued.method === 'code' ? t('employees.resetCodeMessage') : t('employees.resetTempMessage')}
              secret={issued.secret}
            />
          ) : null}

          <View className="gap-3">
            <Button label={t('common.edit')} icon={Pencil} variant="outline" onPress={() => setEditing(true)} />
            {e.is_active ? (
              <Button label={t('employees.resetPassword')} icon={KeyRound} variant="secondary" onPress={() => setDialog('reset')} />
            ) : null}
            {e.is_active ? (
              <Button label={t('employees.deactivate')} icon={UserX} variant="dangerOutline" onPress={() => setDialog('deactivate')} />
            ) : (
              <Button label={t('employees.reactivate')} icon={UserCheck} variant="success" loading={setActive.isPending}
                onPress={() => setActive.mutate(true, { onError: (err) => toast.error(errorMessage(err)) })} />
            )}
          </View>

          <SectionTitle title={t('employees.orderHistory')} />
          {orders.data?.items.length ? (
            <Card className="gap-2.5">
              {orders.data.items.map((order) => (
                <View key={order.id} className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text variant="subheading" numberOfLines={1}>
                      {order.restaurant_name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {formatBusinessDate(order.session_date, i18n.language, 'weekday')} · {order.item_names.join(', ')}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text variant="label">{formatPrice(order.total_amount)}</Text>
                    {order.status === 'CANCELLED' ? <Badge label={t('status.CANCELLED')} tone={statusTone('CANCELLED')} size="sm" /> : null}
                  </View>
                </View>
              ))}
            </Card>
          ) : (
            <Text variant="small" tone="muted">
              {t('history.emptyTitle')}
            </Text>
          )}
        </View>
      )}

      <ConfirmDialog
        visible={dialog === 'deactivate'}
        title={t('employees.deactivate')}
        message={t('employees.deactivateConfirm', { name: e?.full_name })}
        destructive
        confirmLabel={t('employees.deactivate')}
        loading={setActive.isPending}
        error={setActive.isError ? errorMessage(setActive.error) : null}
        onCancel={() => setDialog(null)}
        onConfirm={() => setActive.mutate(false, { onSuccess: () => setDialog(null) })}
      />
      <ConfirmDialog
        visible={dialog === 'reset'}
        title={t('employees.resetPassword')}
        confirmLabel={t('employees.resetPassword')}
        loading={reset.isPending}
        error={reset.isError ? errorMessage(reset.error) : null}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          reset.mutate(resetMethod, {
            onSuccess: (result) => {
              setIssued(result);
              setDialog(null);
            },
          })
        }
      >
        <View className="gap-2">
          <SelectRow label={t('employees.resetCode')} hint={t('employees.resetCodeMessage')} selected={resetMethod === 'code'}
            onPress={() => setResetMethod('code')} />
          <SelectRow label={t('employees.resetTemp')} hint={t('employees.resetTempMessage')}
            selected={resetMethod === 'temporary_password'} onPress={() => setResetMethod('temporary_password')} />
        </View>
      </ConfirmDialog>
      {editing ? (
        <View className="mt-2">
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setEditing(false)} />
        </View>
      ) : null}
    </Screen>
  );
}
