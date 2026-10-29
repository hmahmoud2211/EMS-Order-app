import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { toast } from '@/components/ui/Toast';
import { RestaurantForm } from '@/features/restaurants/components/RestaurantForm';

export default function NewRestaurantScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <ScreenHeader back title={t('restaurants.add')} />
      <RestaurantForm
        onSaved={(restaurant) => {
          toast.success(t('restaurants.created'));
          router.replace({ pathname: '/restaurant/[id]', params: { id: restaurant.id } });
        }}
      />
    </Screen>
  );
}
