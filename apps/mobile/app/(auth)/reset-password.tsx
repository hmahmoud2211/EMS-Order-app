import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyRound, Lock, User } from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { InlineError, Notice } from '@/components/ui/States';
import { useResetPassword } from '@/features/auth/api';
import { AuthShell } from '@/features/auth/AuthShell';
import { resetSchema } from '@/features/auth/schemas';
import { errorMessage } from '@/utils/errors';

type Form = z.infer<typeof resetSchema>;

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ username?: string }>();
  const reset = useResetPassword();
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(resetSchema),
    defaultValues: { username: params.username ?? '', code: '', password: '', confirm: '' },
  });

  const onSubmit = handleSubmit((v) =>
    reset.mutate({ username: v.username.trim(), code: v.code.trim().toUpperCase(), new_password: v.password }),
  );

  if (reset.isSuccess) {
    return (
      <AuthShell title={t('auth.resetTitle')}>
        <Notice message={t('auth.resetDone')} tone="success" />
        <Button label={t('auth.backToLogin')} onPress={() => router.replace('/login')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.enterCode')} subtitle={t('auth.passwordRules')}>
      <Controller
        control={control}
        name="username"
        render={({ field }) => (
          <Input label={t('auth.username')} icon={User} autoCapitalize="none" value={field.value}
            onChangeText={field.onChange} error={formState.errors.username?.message} />
        )}
      />
      <Controller
        control={control}
        name="code"
        render={({ field }) => (
          <Input label={t('auth.code')} placeholder={t('auth.codePlaceholder')} icon={KeyRound} autoCapitalize="characters"
            autoCorrect={false} value={field.value} onChangeText={field.onChange} error={formState.errors.code?.message} />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Input label={t('auth.newPassword')} icon={Lock} secureToggle autoComplete="new-password" value={field.value}
            onChangeText={field.onChange} error={formState.errors.password?.message} />
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
      <InlineError message={reset.isError ? errorMessage(reset.error) : null} />
      <Button label={t('auth.setPassword')} loading={reset.isPending} onPress={() => onSubmit()} />
      <Button label={t('auth.backToLogin')} variant="ghost" onPress={() => router.replace('/login')} />
    </AuthShell>
  );
}
