import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { qk } from '@/services/queryKeys';
import { useCartStore } from '@/stores/cart';
import type { Menu, Order } from '@/types/api';

/** Load an existing order into the cart and open the cart for editing. */
export function useEditOrder() {
  const client = useQueryClient();
  return (order: Order, target: '/cart' | '/menu' = '/cart') => {
    const menu = client.getQueryData<Menu>(qk.todayMenu);
    const items = menu?.categories.flatMap((c) => c.items) ?? [];
    useCartStore.getState().loadOrder(order, items);
    router.push(target);
  };
}
