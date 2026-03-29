import { useMemo } from 'react';
import { ApiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/useAuthStore';

export function useApiClient(): ApiClient {
  const apiBaseUrl = useMemo(() => {
    const envApiBaseUrl = (import.meta.env.VITE_CORE_API_BASE_URL as string | undefined)?.trim();
    if (envApiBaseUrl) {
      return envApiBaseUrl;
    }

    // In dev mode, use relative path so Vite proxy handles /api requests
    if (import.meta.env.DEV) {
      return '';
    }

    return `http://${window.location.hostname}:11451`;
  }, []);

  return useMemo(() => {
    return new ApiClient({
      baseUrl: apiBaseUrl,
      getAccessToken: () => useAuthStore.getState().accessToken,
    });
  }, [apiBaseUrl]);
}
