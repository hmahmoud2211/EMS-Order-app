import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, ChevronRight, FileUp, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SectionTitle } from '@/components/ui/Controls';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { InlineError, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useOcrStatus } from '@/features/admin/api';
import { useMenuImports, useRestaurant, useUploadMenu, type UploadableFile } from '@/features/restaurants/api';
import { colors } from '@/theme';
import { errorCode, errorMessage } from '@/utils/errors';
import { formatDateTime } from '@/utils/time';

const ACCEPTED = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/comma-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export default function ImportMenuScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurant = useRestaurant(id);
  const imports = useMenuImports(id);
  const ocr = useOcrStatus();
  const upload = useUploadMenu(id);
  const [pendingFile, setPendingFile] = useState<UploadableFile | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  const send = (file: UploadableFile, force = false) => {
    setPendingFile(file);
    upload.mutate(
      { file, force },
      {
        onSuccess: (record) => {
          setDuplicate(false);
          router.push({ pathname: '/restaurant/[id]/review/[importId]', params: { id, importId: record.id } });
        },
        onError: (e) => {
          if (errorCode(e) === 'DUPLICATE_IMPORT') setDuplicate(true);
        },
      },
    );
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ACCEPTED, copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    send({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, file: (asset as { file?: File }).file ?? null });
  };

  const takePhoto = async () => {
    const permission =
      Platform.OS === 'web' ? { granted: true } : await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result =
      Platform.OS === 'web'
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })
        : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    send({
      uri: asset.uri,
      name: asset.fileName ?? 'menu-photo.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
      file: (asset as unknown as { file?: File }).file ?? null,
    });
  };

  return (
    <Screen>
      <ScreenHeader back title={t('imports.title')} subtitle={restaurant.data?.name} />
      <Card className="gap-4">
        <View className="items-center gap-2 rounded-3xl border-2 border-dashed border-primary-200 bg-primary-50 px-4 py-8">
          <FileUp size={34} color={colors.primary} />
          <Text variant="subheading" className="text-center">
            {t('imports.subtitle')}
          </Text>
          <Text variant="small" tone="muted" className="text-center">
            {t('imports.formats')}
          </Text>
        </View>
        {ocr.data && !ocr.data.available ? <Notice tone="warning" message={ocr.data.message} /> : null}
        {ocr.data?.available && !ocr.data.arabic_available ? <Notice tone="warning" message={ocr.data.message} /> : null}
        <Button label={upload.isPending ? t('imports.uploading') : t('imports.chooseFile')} icon={Upload}
          loading={upload.isPending} onPress={pickFile} />
        <Button label={t('imports.takePhoto')} icon={Camera} variant="secondary" disabled={upload.isPending} onPress={takePhoto} />
        <InlineError message={upload.isError && errorCode(upload.error) !== 'DUPLICATE_IMPORT' ? errorMessage(upload.error) : null} />
      </Card>

      <SectionTitle title={t('imports.history')} />
      {imports.isLoading ? (
        <SkeletonList count={2} />
      ) : !imports.data?.length ? (
        <Text variant="small" tone="muted">
          {t('imports.noHistory')}
        </Text>
      ) : (
        <View className="gap-2.5">
          {imports.data.map((record) => (
            <Card
              key={record.id}
              onPress={() => router.push({ pathname: '/restaurant/[id]/review/[importId]', params: { id, importId: record.id } })}
            >
              <View className="flex-row items-center gap-3">
                <View className="flex-1 gap-0.5">
                  <Text variant="subheading" numberOfLines={1}>
                    {record.original_filename}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {record.source_type} · {formatDateTime(record.created_at, i18n.language)}
                    {record.stats?.items !== undefined ? ` · ${t('common.items', { count: record.stats.items })}` : ''}
                  </Text>
                </View>
                <Badge label={t(`status.${record.status}`)} tone={statusTone(record.status)} size="sm" />
                <ChevronRight size={16} color={colors.mutedLight} />
              </View>
            </Card>
          ))}
        </View>
      )}

      <ConfirmDialog
        visible={duplicate}
        title={t('imports.title')}
        message={upload.isError ? errorMessage(upload.error) : ''}
        confirmLabel={t('imports.chooseFile')}
        loading={upload.isPending}
        onCancel={() => setDuplicate(false)}
        onConfirm={() => pendingFile && send(pendingFile, true)}
      />
    </Screen>
  );
}
