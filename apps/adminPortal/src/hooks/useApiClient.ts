import { useMemo } from 'react';
import { ApiClient } from '@/lib/apiClient';
import { useAuthStore, setTokens, clearAuthStore } from '@/stores/useAuthStore';

export function useApiClient(): ApiClient {
  const apiBaseUrl = useMemo(() => {
    return (import.meta.env.VITE_CORE_API_BASE_URL as string | undefined)?.trim() || '';
  }, []);

  return useMemo(() => {
    return new ApiClient({
      baseUrl: apiBaseUrl,
      getAccessToken: () => useAuthStore.getState().accessToken,
      getRefreshToken: () => useAuthStore.getState().refreshToken,
      onTokenRefreshed: (accessToken, refreshToken) => setTokens(accessToken, refreshToken),
      onLogout: () => clearAuthStore(),
    });
  }, [apiBaseUrl]);
}
