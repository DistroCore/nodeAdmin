import type { AppPermission } from '@nodeadmin/shared-types';

export interface NavItem {
  icon: string;
  key: string;
  labelId: string;
  path: string;
  permission: AppPermission;
}

export const navItems: NavItem[] = [
  {
    icon: 'bar',
    key: 'overview',
    labelId: 'nav.overview',
    path: '/overview',
    permission: 'overview:view',
  },
  { icon: 'chat', key: 'im', labelId: 'nav.im', path: '/im', permission: 'im:view' },
  {
    icon: 'users',
    key: 'tenant',
    labelId: 'nav.tenants',
    path: '/tenant',
    permission: 'tenant:view',
  },
  {
    icon: 'rocket',
    key: 'release',
    labelId: 'nav.release',
    path: '/release',
    permission: 'release:view',
  },
  {
    icon: 'gear',
    key: 'settings',
    labelId: 'nav.settings',
    path: '/settings',
    permission: 'settings:view',
  },
];

export function isNavItemActive(pathname: string, navPath: string): boolean {
  return pathname === navPath || pathname.startsWith(`${navPath}/`);
}

export function resolveCurrentPageTitle(pathname: string): string {
  if (pathname === '/') return 'nav.overview';
  const matched = navItems.find((item) => isNavItemActive(pathname, item.path));
  return matched?.labelId ?? 'brand';
}
