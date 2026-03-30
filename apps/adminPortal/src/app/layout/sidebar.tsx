import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import { NavLink, useLocation } from 'react-router-dom';
import { className } from '@/lib/className';
import { useMenuStore } from '@/stores/useMenuStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { useUiStore } from '@/stores/useUiStore';
import { isNavItemActive, navItems } from './navConfig';
import { NavIcon } from './navIcon';

export function Sidebar(): JSX.Element {
  const location = useLocation();
  const { formatMessage: t } = useIntl();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const mobileMenuOpen = useUiStore((s) => s.mobileMenuOpen);
  const setMobileMenuOpen = useUiStore((s) => s.setMobileMenuOpen);
  const permissions = usePermissionStore((s) => s.permissions);
  const menus = useMenuStore((s) => s.menus);
  const menusLoaded = useMenuStore((s) => s.loaded);

  const visibleNavItems = navItems.filter((item) => permissions[item.permission]);

  // Auto-collapse sidebar on tablet (768–1023px)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    if (mql.matches) {
      useUiStore.getState().toggleSidebar();
    }
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        useUiStore.setState({ sidebarCollapsed: true });
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  function linkClass(isActive: boolean): string {
    return className(
      'flex h-10 items-center rounded-md text-sm font-medium transition-colors',
      sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
      isActive
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'hover:bg-[hsl(var(--sidebar-accent))]'
    );
  }

  const sidebarBase =
    'flex shrink-0 flex-col border-r bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-all duration-200';

  function renderMenuItem(
    menu: {
      icon: string;
      name: string;
      path: string;
      children?: { icon: string; name: string; path: string }[];
    },
    depth = 0
  ): JSX.Element {
    const hasChildren = menu.children && menu.children.length > 0;
    const isActive = isNavItemActive(location.pathname, menu.path);

    return (
      <div key={menu.path + menu.name}>
        <NavLink
          className={() => linkClass(isActive)}
          onClick={() => setMobileMenuOpen(false)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          to={menu.path}
        >
          <NavIcon name={menu.icon} />
          {!sidebarCollapsed ? <span className="truncate">{menu.name}</span> : null}
        </NavLink>
        {hasChildren && !sidebarCollapsed
          ? menu.children!.map((child) => renderMenuItem(child, depth + 1))
          : null}
      </div>
    );
  }

  const navContent = (
    <>
      {/* Brand */}
      <div className="flex h-14 items-center border-b px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
          NA
        </div>
        {!sidebarCollapsed ? (
          <span className="ml-3 text-sm font-semibold">{t({ id: 'brand' })}</span>
        ) : null}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {menusLoaded && menus.length > 0
          ? menus.map((menu) => renderMenuItem(menu))
          : visibleNavItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  linkClass(isNavItemActive(location.pathname, item.path) || isActive)
                }
                key={item.key}
                onClick={() => setMobileMenuOpen(false)}
                to={item.path}
              >
                <NavIcon name={item.icon} />
                {!sidebarCollapsed ? (
                  <span className="truncate">{t({ id: item.labelId })}</span>
                ) : null}
                {sidebarCollapsed ? (
                  <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block">
                    {t({ id: item.labelId })}
                  </span>
                ) : null}
              </NavLink>
            ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-2">
        <NavLink
          className={({ isActive }) =>
            className(
              'flex h-9 items-center rounded-md text-sm transition-colors hover:bg-accent',
              sidebarCollapsed ? 'justify-center px-2' : 'gap-2 px-3',
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
            )
          }
          to="/profile"
          onClick={() => setMobileMenuOpen(false)}
        >
          <svg
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="7" r="4" />
          </svg>
          {!sidebarCollapsed ? (
            <span className="truncate">{t({ id: 'profile.title' })}</span>
          ) : null}
        </NavLink>
        <p className="mb-2 text-center text-xs text-muted-foreground">{t({ id: 'version' })}</p>
        <button
          aria-label={sidebarCollapsed ? t({ id: 'menu.open' }) : t({ id: 'settings.sidebarCollapsed' })}
          className="hidden md:flex h-9 w-full items-center justify-center rounded-md border border-border bg-card text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          onClick={toggleSidebar}
          type="button"
        >
          {sidebarCollapsed ? (
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={className(sidebarBase, 'hidden md:flex', sidebarCollapsed ? 'w-16' : 'w-60')}
      >
        {navContent}
      </aside>

      {/* Mobile drawer overlay */}
      {mobileMenuOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
      <aside
        className={className(
          sidebarBase,
          'fixed inset-y-0 left-0 z-40 w-72 md:hidden transition-transform duration-200',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {navContent}
      </aside>
    </>
  );
}
