import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { Check, Copy, FileUp, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/Controls';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { InlineError, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useImportEmployees } from '@/features/employees/api';
import type { UploadableFile } from '@/features/restaurants/api';
import type { EmployeeImportResult } from '@/types/api';
import { errorMessage } from '@/utils/errors';

export default function ImportEmployeesScreen() {
  const { t } = useTranslation();
  const importer = useImportEmployees();
  const [file, setFile] = useState<UploadableFile | null>(null);
  const [preview, setPreview] = useState<EmployeeImportResult | null>(null);
  const [result, setResult] = useState<EmployeeImportResult | null>(null);

  const pick = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain'] });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const chosen = { uri: asset.uri, name: asset.name, mimeType: asset.mimeType, file: (asset as { file?: File }).file ?? null };
    setFile(chosen);
    setResult(null);
    importer.mutate({ file: chosen, dryRun: true }, { onSuccess: setPreview });
  };

  const credentialsText = (data: EmployeeImportResult) =>
    data.created.map((c) => `${c.full_name}\t${c.username}\t${c.temporary_password}`).join('\n');

  return (
    <Screen>
      <ScreenHeader back title={t('employees.importTitle')} />
      {result ? (
        <View className="gap-4">
          <Notice tone="success" message={`${t('employees.credentialsTitle')}: ${result.created.length}`} />
          <Notice tone="warning" message={t('employees.credentialsMessage')} />
          <Card className="gap-2">
            {result.created.map((c) => (
              <View key={c.username} className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Text variant="subheading">{c.full_name}</Text>
                  <Text variant="caption" tone="muted">@{c.username}</Text>
                </View>
                <Text variant="label" selectable>
                  {c.temporary_password}
                </Text>
              </View>
            ))}
          </Card>
          <Button label={t('employees.copyAll')} icon={Copy} variant="navy"
            onPress={async () => {
              await Clipboard.setStringAsync(credentialsText(result));
              toast.success(t('common.copied'));
            }} />
          <Button label={t('common.done')} icon={Check} onPress={() => router.back()} />
        </View>
      ) : (
        <View className="gap-4">
          <Card className="gap-3">
            <Text variant="small" tone="soft">
              {t('employees.importSubtitle')}
            </Text>
            <Text variant="caption" tone="muted" selectable>
              full_name,username,email,phone,department{'\n'}Sara Nabil,sara.nabil,sara@example.com,0100…,Finance
            </Text>
            <Button label={file ? file.name : t('imports.chooseFile')} icon={FileUp} variant="secondary" onPress={pick}
              loading={importer.isPending && !preview} />
          </Card>
          <InlineError message={importer.isError ? errorMessage(importer.error) : null} />
          {preview ? (
            <View className="gap-3">
              <SectionTitle title={`${t('employees.preview')} · ${preview.valid_rows}/${preview.total_rows}`} />
              <Card className="gap-2.5">
                {preview.rows.map((row) => (
                  <View key={row.row} className="gap-0.5">
                    <Text variant="subheading" tone={row.errors.length ? 'danger' : 'ink'}>
                      {row.full_name || '—'} {row.username ? `(@${row.username})` : ''}
                    </Text>
                    {row.errors.length ? (
                      <Text variant="caption" tone="danger">
                        {t('employees.rowErrors', { row: row.row, errors: row.errors.join('; ') })}
                      </Text>
                    ) : (
                      <Text variant="caption" tone="muted">
                        {[row.email, row.department].filter(Boolean).join(' · ') || '—'}
                      </Text>
                    )}
                  </View>
                ))}
              </Card>
              <Button
                label={t('employees.createAccounts', { count: preview.valid_rows })}
                icon={UserPlus}
                disabled={!preview.valid_rows || !file}
                loading={importer.isPending}
                onPress={() => file && importer.mutate({ file, dryRun: false }, { onSuccess: setResult })}
              />
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
