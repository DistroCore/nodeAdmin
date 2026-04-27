import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  isAuthenticated: boolean;
  refreshToken: string | null;
  setAccessToken: (accessToken: string | null) => void;
  setTenantId: (tenantId: string) => void;
  setUserId: (userId: string) => void;
  tenantId: string | null;
  userId: string | null;
  userName: string | null;
  userRoles: string[];
}

const STORED_AUTH_KEY = 'nodeadmin_auth';

function loadStoredAuth(): Partial<AuthState> {
  try {
    const raw = localStorage.getItem(STORED_AUTH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      accessToken: (parsed.accessToken as string) ?? null,
      isAuthenticated: Boolean(parsed.accessToken),
      refreshToken: (parsed.refreshToken as string) ?? null,
      tenantId: (parsed.tenantId as string) ?? null,
      userId: (parsed.userId as string) ?? null,
      userName: (parsed.userName as string) ?? null,
      userRoles: (parsed.userRoles as string[]) ?? [],
    };
  } catch {
    return {};
  }
}

function persistAuth(state: Partial<AuthState>): void {
  try {
    localStorage.setItem(
      STORED_AUTH_KEY,
      JSON.stringify({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        tenantId: state.tenantId,
        userId: state.userId,
        userName: state.userName,
        userRoles: state.userRoles,
      }),
    );
  } catch {
    // localStorage unavailable
  }
}

function clearAuth(): void {
  localStorage.removeItem(STORED_AUTH_KEY);
}

const stored = loadStoredAuth();

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: stored.accessToken ?? null,
  isAuthenticated: stored.isAuthenticated ?? false,
  refreshToken: stored.refreshToken ?? null,
  tenantId: stored.tenantId ?? null,
  userId: stored.userId ?? null,
  userName: stored.userName ?? null,
  userRoles: stored.userRoles ?? [],
  setAccessToken: (accessToken) => {
    const state: Partial<AuthState> = {
      accessToken,
      isAuthenticated: Boolean(accessToken),
    };
    set(state);
    persistAuth({ ...useAuthStore.getState(), ...state });
  },
  setTenantId: (tenantId) => {
    set({ tenantId });
    persistAuth({ ...useAuthStore.getState(), tenantId });
  },
  setUserId: (userId) => {
    set({ userId });
    persistAuth({ ...useAuthStore.getState(), userId });
  },
}));

export function setTokens(accessToken: string, refreshToken: string): void {
  const state: Partial<AuthState> = {
    accessToken,
    refreshToken,
    isAuthenticated: true,
  };
  useAuthStore.setState(state);
  persistAuth({ ...useAuthStore.getState(), ...state });
}

/** Matches the actual API response shape: { identity, accessToken, refreshToken, tokenType } */
export function setAuthFromLogin(data: {
  accessToken: string;
  identity: { roles?: string[]; tenantId: string; userId: string };
  name?: string | null;
  refreshToken: string;
}): void {
  const state: Partial<AuthState> = {
    accessToken: data.accessToken,
    isAuthenticated: true,
    refreshToken: data.refreshToken,
    tenantId: data.identity.tenantId,
    userId: data.identity.userId,
    userName: data.name ?? null,
    userRoles: data.identity.roles ?? [],
  };
  useAuthStore.setState(state);
  persistAuth({ ...useAuthStore.getState(), ...state });
}

export function clearAuthStore(): void {
  useAuthStore.setState({
    accessToken: null,
    isAuthenticated: false,
    refreshToken: null,
    tenantId: null,
    userId: null,
    userName: null,
    userRoles: [],
  });
  clearAuth();
}
