import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SwitchRow } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { InlineError } from '@/components/ui/States';
import { useSaveRestaurant, type RestaurantInput } from '@/features/restaurants/api';
import { ImageField } from '@/features/restaurants/components/ImageField';
import type { Restaurant } from '@/types/api';
import { errorCode, errorMessage, toApiError } from '@/utils/errors';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  branch: z.string().max(120),
  cuisine: z.string().max(80),
  description: z.string().max(2000),
  phone: z.string().max(30),
  address: z.string().max(255),
  external_reference: z
    .string()
    .max(500)
    .refine((v) => !v.trim() || /^https?:\/\//i.test(v.trim()), { message: 'Must start with https://' }),
  is_active: z.boolean(),
});
type Form = z.infer<typeof schema>;

export function RestaurantForm({ restaurant, onSaved }: { restaurant?: Restaurant; onSaved: (r: Restaurant) => void }) {
  const { t } = useTranslation();
  const save = useSaveRestaurant(restaurant?.id);
  const [logo, setLogo] = useState<string | null>(restaurant?.logo_url ?? null);
  const [cover, setCover] = useState<string | null>(restaurant?.cover_image_url ?? null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: restaurant?.name ?? '',
      branch: restaurant?.branch ?? '',
      cuisine: restaurant?.cuisine ?? '',
      description: restaurant?.description ?? '',
      phone: restaurant?.phone ?? '',
      address: restaurant?.address ?? '',
      external_reference: restaurant?.external_reference ?? '',
      is_active: restaurant?.is_active ?? true,
    },
  });

  const submit = (allowDuplicate: boolean) =>
    handleSubmit((values) => {
      const payload: RestaurantInput = {
        ...values,
        name: values.name.trim(),
        branch: values.branch.trim() || null,
        cuisine: values.cuisine.trim() || null,
        description: values.description.trim() || null,
        phone: values.phone.trim() || null,
        address: values.address.trim() || null,
        external_reference: values.external_reference.trim() || null,
        logo_url: logo,
        cover_image_url: cover,
        ...(restaurant ? {} : { allow_duplicate: allowDuplicate }),
      };
      save.mutate(payload, {
        onSuccess: (r) => {
          setDuplicate(null);
          onSaved(r);
        },
        onError: (e) => {
          if (errorCode(e) === 'DUPLICATE_RESTAURANT') {
            const details = toApiError(e).details as { matches?: { name: string; branch: string | null }[] } | null;
            setDuplicate((details?.matches ?? []).map((m) => [m.name, m.branch].filter(Boolean).join(' – ')).join(', '));
          }
        },
      });
    })();

  const field = (name: keyof Omit<Form, 'is_active'>, label: string, extra: Record<string, unknown> = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f }) => (
        <Input label={label} value={f.value} onChangeText={f.onChange} onBlur={f.onBlur}
          error={formState.errors[name]?.message as string | undefined} {...extra} />
      )}
    />
  );

  return (
    <View className="gap-4">
      <Card className="gap-4">
        <ImageField label={t('restaurants.photo')} value={cover} onChange={setCover} kind="restaurants" />
        <ImageField label={t('restaurants.logo')} value={logo} onChange={setLogo} kind="restaurants" height={88} square />
      </Card>
      <Card className="gap-4">
        {field('name', t('restaurants.name'))}
        <View className="flex-row gap-3">
          <View className="flex-1">{field('branch', t('restaurants.branch'))}</View>
          <View className="flex-1">{field('cuisine', t('restaurants.cuisine'))}</View>
        </View>
        {field('description', t('restaurants.description'), { multiline: true })}
        {field('phone', t('restaurants.phone'), { keyboardType: 'phone-pad' })}
        {field('address', t('restaurants.address'))}
        {field('external_reference', t('restaurants.externalReference'), {
          hint: t('restaurants.externalReferenceHint'),
          autoCapitalize: 'none',
          keyboardType: 'url',
        })}
        <Controller
          control={control}
          name="is_active"
          render={({ field: f }) => <SwitchRow label={t('restaurants.active')} value={f.value} onChange={f.onChange} />}
        />
      </Card>
      <InlineError message={save.isError && errorCode(save.error) !== 'DUPLICATE_RESTAURANT' ? errorMessage(save.error) : null} />
      <Button label={t('common.save')} icon={Save} size="lg" loading={save.isPending} onPress={() => submit(false)} />
      <ConfirmDialog
        visible={!!duplicate}
        title={t('restaurants.duplicateTitle')}
        message={t('restaurants.duplicateMessage', { names: duplicate })}
        confirmLabel={t('restaurants.createAnyway')}
        loading={save.isPending}
        onCancel={() => setDuplicate(null)}
        onConfirm={() => submit(true)}
      />
    </View>
  );
}
