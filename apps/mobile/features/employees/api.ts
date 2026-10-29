import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { appendFile, type UploadableFile } from '@/features/restaurants/api';
import { api } from '@/services/api';
import { qk } from '@/services/queryKeys';
import type {
  Employee,
  EmployeeCreated,
  EmployeeImportResult,
  OrderHistoryItem,
  Page,
  PasswordResetIssued,
  Role,
} from '@/types/api';

export interface EmployeeInput {
  full_name: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  role: Role;
  participates_in_orders?: boolean;
}

export function useEmployees(q: string, status: 'active' | 'inactive' | 'all') {
  return useQuery({
    queryKey: qk.employees(q, status),
    queryFn: async () =>
      (await api.get<Page<Employee>>('/employees', { params: { q: q || undefined, status, limit: 200 } })).data,
    placeholderData: (previous) => previous,
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: qk.employee(id),
    queryFn: async () => (await api.get<Employee>(`/employees/${id}`)).data,
    enabled: !!id,
  });
}

export function useEmployeeOrders(id: string) {
  return useQuery({
    queryKey: qk.employeeOrders(id),
    queryFn: async () =>
      (await api.get<Page<OrderHistoryItem>>(`/employees/${id}/orders`, { params: { limit: 50 } })).data,
    enabled: !!id,
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: ['admin', 'employees'] });
    client.invalidateQueries({ queryKey: ['admin', 'employee'] });
    client.invalidateQueries({ queryKey: qk.dashboard });
  };
}

export function useCreateEmployee() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: EmployeeInput) => (await api.post<EmployeeCreated>('/employees', input)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateEmployee(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: Partial<EmployeeInput>) => (await api.patch<Employee>(`/employees/${id}`, input)).data,
    onSuccess: invalidate,
  });
}

export function useSetEmployeeActive(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (active: boolean) =>
      (await api.post<Employee>(`/employees/${id}/${active ? 'reactivate' : 'deactivate'}`)).data,
    onSuccess: invalidate,
  });
}

export function useResetEmployeePassword(id: string) {
  return useMutation({
    mutationFn: async (method: 'code' | 'temporary_password') =>
      (await api.post<PasswordResetIssued>(`/employees/${id}/reset-password`, { method })).data,
  });
}

export function useImportEmployees() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { file: UploadableFile; dryRun: boolean }) => {
      const form = new FormData();
      await appendFile(form, 'file', input.file);
      form.append('dry_run', input.dryRun ? 'true' : 'false');
      return (
        await api.post<EmployeeImportResult>('/employees/import', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    },
    onSuccess: (data) => {
      if (!data.dry_run) invalidate();
    },
  });
}
