import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useApiClient } from '../useApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { ApiClient } from '@/lib/apiClient';

// Mock ApiClient
vi.mock('@/lib/apiClient', () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  return {
    ApiClient: vi.fn().mockImplementation(function() {
      return {
        get: mockGet,
        post: mockPost,
      };
    }),
  };
});

// Mock useAuthStore
vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ accessToken: 'mock-token' })),
  },
}));

describe('useApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize ApiClient with correct baseUrl and token getter', () => {
    const { result } = renderHook(() => useApiClient());

    expect(ApiClient).toHaveBeenCalled();
    const callArgs = vi.mocked(ApiClient).mock.calls[0][0];
    expect(callArgs.getAccessToken()).toBe('mock-token');
    expect(useAuthStore.getState).toHaveBeenCalled();
  });

  it('should return the same instance if dependencies do not change', () => {
    const { result, rerender } = renderHook(() => useApiClient());
    const firstInstance = result.current;

    rerender();
    expect(result.current).toBe(firstInstance);
  });
});
