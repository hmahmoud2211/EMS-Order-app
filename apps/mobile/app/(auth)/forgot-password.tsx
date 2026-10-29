import { router } from 'expo-router';
import { KeyRound, Send, User } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { InlineError, Notice } from '@/components/ui/States';
import { useRequestPasswordReset } from '@/features/auth/api';
import { AuthShell } from '@/features/auth/AuthShell';
import { errorMessage } from '@/utils/errors';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const request = useRequestPasswordReset();

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      {request.isSuccess ? <Notice message={request.data.message} tone="success" /> : null}
      <Input
        label={t('auth.username')}
        icon={User}
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />
      <InlineError message={request.isError ? errorMessage(request.error) : null} />
      <Button
        label={t('auth.requestReset')}
        icon={Send}
        loading={request.isPending}
        disabled={!username.trim()}
        onPress={() => request.mutate(username.trim())}
      />
      <Button
        label={t('auth.haveCode')}
        icon={KeyRound}
        variant="secondary"
        onPress={() => router.push({ pathname: '/reset-password', params: { username: username.trim() } })}
      />
      <Button label={t('auth.backToLogin')} variant="ghost" onPress={() => router.back()} />
    </AuthShell>
  );
}
