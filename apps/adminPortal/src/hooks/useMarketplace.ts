import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import type {
  MarketplaceResponse,
  PluginRegistryDetail,
  PluginInstallResponse,
  PluginUpdateResponse,
} from '@nodeadmin/shared-types';
import { useApiClient } from './useApiClient';
import { useToast } from '@/components/ui/toast';

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
  const toast = useToast();
  const { formatMessage: t } = useIntl();

  const install = useMutation({
    mutationFn: (data: { pluginId: string; version?: string }) =>
      apiClient.post<PluginInstallResponse>('/api/v1/admin/plugins/install', data),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(
          t({ id: 'plugins.install.success', defaultMessage: 'Plugin installed successfully' }),
          t(
            { id: 'plugins.install.success_desc', defaultMessage: 'Version {version} is now available.' },
            { version: data.installedVersion },
          ),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['tenantPlugins'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
    onError: (error: Error) => {
      toast.error(
        t({ id: 'plugins.install.error', defaultMessage: 'Failed to install plugin' }),
        error.message || t({ id: 'common.error.unknown', defaultMessage: 'An unexpected error occurred.' })
      );
    }
  });

  const uninstall = useMutation({
    mutationFn: (id: string) =>
      apiClient.del<{ success: boolean; pluginId: string }>(`/api/v1/admin/plugins/${encodeURIComponent(id)}`),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(t({ id: 'plugins.uninstall.success', defaultMessage: 'Plugin uninstalled successfully' }));
      }
      queryClient.invalidateQueries({ queryKey: ['tenantPlugins'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
    onError: (error: Error) => {
      toast.error(
        t({ id: 'plugins.uninstall.error', defaultMessage: 'Failed to uninstall plugin' }),
        error.message || t({ id: 'common.error.unknown', defaultMessage: 'An unexpected error occurred.' })
      );
    }
  });

  const update = useMutation({
    mutationFn: (data: { id: string; version: string }) =>
      apiClient.post<PluginUpdateResponse>(`/api/v1/admin/plugins/${encodeURIComponent(data.id)}/update`, {
        version: data.version,
      }),
    onSuccess: (data) => {
      toast.success(
        t({ id: 'plugins.update.success', defaultMessage: 'Plugin updated successfully' }),
        t({ id: 'plugins.update.success_desc', defaultMessage: 'Updated to version {version}.' }, { version: data.updatedVersion })
      );
      queryClient.invalidateQueries({ queryKey: ['tenantPlugins'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
    onError: (error: Error) => {
      toast.error(
        t({ id: 'plugins.update.error', defaultMessage: 'Failed to update plugin' }),
        error.message || t({ id: 'common.error.unknown', defaultMessage: 'An unexpected error occurred.' })
      );
    }
  });

  const updateConfig = useMutation({
    mutationFn: (data: { id: string; config: Record<string, unknown> }) =>
      apiClient.patch<{ success: boolean }>(`/api/v1/admin/plugins/${encodeURIComponent(data.id)}/config`, {
        config: data.config,
      }),
    onSuccess: () => {
      toast.success(t({ id: 'plugins.config.success', defaultMessage: 'Configuration saved successfully' }));
      queryClient.invalidateQueries({ queryKey: ['tenantPlugins'] });
    },
    onError: (error: Error) => {
      toast.error(
        t({ id: 'plugins.config.error', defaultMessage: 'Failed to save configuration' }),
        error.message || t({ id: 'common.error.unknown', defaultMessage: 'An unexpected error occurred.' }),
      );
    },
  });

  const toggleEnabled = useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<{ success: boolean; enabled: boolean }>(`/api/v1/admin/plugins/${encodeURIComponent(id)}/toggle`, {}),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(
          t(
            { id: 'plugins.toggle.success', defaultMessage: 'Plugin {status} successfully' },
            { status: data.enabled ? 'enabled' : 'disabled' },
          ),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['tenantPlugins'] });
    },
    onError: (error: Error) => {
      toast.error(
        t({ id: 'plugins.toggle.error', defaultMessage: 'Failed to update plugin status' }),
        error.message || t({ id: 'common.error.unknown', defaultMessage: 'An unexpected error occurred.' }),
      );
    },
  });

  return { install, uninstall, update, updateConfig, toggleEnabled };
  }
