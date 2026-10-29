import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { api } from '@/services/api';
import { qk } from '@/services/queryKeys';
import type {
  AppSettings,
  ConsolidatedResponse,
  DashboardResponse,
  EmployeeStatusResponse,
  FeeAllocation,
  OcrStatus,
  Order,
  OrderLineInput,
  OrderRevision,
  Page,
  ParticipationAnalytics,
  ProviderStatus,
  Session,
  SessionHistoryItem,
  SpendingAnalytics,
} from '@/types/api';

/** Live data while the screen is visible: polled every 5 s, paused when hidden or backgrounded. */
const LIVE_INTERVAL = 5_000;

export function useDashboard() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: async () => (await api.get<DashboardResponse>('/admin/dashboard')).data,
    refetchInterval: focused ? LIVE_INTERVAL : false,
    staleTime: 2_000,
  });
}

export function useEmployeeStatus(sessionId: string | undefined, filter: string, q: string) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: qk.employeeStatus(sessionId ?? '', filter, q),
    queryFn: async () =>
      (
        await api.get<EmployeeStatusResponse>(`/admin/sessions/${sessionId}/employee-status`, {
          params: { filter, q: q || undefined },
        })
      ).data,
    enabled: !!sessionId,
    refetchInterval: focused ? LIVE_INTERVAL : false,
    placeholderData: (previous) => previous,
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: qk.session(id),
    queryFn: async () => (await api.get<Session>(`/sessions/${id}`)).data,
    enabled: !!id,
  });
}

export function useSessionSummary(id: string) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: [...qk.session(id), 'summary'],
    queryFn: async () => (await api.get<SessionHistoryItem>(`/admin/sessions/${id}/summary`)).data,
    enabled: !!id,
    refetchInterval: focused ? 10_000 : false,
  });
}

export function useSessionHistory() {
  return useQuery({
    queryKey: qk.sessionHistory,
    queryFn: async () =>
      (await api.get<Page<SessionHistoryItem>>('/sessions/history', { params: { limit: 60 } })).data,
  });
}

export function useConsolidated(sessionId: string) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: qk.consolidated(sessionId),
    queryFn: async () => (await api.get<ConsolidatedResponse>(`/admin/sessions/${sessionId}/consolidated`)).data,
    enabled: !!sessionId,
    refetchInterval: focused ? 15_000 : false,
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: qk.adminOrder(id),
    queryFn: async () => (await api.get<Order>(`/admin/orders/${id}`)).data,
    enabled: !!id,
  });
}

export function useOrderRevisions(id: string) {
  return useQuery({
    queryKey: qk.revisions(id),
    queryFn: async () => (await api.get<OrderRevision[]>(`/admin/orders/${id}/revisions`)).data,
    enabled: !!id,
  });
}

function useInvalidateAdmin() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: ['admin'] });
    client.invalidateQueries({ queryKey: qk.today });
  };
}

export interface SessionCreateInput {
  restaurant_id: string;
  session_date?: string;
  opens_at?: string;
  closes_at: string;
  notes?: string | null;
  open_now: boolean;
}

export function useCreateSession() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (input: SessionCreateInput) => (await api.post<Session>('/sessions', input)).data,
    onSuccess: invalidate,
  });
}

export interface SessionUpdateInput {
  restaurant_id?: string;
  opens_at?: string;
  closes_at?: string;
  notes?: string | null;
  delivery_fee?: string;
  service_fee?: string;
  fee_note?: string | null;
  fee_allocation?: FeeAllocation;
  existing_orders_action?: 'cancel';
  reason?: string;
  admin_override?: boolean;
}

export function useUpdateSession(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (input: SessionUpdateInput) => (await api.patch<Session>(`/sessions/${id}`, input)).data,
    onSuccess: invalidate,
  });
}

export function useSessionAction(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (input: { action: 'open' | 'close' | 'finalize' | 'cancel'; closes_at?: string; reason?: string }) => {
      const body =
        input.action === 'cancel' ? { reason: input.reason } : input.action === 'open' && input.closes_at ? { closes_at: input.closes_at } : undefined;
      return (await api.post<Session>(`/sessions/${id}/${input.action}`, body)).data;
    },
    onSuccess: invalidate,
  });
}

export function useAdminUpdateOrder(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (input: { items: OrderLineInput[]; reason: string; admin_override?: boolean }) =>
      (await api.patch<Order>(`/admin/orders/${id}`, input)).data,
    onSuccess: invalidate,
  });
}

export function useAdminCancelOrder(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (input: { reason: string; admin_override?: boolean }) =>
      (await api.post<Order>(`/admin/orders/${id}/cancel`, input)).data,
    onSuccess: invalidate,
  });
}

export function useAdminCreateOrder(sessionId: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (input: { employee_id: string; items: OrderLineInput[]; reason: string; admin_override?: boolean }) =>
      (await api.post<Order>(`/admin/sessions/${sessionId}/orders`, input)).data,
    onSuccess: invalidate,
  });
}

export function useAppSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: async () => (await api.get<AppSettings>('/admin/settings')).data,
  });
}

export function useUpdateAppSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AppSettings>) => (await api.patch<AppSettings>('/admin/settings', input)).data,
    onSuccess: (data) => client.setQueryData(qk.settings, data),
  });
}

export function useProviders() {
  return useQuery({
    queryKey: qk.providers,
    queryFn: async () => (await api.get<ProviderStatus[]>('/admin/providers')).data,
    staleTime: 5 * 60_000,
  });
}

export function useOcrStatus() {
  return useQuery({
    queryKey: qk.ocr,
    queryFn: async () => (await api.get<OcrStatus>('/admin/ocr-status')).data,
    staleTime: 5 * 60_000,
  });
}

export function useSpending() {
  return useQuery({
    queryKey: qk.spending,
    queryFn: async () => (await api.get<SpendingAnalytics>('/admin/analytics/spending')).data,
  });
}

export function useParticipation() {
  return useQuery({
    queryKey: qk.participation,
    queryFn: async () => (await api.get<ParticipationAnalytics>('/admin/analytics/participation')).data,
  });
}
