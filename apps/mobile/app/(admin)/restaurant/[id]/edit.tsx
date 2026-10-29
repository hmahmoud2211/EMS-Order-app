import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { useRestaurant } from '@/features/restaurants/api';
import { RestaurantForm } from '@/features/restaurants/components/RestaurantForm';

export default function EditRestaurantScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurant = useRestaurant(id);
  return (
    <Screen>
      <ScreenHeader back title={t('restaurants.editDetails')} subtitle={restaurant.data?.name} />
      {restaurant.isLoading ? (
        <SkeletonCard lines={6} />
      ) : restaurant.isError || !restaurant.data ? (
        <ErrorState error={restaurant.error} onRetry={() => restaurant.refetch()} />
      ) : (
        <RestaurantForm
          restaurant={restaurant.data}
          onSaved={() => {
            toast.success(t('restaurants.updated'));
            router.back();
          }}
        />
      )}
    </Screen>
  );
}
