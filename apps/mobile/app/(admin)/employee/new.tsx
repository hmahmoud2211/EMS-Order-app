import { router } from 'expo-router';
import { Check, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { useCreateEmployee } from '@/features/employees/api';
import { EmployeeForm } from '@/features/employees/components/EmployeeForm';
import { SecretCard } from '@/features/employees/components/SecretCard';
import type { EmployeeCreated } from '@/types/api';
import { errorMessage } from '@/utils/errors';

export default function NewEmployeeScreen() {
  const { t } = useTranslation();
  const create = useCreateEmployee();
  const [created, setCreated] = useState<EmployeeCreated | null>(null);

  if (created) {
    return (
      <Screen>
        <ScreenHeader title={t('employees.created')} subtitle={created.employee.full_name} />
        <View className="gap-4">
          {created.temporary_password ? (
            <SecretCard
              title={t('employees.tempPasswordTitle')}
              message={t('employees.tempPasswordMessage', { name: created.employee.full_name })}
              secret={created.temporary_password}
            />
          ) : null}
          <Button label={t('common.done')} icon={Check} onPress={() => router.back()} />
          <Button label={t('employees.add')} icon={UserPlus} variant="secondary" onPress={() => setCreated(null)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader back title={t('employees.add')} />
      <EmployeeForm
        loading={create.isPending}
        error={create.isError ? errorMessage(create.error) : null}
        onSubmit={(input) => create.mutate(input, { onSuccess: setCreated })}
      />
    </Screen>
  );
}
