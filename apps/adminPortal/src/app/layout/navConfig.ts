import type { AppPermission } from '@nodeadmin/shared-types';

export interface NavItem {
  icon: string;
  key: string;
  labelId: string;
  path: string;
  permission: AppPermission;
  pluginCode?: string;
}

export const navItems: NavItem[] = [
  {
    icon: 'bar',
    key: 'overview',
    labelId: 'nav.overview',
    path: '/overview',
    permission: 'overview:view',
  },
  {
    icon: 'chat',
    key: 'im',
    labelId: 'nav.im',
    path: '/im',
    permission: 'im:view',
  },
  {
    icon: 'users',
    key: 'users',
    labelId: 'nav.users',
    path: '/users',
    permission: 'users:view',
  },
  {
    icon: 'shield',
    key: 'roles',
    labelId: 'nav.roles',
    path: '/roles',
    permission: 'roles:view',
  },
  {
    icon: 'shield',
    key: 'audit',
    labelId: 'nav.audit',
    path: '/audit',
    permission: 'audit:view',
  },
  {
    icon: 'bell',
    key: 'notifications',
    labelId: 'nav.notifications',
    path: '/notifications',
    permission: 'audit:view',
  },
  {
    icon: 'bar',
    key: 'metrics',
    labelId: 'nav.metrics',
    path: '/metrics',
    permission: 'audit:view',
  },
  {
    icon: 'menuIcon',
    key: 'menus',
    labelId: 'nav.menus',
    path: '/menus',
    permission: 'menus:view',
  },
  {
    icon: 'users',
    key: 'tenant',
    labelId: 'nav.tenants',
    path: '/tenants',
    permission: 'tenants:view',
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

// Routes that aren't in the sidebar navItems but still need a header title (plugin management +
// profile). Dynamic plugin UI routes (/plugins/<name>) are resolved from the DB menu tree by the
// header instead.
const STATIC_PAGE_TITLES: Array<[string, string]> = [
  ['/plugins/marketplace', 'nav.marketplace'],
  ['/plugins/installed', 'nav.installed'],
  ['/plugins/settings', 'nav.installed'],
  ['/profile', 'profile.title'],
];

export function resolveCurrentPageTitle(pathname: string): string {
  if (pathname === '/') return 'nav.overview';
  for (const [prefix, id] of STATIC_PAGE_TITLES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return id;
  }
  const matched = navItems.find((item) => isNavItemActive(pathname, item.path));
  return matched?.labelId ?? 'brand';
}
