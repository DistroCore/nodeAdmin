import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  setAccessToken: (accessToken: string | null) => void;
  setTenantId: (tenantId: string) => void;
  setUserId: (userId: string) => void;
  tenantId: string | null;
  userId: string | null;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  setAccessToken: (accessToken) => set({ accessToken }),
  setTenantId: (tenantId) => set({ tenantId }),
  setUserId: (userId) => set({ userId }),
  tenantId: null,
  userId: null,
}));
