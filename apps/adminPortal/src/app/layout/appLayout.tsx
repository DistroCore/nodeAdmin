import { useEffect, type ReactNode } from 'react';
import { useApiClient } from '@/hooks/useApiClient';
import { usePlugins } from '@/hooks/usePlugins';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMenuStore } from '@/stores/useMenuStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { useUiStore } from '@/stores/useUiStore';
import { logger } from '@/lib/logger';
import type { MenuItem } from '@nodeadmin/shared-types';
import { Header } from './header';
import { Sidebar } from './sidebar';

export function AppLayout({ children }: { children: ReactNode }): JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const setPermissionsFromRoles = usePermissionStore((s) => s.setPermissionsFromRoles);
  const apiClient = useApiClient();
  const userId = useAuthStore((s) => s.userId);
  const tenantId = useAuthStore((s) => s.tenantId);
  const setMenus = useMenuStore((s) => s.setMenus);

  // Use the plugin hook to fetch and sync plugins to store
  usePlugins();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const roles = useAuthStore.getState().userRoles;
    if (roles.length > 0) {
      setPermissionsFromRoles(roles);
      return;
    }
    // Dev fallback when no roles in auth store (e.g. dev mode without login)
    const rolesRaw = (import.meta.env.VITE_IM_ROLES as string | undefined)?.trim();
    const fallback = rolesRaw
      ? rolesRaw
          .split(',')
          .map((r) => r.trim())
          .filter((r) => r.length > 0)
      : ['admin'];
    setPermissionsFromRoles(fallback);
  }, [setPermissionsFromRoles]);

  useEffect(() => {
    if (userId && tenantId) {
      apiClient
        .get<MenuItem[]>(`/api/v1/menus/user/${userId}?tenantId=${tenantId}`)
        .then((menus) => {
          setMenus(menus);
        })
        .catch((err) => {
          logger.error('AppLayout', 'Failed to fetch menus', err);
        });
    }
  }, [userId, tenantId, apiClient, setMenus]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
