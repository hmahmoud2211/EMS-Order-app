import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, Trash2 } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui/Button';
import { CoverImage } from '@/components/ui/RestaurantCover';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useUploadImage } from '@/features/restaurants/api';
import { colors } from '@/theme';
import { errorMessage } from '@/utils/errors';

/** Pick an image from the library, upload it (validated server-side) and return its URL. */
export function ImageField({
  label,
  value,
  onChange,
  kind = 'images',
  height = 140,
  square = false,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  kind?: 'images' | 'restaurants' | 'items';
  height?: number;
  square?: boolean;
}) {
  const { t } = useTranslation();
  const upload = useUploadImage();

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: square ? [1, 1] : [16, 9],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    upload.mutate(
      {
        file: {
          uri: asset.uri,
          name: asset.fileName ?? `image.${asset.mimeType?.split('/')[1] ?? 'jpg'}`,
          mimeType: asset.mimeType ?? 'image/jpeg',
          file: (asset as unknown as { file?: File }).file ?? null,
        },
        kind,
      },
      { onSuccess: (data) => onChange(data.url), onError: (e) => toast.error(errorMessage(e)) },
    );
  };

  return (
    <View className="gap-1.5">
      <Text variant="label" tone="soft">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? t('restaurants.changePhoto') : t('restaurants.choosePhoto')}`}
        onPress={pick}
        disabled={upload.isPending}
        className="active:opacity-90"
        style={square ? { width: height } : undefined}
      >
        {value ? (
          <CoverImage uri={value} seed={label} height={height} radius={18} />
        ) : (
          <View
            style={{ height }}
            className="items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-line-strong bg-surface"
          >
            <ImagePlus size={26} color={colors.muted} />
            <Text variant="caption" tone="muted">
              {upload.isPending ? t('imports.uploading') : t('restaurants.choosePhoto')}
            </Text>
          </View>
        )}
      </Pressable>
      {value ? (
        <View className="flex-row items-center gap-2">
          <Text variant="caption" tone="primary" onPress={pick}>
            {upload.isPending ? t('imports.uploading') : t('restaurants.changePhoto')}
          </Text>
          <IconButton icon={Trash2} tone="danger" size={32} label={t('common.remove')} onPress={() => onChange(null)} />
        </View>
      ) : null}
    </View>
  );
}
