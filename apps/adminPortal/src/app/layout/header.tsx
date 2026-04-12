import { useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AppLocale } from '@/i18n';
import { clearAuthStore, useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useApiClient } from '@/hooks/useApiClient';
import { resolveCurrentPageTitle } from './navConfig';
import { POLL_INTERVALS } from '@/lib/pollingIntervals';

export function Header(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { formatMessage: t, locale } = useIntl();
  const apiClient = useApiClient();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setLocale = useUiStore((s) => s.setLocale);
  const setMobileMenuOpen = useUiStore((s) => s.setMobileMenuOpen);
  const pageTitleId = resolveCurrentPageTitle(location.pathname);
  const userName = useAuthStore((s) => s.userName);
  const { readIds } = useNotificationStore();

  const auditQuery = useQuery({
    queryFn: () => apiClient.get<{ items: Array<{ id: string }> }>('/api/v1/console/audit-logs?pageSize=50'),
    queryKey: ['notifications-badge-count'],
    refetchInterval: POLL_INTERVALS.auth,
  });

  const unreadCount = (auditQuery.data?.items ?? []).filter((n) => !readIds.has(n.id)).length;

  const toggleLocale = () => setLocale((locale === 'zh' ? 'en' : 'zh') as AppLocale);

  const handleLogout = () => {
    clearAuthStore();
    navigate('/login', { replace: true });
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          aria-label={t({ id: 'menu.open' })}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          onClick={() => setMobileMenuOpen(true)}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="text-base font-semibold">{t({ id: pageTitleId })}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button
          aria-label={t({ id: 'nav.notifications' })}
          className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => navigate('/notifications')}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive"></span>
            </span>
          )}
        </button>

        {/* Language toggle */}
        <button
          aria-label={t({ id: 'settings.language' })}
          className="flex h-9 items-center rounded-md border border-border bg-card px-2 text-xs font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          onClick={toggleLocale}
          type="button"
        >
          {locale === 'zh' ? 'EN' : '中'}
        </button>

        {/* Theme toggle */}
        <button
          aria-label={t({ id: 'theme.toggle' })}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-base transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          type="button"
        >
          {theme === 'dark' ? (
            <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5a1 1 0 011 1v1a1 1 0 01-2 0V3a1 1 0 011-1zm0 18a1 1 0 011 1v1a1 1 0 01-2 0v-1a1 1 0 011-1zM5.64 5.64a1 1 0 011.41 0l.71.71a1 1 0 01-1.41 1.41l-.71-.71a1 1 0 010-1.41zm12.02 12.02a1 1 0 011.41 0l.71.71a1 1 0 01-1.41 1.41l-.71-.71a1 1 0 010-1.41zM2 12a1 1 0 011-1h1a1 1 0 010 2H3a1 1 0 01-1-1zm18 0a1 1 0 011-1h1a1 1 0 010 2h-1a1 1 0 01-1-1zM5.64 18.36a1 1 0 010-1.41l.71-.71a1 1 0 011.41 1.41l-.71.71a1 1 0 01-1.41 0zm12.02-12.02a1 1 0 010-1.41l.71-.71a1 1 0 011.41 1.41l-.71.71a1 1 0 01-1.41 0z" />
            </svg>
          ) : (
            <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
          )}
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
          {userName?.charAt(0).toUpperCase() ?? 'A'}
        </div>
        <button
          className="flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          onClick={handleLogout}
          title={t({ id: 'auth.logout' })}
          type="button"
        >
          {t({ id: 'auth.logout' })}
        </button>
      </div>
    </header>
  );
}
