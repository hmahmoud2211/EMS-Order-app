import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl, SwitchRow } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { InlineError } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import type { EmployeeInput } from '@/features/employees/api';
import type { Employee, Role } from '@/types/api';

const schema = z.object({
  full_name: z.string().trim().min(2).max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{2,59}$/, { message: 'Use 3–60 lowercase letters, digits, dots, dashes or underscores' }),
  email: z.string().trim().max(254).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), { message: 'Invalid email' }),
  phone: z.string().trim().max(30),
  department: z.string().trim().max(80),
  role: z.enum(['EMPLOYEE', 'ADMIN']),
  participates_in_orders: z.boolean(),
});
type Form = z.infer<typeof schema>;

export function EmployeeForm({
  employee,
  loading,
  error,
  onSubmit,
}: {
  employee?: Employee;
  loading: boolean;
  error: string | null;
  onSubmit: (input: EmployeeInput) => void;
}) {
  const { t } = useTranslation();
  const { control, handleSubmit, formState, setValue, watch } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: employee?.full_name ?? '',
      username: employee?.username ?? '',
      email: employee?.email ?? '',
      phone: employee?.phone ?? '',
      department: employee?.department ?? '',
      role: employee?.role ?? 'EMPLOYEE',
      participates_in_orders: employee?.participates_in_orders ?? true,
    },
  });
  const role = watch('role');

  const text = (name: 'full_name' | 'username' | 'email' | 'phone' | 'department', label: string, extra: object = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Input label={label} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
          error={formState.errors[name]?.message} {...extra} />
      )}
    />
  );

  return (
    <View className="gap-4">
      <Card className="gap-4">
        {text('full_name', t('employees.fullName'), { autoCapitalize: 'words' })}
        {text('username', t('employees.username'), { autoCapitalize: 'none', autoCorrect: false, hint: t('employees.usernameHint') })}
        {text('email', t('employees.email'), { autoCapitalize: 'none', keyboardType: 'email-address' })}
        {text('phone', t('employees.phone'), { keyboardType: 'phone-pad' })}
        {text('department', t('employees.department'))}
      </Card>
      <Card className="gap-3">
        <Text variant="label" tone="soft">
          {t('employees.role')}
        </Text>
        <SegmentedControl<Role>
          value={role}
          onChange={(value) => {
            setValue('role', value);
            if (!employee) setValue('participates_in_orders', value === 'EMPLOYEE');
          }}
          options={[
            { value: 'EMPLOYEE', label: t('employees.role_EMPLOYEE') },
            { value: 'ADMIN', label: t('employees.role_ADMIN') },
          ]}
        />
        <Controller
          control={control}
          name="participates_in_orders"
          render={({ field }) => (
            <SwitchRow label={t('employees.participates')} hint={t('employees.participatesHint')} value={field.value}
              onChange={field.onChange} />
          )}
        />
      </Card>
      <InlineError message={error} />
      <Button
        label={t('common.save')}
        icon={Save}
        size="lg"
        loading={loading}
        onPress={() =>
          handleSubmit((v) =>
            onSubmit({
              full_name: v.full_name,
              username: v.username,
              email: v.email || null,
              phone: v.phone || null,
              department: v.department || null,
              role: v.role,
              participates_in_orders: v.participates_in_orders,
            }),
          )()
        }
        testID="save-employee"
      />
    </View>
  );
}
