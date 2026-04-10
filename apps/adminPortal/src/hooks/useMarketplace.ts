import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  MarketplaceResponse,
  PluginRegistryDetail,
  PluginInstallResponse,
  PluginUpdateResponse,
} from '@nodeadmin/shared-types';
import { useApiClient } from './useApiClient';

export function useMarketplace(page = 1, pageSize = 20, search = '') {
  const apiClient = useApiClient();

  const query = useQuery({
    queryKey: ['marketplace', page, pageSize, search],
    queryFn: () =>
      apiClient.get<MarketplaceResponse>(
        `/api/v1/admin/plugins?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`,
      ),
  });

  return query;
}

export function usePluginDetail(id: string) {
  const apiClient = useApiClient();

  const query = useQuery({
    queryKey: ['pluginDetail', id],
    queryFn: () => apiClient.get<PluginRegistryDetail>(`/api/v1/admin/plugins/${encodeURIComponent(id)}`),
    enabled: !!id,
  });

  return query;
}

export function usePluginManagement() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const install = useMutation({
    mutationFn: (data: { pluginId: string; version?: string }) =>
      apiClient.post<PluginInstallResponse>('/api/v1/admin/plugins/install', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantPlugins'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });

  const uninstall = useMutation({
    mutationFn: (id: string) => apiClient.del<{ success: boolean }>(`/api/v1/admin/plugins/${encodeURIComponent(id)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantPlugins'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });

  const update = useMutation({
    mutationFn: (data: { id: string; version: string }) =>
      apiClient.post<PluginUpdateResponse>(`/api/v1/admin/plugins/${encodeURIComponent(data.id)}/update`, {
        version: data.version,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantPlugins'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });

  const updateConfig = useMutation({
    mutationFn: (data: { id: string; config: Record<string, unknown> }) =>
      apiClient.patch<{ success: boolean }>(`/api/v1/admin/plugins/${encodeURIComponent(data.id)}/config`, {
        config: data.config,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantPlugins'] });
    },
  });

  return { install, uninstall, update, updateConfig };
}
