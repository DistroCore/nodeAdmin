import { useMemo } from 'react';
import { ApiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/useAuthStore';

export function useApiClient(): ApiClient {
  const apiBaseUrl = useMemo(() => {
    const envApiBaseUrl = (import.meta.env.VITE_CORE_API_BASE_URL as string | undefined)?.trim();
    if (envApiBaseUrl) {
      return envApiBaseUrl;
    }

    return `http://${window.location.hostname}:3001`;
  }, []);

  return useMemo(() => {
    return new ApiClient({
      baseUrl: apiBaseUrl,
      getAccessToken: () => useAuthStore.getState().accessToken,
    });
  }, [apiBaseUrl]);
}
