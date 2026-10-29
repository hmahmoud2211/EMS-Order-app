import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { InlineError } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { logout, useChangePassword } from '@/features/auth/api';
import { AuthShell } from '@/features/auth/AuthShell';
import { changePasswordSchema } from '@/features/auth/schemas';
import { errorMessage } from '@/utils/errors';

type Form = z.infer<typeof changePasswordSchema>;

/** Forced after signing in with a temporary password; also reachable from Profile. */
export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const change = useChangePassword();
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  });

  const onSubmit = handleSubmit((v) =>
    change.mutate(
      { current_password: v.current, new_password: v.password },
      {
        onSuccess: () => {
          toast.success(t('auth.passwordChanged'));
          router.replace('/');
        },
      },
    ),
  );

  return (
    <AuthShell title={t('auth.changeTitle')} subtitle={t('auth.changeSubtitle')}>
      <Controller
        control={control}
        name="current"
        render={({ field }) => (
          <Input label={t('auth.currentPassword')} icon={Lock} secureToggle autoComplete="current-password"
            value={field.value} onChangeText={field.onChange} error={formState.errors.current?.message} />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Input label={t('auth.newPassword')} hint={t('auth.passwordRules')} icon={Lock} secureToggle
            autoComplete="new-password" value={field.value} onChangeText={field.onChange}
            error={formState.errors.password?.message} />
        )}
      />
      <Controller
        control={control}
        name="confirm"
        render={({ field }) => (
          <Input label={t('auth.confirmPassword')} icon={Lock} secureToggle value={field.value}
            onChangeText={field.onChange} error={formState.errors.confirm?.message} />
        )}
      />
      <InlineError message={change.isError ? errorMessage(change.error) : null} />
      <Button label={t('auth.changePassword')} loading={change.isPending} onPress={() => onSubmit()} />
      <Button label={t('auth.signOut')} variant="ghost" onPress={() => logout()} />
    </AuthShell>
  );
}
