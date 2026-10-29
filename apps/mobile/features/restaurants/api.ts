import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/services/api';
import { qk } from '@/services/queryKeys';
import type {
  DraftItem,
  Menu,
  MenuImport,
  MenuImportDetail,
  MenuItem,
  Page,
  Restaurant,
  RestaurantListItem,
} from '@/types/api';

export interface RestaurantInput {
  name: string;
  branch?: string | null;
  cuisine?: string | null;
  description?: string | null;
  phone?: string | null;
  address?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  external_reference?: string | null;
  is_active?: boolean;
  allow_duplicate?: boolean;
}

export interface ModifierInput {
  name: string;
  additional_price: string;
  is_available?: boolean;
}

export interface ModifierGroupInput {
  name: string;
  minimum_selections: number;
  maximum_selections: number;
  is_required: boolean;
  modifiers: ModifierInput[];
}

export interface MenuItemInput {
  category_id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  base_price: string;
  is_available: boolean;
  modifier_groups?: ModifierGroupInput[];
}

export function useRestaurants(q = '', active?: boolean) {
  return useQuery({
    queryKey: [...qk.restaurants(q), active ?? 'any'],
    queryFn: async () =>
      (
        await api.get<Page<RestaurantListItem>>('/restaurants', {
          params: { q: q || undefined, active, limit: 200 },
        })
      ).data,
    placeholderData: (previous) => previous,
  });
}

export function useRestaurant(id: string) {
  return useQuery({
    queryKey: qk.restaurant(id),
    queryFn: async () => (await api.get<Restaurant>(`/restaurants/${id}`)).data,
    enabled: !!id,
  });
}

export function useRestaurantMenu(id: string) {
  return useQuery({
    queryKey: qk.restaurantMenu(id),
    queryFn: async () => (await api.get<Menu>(`/restaurants/${id}/menu`)).data,
    enabled: !!id,
  });
}

export function useMenuItem(id: string | undefined) {
  return useQuery({
    queryKey: qk.menuItem(id ?? ''),
    queryFn: async () => (await api.get<MenuItem>(`/items/${id}`)).data,
    enabled: !!id,
  });
}

function useInvalidateRestaurant(id?: string) {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: ['admin', 'restaurants'] });
    if (id) client.invalidateQueries({ queryKey: qk.restaurant(id) });
    client.invalidateQueries({ queryKey: ['admin', 'item'] });
    client.invalidateQueries({ queryKey: qk.todayMenu });
  };
}

export function useSaveRestaurant(id?: string) {
  const invalidate = useInvalidateRestaurant(id);
  return useMutation({
    mutationFn: async (input: RestaurantInput) =>
      id
        ? (await api.patch<Restaurant>(`/restaurants/${id}`, input)).data
        : (await api.post<Restaurant>('/restaurants', input)).data,
    onSuccess: invalidate,
  });
}

export function useCreateCategory(restaurantId: string) {
  const invalidate = useInvalidateRestaurant(restaurantId);
  return useMutation({
    mutationFn: async (name: string) => (await api.post(`/restaurants/${restaurantId}/categories`, { name })).data,
    onSuccess: invalidate,
  });
}

export function useUpdateCategory(restaurantId: string) {
  const invalidate = useInvalidateRestaurant(restaurantId);
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; display_order?: number }) =>
      (await api.patch(`/categories/${input.id}`, { name: input.name, display_order: input.display_order })).data,
    onSuccess: invalidate,
  });
}

export function useDeleteCategory(restaurantId: string) {
  const invalidate = useInvalidateRestaurant(restaurantId);
  return useMutation({
    mutationFn: async (input: { id: string; archiveItems: boolean }) =>
      api.delete(`/categories/${input.id}`, { params: { archive_items: input.archiveItems } }),
    onSuccess: invalidate,
  });
}

export function useSaveMenuItem(restaurantId: string, itemId?: string) {
  const invalidate = useInvalidateRestaurant(restaurantId);
  return useMutation({
    mutationFn: async (input: MenuItemInput) => {
      if (itemId) {
        const { modifier_groups: _ignored, ...rest } = input;
        return (await api.patch<MenuItem>(`/items/${itemId}`, rest)).data;
      }
      return (await api.post<MenuItem>(`/restaurants/${restaurantId}/items`, input)).data;
    },
    onSuccess: invalidate,
  });
}

export function useToggleItemAvailability(restaurantId: string) {
  const invalidate = useInvalidateRestaurant(restaurantId);
  return useMutation({
    mutationFn: async (input: { id: string; is_available: boolean }) =>
      (await api.patch<MenuItem>(`/items/${input.id}`, { is_available: input.is_available })).data,
    onSuccess: invalidate,
  });
}

export function useArchiveItem(restaurantId: string) {
  const invalidate = useInvalidateRestaurant(restaurantId);
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/items/${id}`),
    onSuccess: invalidate,
  });
}

export function useModifierMutations(restaurantId: string, itemId: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateRestaurant(restaurantId);
  const onSuccess = (item: MenuItem) => {
    client.setQueryData(qk.menuItem(itemId), item);
    invalidate();
  };
  return {
    addGroup: useMutation({
      mutationFn: async (input: ModifierGroupInput) =>
        (await api.post<MenuItem>(`/items/${itemId}/modifier-groups`, input)).data,
      onSuccess,
    }),
    updateGroup: useMutation({
      mutationFn: async (input: { id: string } & Partial<Omit<ModifierGroupInput, 'modifiers'>>) => {
        const { id, ...body } = input;
        return (await api.patch<MenuItem>(`/modifier-groups/${id}`, body)).data;
      },
      onSuccess,
    }),
    deleteGroup: useMutation({
      mutationFn: async (id: string) => (await api.delete<MenuItem>(`/modifier-groups/${id}`)).data,
      onSuccess,
    }),
    addModifier: useMutation({
      mutationFn: async (input: { groupId: string } & ModifierInput) => {
        const { groupId, ...body } = input;
        return (await api.post<MenuItem>(`/modifier-groups/${groupId}/modifiers`, body)).data;
      },
      onSuccess,
    }),
    updateModifier: useMutation({
      mutationFn: async (input: { id: string } & Partial<ModifierInput>) => {
        const { id, ...body } = input;
        return (await api.patch<MenuItem>(`/modifiers/${id}`, body)).data;
      },
      onSuccess,
    }),
    deleteModifier: useMutation({
      mutationFn: async (id: string) => (await api.delete<MenuItem>(`/modifiers/${id}`)).data,
      onSuccess,
    }),
  };
}

// ---- Menu imports ---------------------------------------------------------------

export function useMenuImports(restaurantId: string) {
  return useQuery({
    queryKey: qk.imports(restaurantId),
    queryFn: async () => (await api.get<MenuImport[]>(`/restaurants/${restaurantId}/menu/imports`)).data,
    enabled: !!restaurantId,
    refetchInterval: (query) =>
      query.state.data?.some((i) => i.status === 'PROCESSING') ? 2_000 : false,
  });
}

export function useMenuImport(restaurantId: string, importId: string) {
  return useQuery({
    queryKey: qk.menuImport(restaurantId, importId),
    queryFn: async () =>
      (await api.get<MenuImportDetail>(`/restaurants/${restaurantId}/menu/imports/${importId}`)).data,
    enabled: !!restaurantId && !!importId,
    refetchInterval: (query) => (query.state.data?.status === 'PROCESSING' ? 1_500 : false),
  });
}

export interface UploadableFile {
  uri: string;
  name: string;
  mimeType?: string | null;
  /** Web only: the browser File object. */
  file?: File | null;
}

export async function appendFile(form: FormData, field: string, file: UploadableFile): Promise<void> {
  if (file.file) {
    form.append(field, file.file, file.name);
    return;
  }
  if (file.uri.startsWith('blob:') || file.uri.startsWith('data:')) {
    const blob = await (await fetch(file.uri)).blob();
    form.append(field, blob, file.name);
    return;
  }
  // React Native FormData file descriptor
  form.append(field, { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/octet-stream' } as unknown as Blob);
}

export function useUploadMenu(restaurantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: UploadableFile; force?: boolean }) => {
      const form = new FormData();
      await appendFile(form, 'file', input.file);
      form.append('force', input.force ? 'true' : 'false');
      return (
        await api.post<MenuImport>(`/restaurants/${restaurantId}/menu/import`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120_000,
        })
      ).data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.imports(restaurantId) }),
  });
}

export function useImportMutations(restaurantId: string, importId: string) {
  const client = useQueryClient();
  const setDetail = (data: MenuImportDetail) => {
    client.setQueryData(qk.menuImport(restaurantId, importId), data);
    client.invalidateQueries({ queryKey: qk.imports(restaurantId) });
  };
  return {
    saveDraft: useMutation({
      mutationFn: async (items: DraftItem[]) =>
        (await api.patch<MenuImportDetail>(`/restaurants/${restaurantId}/menu/imports/${importId}`, { items })).data,
      onSuccess: setDetail,
    }),
    approve: useMutation({
      mutationFn: async (input: { mode: 'replace' | 'merge'; confirm_replace: boolean }) =>
        (await api.post<MenuImportDetail>(`/restaurants/${restaurantId}/menu/imports/${importId}/approve`, input)).data,
      onSuccess: (data) => {
        setDetail(data);
        client.invalidateQueries({ queryKey: qk.restaurantMenu(restaurantId) });
        client.invalidateQueries({ queryKey: ['admin', 'restaurants'] });
      },
    }),
    reject: useMutation({
      mutationFn: async () =>
        (await api.post<MenuImport>(`/restaurants/${restaurantId}/menu/imports/${importId}/reject`)).data,
      onSuccess: () => client.invalidateQueries({ queryKey: qk.imports(restaurantId) }),
    }),
  };
}

export function useUploadImage() {
  return useMutation({
    mutationFn: async (input: { file: UploadableFile; kind?: 'images' | 'restaurants' | 'items' }) => {
      const form = new FormData();
      await appendFile(form, 'file', input.file);
      return (
        await api.post<{ url: string }>('/uploads/images', form, {
          params: { kind: input.kind ?? 'images' },
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60_000,
        })
      ).data;
    },
  });
}
