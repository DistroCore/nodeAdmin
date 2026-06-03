import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';

function IconSun(): JSX.Element {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon(): JSX.Element {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGlobe(): JSX.Element {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" strokeLinecap="round" />
    </svg>
  );
}

function IconMonitor(): JSX.Element {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" strokeLinecap="round" />
    </svg>
  );
}

function IconUser(): JSX.Element {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0116 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingCard({
  accent,
  icon,
  title,
  children,
}: {
  accent: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <Card className="p-5 transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${accent}`}>{icon}</span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const ACCENT = {
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
} as const;

export function SettingsPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const imPanelOpen = useUiStore((s) => s.imConversationPanelOpen);
  const toggleImPanel = useUiStore((s) => s.toggleImConversationPanel);

  const userId = useAuthStore((s) => s.userId);
  const tenantId = useAuthStore((s) => s.tenantId);
  const userName = useAuthStore((s) => s.userName);
  const userRoles = useAuthStore((s) => s.userRoles);

  return (
    <section className="h-full overflow-y-auto pb-6">
      <h1 className="mb-1 text-xl font-semibold text-foreground">{t({ id: 'settings.title' })}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t({ id: 'settings.desc' })}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Theme */}
        <SettingCard
          accent={ACCENT.amber}
          icon={theme === 'dark' ? <IconMoon /> : <IconSun />}
          title={t({ id: 'settings.theme' })}
        >
          <div className="flex gap-2">
            <SegButton active={theme === 'light'} onClick={() => setTheme('light')}>
              <IconSun />
              {t({ id: 'settings.themeLight' })}
            </SegButton>
            <SegButton active={theme === 'dark'} onClick={() => setTheme('dark')}>
              <IconMoon />
              {t({ id: 'settings.themeDark' })}
            </SegButton>
          </div>
        </SettingCard>

        {/* Language */}
        <SettingCard accent={ACCENT.blue} icon={<IconGlobe />} title={t({ id: 'settings.language' })}>
          <div className="flex gap-2">
            <SegButton active={locale === 'en'} onClick={() => setLocale('en')}>
              English
            </SegButton>
            <SegButton active={locale === 'zh'} onClick={() => setLocale('zh')}>
              中文
            </SegButton>
          </div>
        </SettingCard>

        {/* Display */}
        <SettingCard accent={ACCENT.purple} icon={<IconMonitor />} title={t({ id: 'settings.display' })}>
          <div className="space-y-2.5">
            <Checkbox
              checked={sidebarCollapsed}
              id="settings-sidebar-collapsed"
              label={t({ id: 'settings.sidebarCollapsed' })}
              onChange={toggleSidebar}
            />
            <Checkbox
              checked={imPanelOpen}
              id="settings-im-panel"
              label={t({ id: 'settings.imPanel' })}
              onChange={toggleImPanel}
            />
          </div>
        </SettingCard>

        {/* Session Info */}
        <SettingCard accent={ACCENT.emerald} icon={<IconUser />} title={t({ id: 'settings.session' })}>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t({ id: 'settings.userId' })}</dt>
              <dd className="truncate font-mono text-xs text-foreground">{userId ?? '—'}</dd>
            </div>
            {import.meta.env.VITE_SINGLE_TENANT_MODE !== 'true' && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t({ id: 'settings.tenantId' })}</dt>
                <dd className="font-mono text-xs text-foreground">{tenantId ?? '—'}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t({ id: 'settings.userName' })}</dt>
              <dd className="text-foreground">{userName ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t({ id: 'settings.userRoles' })}</dt>
              <dd className="text-foreground">{userRoles.length > 0 ? userRoles.join(', ') : '—'}</dd>
            </div>
          </dl>
        </SettingCard>
      </div>
    </section>
  );
}
