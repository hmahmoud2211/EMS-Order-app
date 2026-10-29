import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { InlineError } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { shadows } from '@/theme';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** Ask for a reason (required, min 3 chars) — used for audited admin actions. */
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  destructive = false,
  requireReason = false,
  reasonLabel,
  loading = false,
  error,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setReason('');
  }
  const reasonOk = !requireReason || reason.trim().length >= 3;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable className="flex-1 items-center justify-center bg-navy/50 px-6" onPress={onCancel}>
          <Pressable
            onPress={() => undefined}
            className="w-full max-w-[420px] gap-4 rounded-3xl bg-surface p-5"
            style={shadows.floating}
            accessibilityViewIsModal
          >
            <View className="gap-1.5">
              <Text variant="heading" accessibilityRole="header">
                {title}
              </Text>
              {message ? (
                <Text variant="small" tone="soft">
                  {message}
                </Text>
              ) : null}
            </View>
            {children}
            {requireReason ? (
              <Input
                label={reasonLabel ?? t('common.reason')}
                placeholder={t('common.reasonPlaceholder')}
                value={reason}
                onChangeText={setReason}
                multiline
                maxLength={255}
              />
            ) : null}
            <InlineError message={error} />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button label={t('common.cancel')} variant="outline" onPress={onCancel} disabled={loading} />
              </View>
              <View className="flex-1">
                <Button
                  label={confirmLabel ?? t('common.confirm')}
                  variant={destructive ? 'danger' : 'primary'}
                  loading={loading}
                  disabled={!reasonOk}
                  onPress={() => onConfirm(reason.trim())}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
