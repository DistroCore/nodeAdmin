import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import { NavLink, useLocation } from 'react-router-dom';
import { className } from '@/Lib/className';
import { usePermissionStore } from '@/Stores/usePermissionStore';
import { useUiStore } from '@/Stores/useUiStore';
import { isNavItemActive, navItems } from './navConfig';
import { NavIcon } from './navIcon';

export function Sidebar(): JSX.Element {
  const location = useLocation();
  const { formatMessage: t } = useIntl();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const mobileMenuOpen = useUiStore((s) => s.mobileMenuOpen);
  const setMobileMenuOpen = useUiStore((s) => s.setMobileMenuOpen);
  const hasPermission = usePermissionStore((s) => s.hasPermission);

  const visibleNavItems = navItems.filter((item) => hasPermission(item.permission));

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
        ? 'bg-accent text-accent-foreground'
        : 'hover:bg-[hsl(var(--sidebar-accent))]',
    );
  }

  const sidebarBase =
    'flex shrink-0 flex-col border-r bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-all duration-200';

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
      <nav className="flex-1 space-y-1 p-2">
        {visibleNavItems.map((item) => (
          <NavLink
            className={({ isActive }) => linkClass(isNavItemActive(location.pathname, item.path) || isActive)}
            key={item.key}
            onClick={() => setMobileMenuOpen(false)}
            to={item.path}
          >
            <NavIcon name={item.icon} />
            {!sidebarCollapsed ? (
              <span className="truncate">{t({ id: item.labelId })}</span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-2">
        <p className="mb-2 text-center text-xs text-muted-foreground">{t({ id: 'version' })}</p>
        <button
          className="hidden md:flex h-9 w-full items-center justify-center rounded-md border border-border bg-card text-sm transition-colors hover:bg-accent"
          onClick={toggleSidebar}
          type="button"
        >
          {sidebarCollapsed ? '\u00BB' : '\u00AB'}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={className(
          sidebarBase,
          'hidden md:flex',
          sidebarCollapsed ? 'w-16' : 'w-60',
        )}
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
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {navContent}
      </aside>
    </>
  );
}
