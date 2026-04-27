import { useIntl } from 'react-intl';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';

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
    <section className="h-full overflow-y-auto">
      <h1 className="mb-1 text-xl font-semibold text-foreground">{t({ id: 'settings.title' })}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t({ id: 'settings.desc' })}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Theme */}
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground">{t({ id: 'settings.theme' })}</h2>
          <div className="flex gap-2">
            <button
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                theme === 'light'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
              onClick={() => setTheme('light')}
            >
              {t({ id: 'settings.themeLight' })}
            </button>
            <button
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                theme === 'dark'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
              onClick={() => setTheme('dark')}
            >
              {t({ id: 'settings.themeDark' })}
            </button>
          </div>
        </Card>

        {/* Language */}
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground">{t({ id: 'settings.language' })}</h2>
          <div className="flex gap-2">
            <button
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                locale === 'en'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
              onClick={() => setLocale('en')}
            >
              English
            </button>
            <button
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                locale === 'zh'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
              onClick={() => setLocale('zh')}
            >
              中文
            </button>
          </div>
        </Card>

        {/* Display */}
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground">{t({ id: 'settings.display' })}</h2>
          <div className="space-y-2">
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
        </Card>

        {/* Session Info */}
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground">{t({ id: 'settings.session' })}</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t({ id: 'settings.userId' })}</dt>
              <dd className="font-mono text-xs text-foreground">{userId ?? '—'}</dd>
            </div>
            {import.meta.env.VITE_SINGLE_TENANT_MODE !== 'true' && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t({ id: 'settings.tenantId' })}</dt>
                <dd className="font-mono text-xs text-foreground">{tenantId ?? '—'}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t({ id: 'settings.userName' })}</dt>
              <dd className="text-foreground">{userName ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t({ id: 'settings.userRoles' })}</dt>
              <dd className="text-foreground">{userRoles.length > 0 ? userRoles.join(', ') : '—'}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </section>
  );
}
