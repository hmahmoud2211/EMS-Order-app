import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Lock, LogIn, User } from 'lucide-react-native';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Input, type TextInputRef } from '@/components/ui/Input';
import { InlineError, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useLogin } from '@/features/auth/api';
import { AuthShell } from '@/features/auth/AuthShell';
import { loginSchema, type LoginForm } from '@/features/auth/schemas';
import { useAuthStore } from '@/stores/auth';
import { errorMessage } from '@/utils/errors';

export default function LoginScreen() {
  const { t } = useTranslation();
  const login = useLogin();
  const notice = useAuthStore((s) => s.notice);
  const passwordRef = useRef<TextInputRef>(null);
  const { control, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: () => router.replace('/'),
    }),
  );

  const noticeText =
    notice === 'ACCOUNT_DISABLED'
      ? t('auth.accountDisabled')
      : notice
        ? t('auth.sessionExpired')
        : null;

  return (
    <AuthShell
      title={t('auth.welcome')}
      subtitle={t('auth.subtitle')}
      footer={
        <Text variant="small" tone="muted" className="text-center">
          {t('auth.noAccount')}
        </Text>
      }
    >
      {noticeText && !login.isError ? <Notice message={noticeText} tone="warning" /> : null}
      <Controller
        control={control}
        name="username"
        render={({ field }) => (
          <Input
            label={t('auth.username')}
            placeholder={t('auth.usernamePlaceholder')}
            icon={User}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={formState.errors.username?.message}
            testID="login-username"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Input
            ref={passwordRef}
            label={t('auth.password')}
            placeholder={t('auth.passwordPlaceholder')}
            icon={Lock}
            secureToggle
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => onSubmit()}
            error={formState.errors.password?.message}
            testID="login-password"
          />
        )}
      />
      <InlineError message={login.isError ? errorMessage(login.error) : null} />
      <Button
        label={login.isPending ? t('auth.signingIn') : t('auth.signIn')}
        icon={LogIn}
        size="lg"
        loading={login.isPending}
        onPress={() => onSubmit()}
        testID="login-submit"
      />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/forgot-password')}
        className="items-center py-1 active:opacity-60"
        hitSlop={8}
      >
        <Text variant="label" tone="primary">
          {t('auth.forgot')}
        </Text>
      </Pressable>
    </AuthShell>
  );
}
