import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { NavLink, useLocation } from 'react-router-dom';
import { className } from '@/lib/className';
import { logger } from '@/lib/logger';
import { useMenuStore } from '@/stores/useMenuStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { usePluginStore } from '@/stores/usePluginStore';
import { useUiStore } from '@/stores/useUiStore';
import type { MenuItem, AppPermission } from '@nodeadmin/shared-types';
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
  // Subscribed for reactivity: plugin menus gate on dynamically-delivered plugin permission codes.
  const pluginPermissions = usePermissionStore((s) => s.pluginPermissions);
  const menus = useMenuStore((s) => s.menus);
  const menusLoaded = useMenuStore((s) => s.loaded);
  const enabledPlugins = usePluginStore((s) => s.enabledPlugins);
  const plugins = usePluginStore((s) => s.plugins);

  const [userToggled, setUserToggled] = useState<Record<string, boolean>>({});

  // Auto-expand groups that have children; merge with user toggles
  const expandedGroups = useMemo<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {};
    for (const menu of menus) {
      if (menu.children && menu.children.length > 0) {
        result[menu.id] = true;
      }
    }
    return { ...result, ...userToggled };
  }, [menus, userToggled]);

  const toggleGroup = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUserToggled((prev) => ({ ...prev, [id]: !expandedGroups[id] }));
  };

  // When collapsed, a group's children can't render inline — clicking the group
  // icon expands the rail so the (auto-expanded) children become reachable.
  const onGroupClick = (id: string, e: React.MouseEvent) => {
    if (sidebarCollapsed) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
      return;
    }
    toggleGroup(id, e);
  };

  const visibleNavItems = navItems.filter((item) => permissions[item.permission]);

  // Don't fail silently: if menus loaded but came back empty, we're rendering the static
  // navConfig fallback — usually a tenant / role-menu misconfiguration worth surfacing.
  useEffect(() => {
    if (menusLoaded && menus.length === 0) {
      logger.warn(
        'Sidebar',
        'Menu tree is empty after load — using static navigation fallback. Check tenant / role-menu configuration.',
      );
    }
  }, [menusLoaded, menus.length]);

  function linkClass(isActive: boolean): string {
    return className(
      'group relative flex h-10 items-center rounded-md text-sm font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
      isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-[hsl(var(--sidebar-accent))]',
    );
  }

  // Native title tooltip when collapsed — never clipped by the nav's overflow,
  // positioned by the browser. Avoids the custom popover that broke when collapsed.
  const tip = (label: string): string | undefined => (sidebarCollapsed ? label : undefined);

  const sidebarBase =
    'flex shrink-0 flex-col border-r bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-all duration-200';

  function renderMenuItem(menu: MenuItem, depth = 0): JSX.Element | null {
    // Core codes resolve against the role-derived map; plugin codes (e.g. backlog:view) resolve
    // against the dynamically-delivered plugin permission set.
    const code = menu.permission_code;
    if (code && !permissions[code as AppPermission] && !pluginPermissions.has(code)) {
      return null;
    }

    if (menu.plugin_code && !enabledPlugins.includes(menu.plugin_code)) {
      return null;
    }

    const hasChildren = menu.children && menu.children.length > 0;
    const isExpanded = expandedGroups[menu.id];
    const isActive = isNavItemActive(location.pathname, menu.path);
    const displayName = t({ id: menu.name, defaultMessage: menu.name });

    return (
      <div key={menu.id}>
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={sidebarCollapsed ? displayName : undefined}
            title={tip(displayName)}
            className={className(linkClass(isActive), 'w-full cursor-pointer text-left')}
            onClick={(e) => onGroupClick(menu.id, e)}
            style={{ paddingLeft: !sidebarCollapsed ? `${depth * 12 + 12}px` : undefined }}
          >
            <NavIcon name={menu.icon} />
            {!sidebarCollapsed ? (
              <>
                <span className="flex-1 truncate">{displayName}</span>
                <svg
                  className={className('h-4 w-4 transition-transform', isExpanded ? 'rotate-90' : '')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            ) : null}
          </button>
        ) : (
          <NavLink
            aria-label={sidebarCollapsed ? displayName : undefined}
            title={tip(displayName)}
            className={() => linkClass(isActive)}
            onClick={() => setMobileMenuOpen(false)}
            style={{ paddingLeft: !sidebarCollapsed ? `${depth * 12 + 12}px` : undefined }}
            to={menu.path}
          >
            <NavIcon name={menu.icon} />
            {!sidebarCollapsed ? (
              <span className="truncate" data-testid={`nav-label-${menu.id}`}>
                {displayName}
              </span>
            ) : null}
          </NavLink>
        )}
        {hasChildren && !sidebarCollapsed && isExpanded
          ? menu.children!.map((child) => renderMenuItem(child, depth + 1))
          : null}
      </div>
    );
  }

  const navContent = (
    <>
      {/* Brand */}
      <div className="flex h-14 items-center border-b px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
          NA
        </div>
        {!sidebarCollapsed || mobileMenuOpen ? (
          <span className="ml-3 text-sm font-semibold truncate">{t({ id: 'brand' })}</span>
        ) : null}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {menusLoaded && menus.length > 0
          ? menus.map((menu) => renderMenuItem(menu))
          : visibleNavItems
              .filter((item) => !item.pluginCode || enabledPlugins.includes(item.pluginCode))
              .map((item) => (
                <NavLink
                  className={({ isActive }) => linkClass(isNavItemActive(location.pathname, item.path) || isActive)}
                  key={item.key}
                  title={tip(t({ id: item.labelId }))}
                  onClick={() => setMobileMenuOpen(false)}
                  to={item.path}
                >
                  <NavIcon name={item.icon} />
                  {!sidebarCollapsed ? <span className="truncate">{t({ id: item.labelId })}</span> : null}
                </NavLink>
              ))}

        {/* Plugin Section */}
        {permissions['plugins:view'] && (
          <div className="mt-4 border-t pt-2">
            {!sidebarCollapsed && (
              <div className="mb-2 px-3 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {t({ id: 'nav.plugins', defaultMessage: 'Plugins' })}
              </div>
            )}
            <NavLink
              className={({ isActive }) =>
                linkClass(isNavItemActive(location.pathname, '/plugins/marketplace') || isActive)
              }
              title={tip(t({ id: 'nav.marketplace', defaultMessage: 'Marketplace' }))}
              onClick={() => setMobileMenuOpen(false)}
              to="/plugins/marketplace"
            >
              <NavIcon name="building" />
              {!sidebarCollapsed ? (
                <span className="truncate">{t({ id: 'nav.marketplace', defaultMessage: 'Marketplace' })}</span>
              ) : null}
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                linkClass(isNavItemActive(location.pathname, '/plugins/installed') || isActive)
              }
              title={tip(t({ id: 'nav.installed', defaultMessage: 'Installed' }))}
              onClick={() => setMobileMenuOpen(false)}
              to="/plugins/installed"
            >
              <NavIcon name="plus" />
              {!sidebarCollapsed ? (
                <span className="truncate">{t({ id: 'nav.installed', defaultMessage: 'Installed' })}</span>
              ) : null}
            </NavLink>
          </div>
        )}

        {/* Dynamic Plugin Menus */}
        {plugins
          .filter((p) => p.enabled && p.manifest?.contributes?.menus)
          .map((plugin) => (
            <div className="mt-2 border-t pt-2" key={`group-${plugin.name}`}>
              {!sidebarCollapsed && (
                <div className="mb-2 px-3 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {plugin.manifest?.displayName || plugin.name}
                </div>
              )}
              {plugin.manifest!.contributes!.menus!.map((menu, idx) => (
                <NavLink
                  className={({ isActive }) => linkClass(isNavItemActive(location.pathname, menu.route) || isActive)}
                  key={`${plugin.name}-menu-${idx}`}
                  title={tip(menu.name)}
                  onClick={() => setMobileMenuOpen(false)}
                  to={menu.route}
                >
                  <NavIcon name={menu.icon || 'rocket'} />
                  {!sidebarCollapsed ? <span className="truncate">{menu.name}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-2">
        <NavLink
          className={({ isActive }) =>
            className(
              'group relative flex h-9 items-center rounded-md text-sm transition-colors hover:bg-accent',
              sidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-3',
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )
          }
          title={tip(t({ id: 'profile.title' }))}
          to="/profile"
          onClick={() => setMobileMenuOpen(false)}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          {!sidebarCollapsed ? <span className="truncate">{t({ id: 'profile.title' })}</span> : null}
        </NavLink>
        {!sidebarCollapsed ? (
          <p className="mb-2 text-center text-xs text-muted-foreground">{t({ id: 'version' })}</p>
        ) : null}
        <button
          aria-label={sidebarCollapsed ? t({ id: 'menu.open' }) : t({ id: 'settings.sidebarCollapsed' })}
          title={sidebarCollapsed ? t({ id: 'menu.open' }) : t({ id: 'settings.sidebarCollapsed' })}
          className="mt-1 hidden md:flex h-9 w-full items-center justify-center rounded-md border border-border bg-card text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
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
      <aside className={className(sidebarBase, 'hidden md:flex', sidebarCollapsed ? 'w-16' : 'w-60')}>
        {navContent}
      </aside>

      {/* Mobile drawer overlay */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setMobileMenuOpen(false)} />
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
