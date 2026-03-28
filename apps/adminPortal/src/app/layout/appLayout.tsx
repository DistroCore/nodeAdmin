import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { useUiStore } from '@/stores/useUiStore';
import { Header } from './header';
import { Sidebar } from './sidebar';

export function AppLayout({ children }: { children: ReactNode }): JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const setPermissionsFromRoles = usePermissionStore((s) => s.setPermissionsFromRoles);

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
