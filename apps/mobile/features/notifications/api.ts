import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import { qk } from '@/services/queryKeys';
import { useAuthStore } from '@/stores/auth';
import type { NotificationList, NotificationPrefs } from '@/types/api';

export function useNotifications() {
  const signedIn = useAuthStore((s) => s.status === 'signedIn' && !s.user?.must_change_password);
  return useQuery({
    queryKey: qk.notifications,
    queryFn: async () => (await api.get<NotificationList>('/notifications', { params: { limit: 50 } })).data,
    enabled: signedIn,
    refetchInterval: 30_000,
  });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => api.patch('/notifications/read-all'),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: qk.notificationPrefs,
    queryFn: async () => (await api.get<NotificationPrefs>('/notifications/preferences')).data,
  });
}

export function useUpdateNotificationPrefs() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<NotificationPrefs> & { preferred_language?: 'en' | 'ar' }) =>
      (await api.patch<NotificationPrefs>('/notifications/preferences', input)).data,
    onSuccess: (data) => client.setQueryData(qk.notificationPrefs, data),
  });
}
