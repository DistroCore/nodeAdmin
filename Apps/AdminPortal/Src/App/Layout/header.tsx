import { useIntl } from 'react-intl';
import { useLocation } from 'react-router-dom';
import type { AppLocale } from '@/I18n';
import { useUiStore } from '@/Stores/useUiStore';
import { resolveCurrentPageTitle } from './navConfig';

export function Header(): JSX.Element {
  const location = useLocation();
  const { formatMessage: t, locale } = useIntl();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setLocale = useUiStore((s) => s.setLocale);
  const setMobileMenuOpen = useUiStore((s) => s.setMobileMenuOpen);
  const pageTitleId = resolveCurrentPageTitle(location.pathname);

  const toggleLocale = () => setLocale((locale === 'zh' ? 'en' : 'zh') as AppLocale);

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card transition-colors hover:bg-accent md:hidden"
          onClick={() => setMobileMenuOpen(true)}
          type="button"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="text-base font-semibold">{t({ id: pageTitleId })}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Language toggle */}
        <button
          className="flex h-9 items-center rounded-md border border-border bg-card px-2 text-xs font-medium transition-colors hover:bg-accent"
          onClick={toggleLocale}
          type="button"
        >
          {locale === 'zh' ? 'EN' : '中'}
        </button>

        {/* Theme toggle */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-base transition-colors hover:bg-accent"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          type="button"
        >
          {theme === 'dark' ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5a1 1 0 011 1v1a1 1 0 01-2 0V3a1 1 0 011-1zm0 18a1 1 0 011 1v1a1 1 0 01-2 0v-1a1 1 0 011-1zM5.64 5.64a1 1 0 011.41 0l.71.71a1 1 0 01-1.41 1.41l-.71-.71a1 1 0 010-1.41zm12.02 12.02a1 1 0 011.41 0l.71.71a1 1 0 01-1.41 1.41l-.71-.71a1 1 0 010-1.41zM2 12a1 1 0 011-1h1a1 1 0 010 2H3a1 1 0 01-1-1zm18 0a1 1 0 011-1h1a1 1 0 010 2h-1a1 1 0 01-1-1zM5.64 18.36a1 1 0 010-1.41l.71-.71a1 1 0 011.41 1.41l-.71.71a1 1 0 01-1.41 0zm12.02-12.02a1 1 0 010-1.41l.71-.71a1 1 0 011.41 1.41l-.71.71a1 1 0 01-1.41 0z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
          )}
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
          A
        </div>
      </div>
    </header>
  );
}
