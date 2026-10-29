import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { api } from '@/services/api';
import { qk } from '@/services/queryKeys';
import type { Menu, Order, OrderHistoryItem, OrderLineInput, Page, TodayResponse } from '@/types/api';

export function useToday() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: qk.today,
    queryFn: async () => (await api.get<TodayResponse>('/sessions/today')).data,
    refetchInterval: focused ? 30_000 : false,
  });
}

export function useTodayMenu(enabled = true) {
  return useQuery({
    queryKey: qk.todayMenu,
    queryFn: async () => (await api.get<Menu>('/sessions/today/menu')).data,
    enabled,
    staleTime: 60_000,
  });
}

export function useMyTodayOrder() {
  return useQuery({
    queryKey: qk.myTodayOrder,
    queryFn: async () => (await api.get<Order | null>('/orders/me/today')).data,
  });
}

export function useMyHistory() {
  return useQuery({
    queryKey: qk.myHistory,
    queryFn: async () => (await api.get<Page<OrderHistoryItem>>('/orders/me/history', { params: { limit: 100 } })).data,
  });
}

export function useMyOrder(id: string) {
  return useQuery({
    queryKey: qk.myOrder(id),
    queryFn: async () => (await api.get<Order>(`/orders/me/${id}`)).data,
    enabled: !!id,
  });
}

function useInvalidateOrders() {
  const client = useQueryClient();
  return (order?: Order) => {
    if (order) {
      client.setQueryData(qk.myOrder(order.id), order);
      client.setQueryData(qk.myTodayOrder, order.status === 'SUBMITTED' ? order : null);
    }
    client.invalidateQueries({ queryKey: qk.today });
    client.invalidateQueries({ queryKey: qk.myHistory });
    client.invalidateQueries({ queryKey: ['notifications'] });
  };
}

export function useSubmitOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      items: OrderLineInput[];
      expectedTotal: string;
      idempotencyKey: string;
    }) =>
      (
        await api.post<Order>(
          '/orders',
          { session_id: input.sessionId, items: input.items, expected_total: input.expectedTotal },
          { headers: { 'Idempotency-Key': input.idempotencyKey } },
        )
      ).data,
    onSuccess: invalidate,
  });
}

export function useUpdateOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: async (input: { orderId: string; items: OrderLineInput[]; expectedTotal: string }) =>
      (await api.put<Order>(`/orders/${input.orderId}`, { items: input.items, expected_total: input.expectedTotal }))
        .data,
    onSuccess: invalidate,
  });
}

export function useCancelOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: async (orderId: string) => (await api.delete<Order>(`/orders/${orderId}`)).data,
    onSuccess: invalidate,
  });
}
