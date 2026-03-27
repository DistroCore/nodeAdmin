import { useEffect, type ReactNode } from 'react';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { useUiStore } from '@/stores/useUiStore';
import { Header } from './header';
import { Sidebar } from './sidebar';

function readRolesFromEnv(): string[] {
  const rolesRaw = (import.meta.env.VITE_IM_ROLES as string | undefined)?.trim();
  if (!rolesRaw) return ['tenant:admin'];
  const roles = rolesRaw
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return roles.length > 0 ? roles : ['tenant:admin'];
}

export function AppLayout({ children }: { children: ReactNode }): JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const setPermissionsFromRoles = usePermissionStore((s) => s.setPermissionsFromRoles);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    setPermissionsFromRoles(readRolesFromEnv());
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
