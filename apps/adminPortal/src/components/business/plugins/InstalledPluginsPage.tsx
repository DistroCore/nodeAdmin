import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';
import { usePluginManagement } from '@/hooks/useMarketplace';
import { usePluginStore } from '@/stores/usePluginStore';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { NavIcon } from '@/app/layout/navIcon';
import { className } from '@/lib/className';

export function InstalledPluginsPage() {
  const { formatMessage: t } = useIntl();
  const plugins = usePluginStore((s) => s.plugins);
  const { uninstall } = usePluginManagement();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t({ id: 'plugins.installed.title', defaultMessage: 'Installed Plugins' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t({
              id: 'plugins.installed.description',
              defaultMessage: 'Manage and configure your active plugins.',
            })}
          </p>
        </div>
        <Link
          className={className(buttonVariants({ variant: 'default' }))}
          to="/plugins/marketplace"
        >
          {t({ id: 'plugins.marketplace.browse', defaultMessage: 'Browse Marketplace' })}
        </Link>
      </div>

      <Card>
        <CardHeader className="px-6 py-4">
          <CardTitle className="text-lg">
            {t({ id: 'plugins.installed.list_title', defaultMessage: 'Active Extensions' })}
          </CardTitle>
          <CardDescription>
            {t({
              id: 'plugins.installed.list_desc',
              defaultMessage: 'A list of all plugins currently installed on your tenant.',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-72 pl-6">
                  {t({ id: 'plugins.col.plugin', defaultMessage: 'Plugin' })}
                </TableHead>
                <TableHead>{t({ id: 'plugins.col.version', defaultMessage: 'Version' })}</TableHead>
                <TableHead>{t({ id: 'plugins.col.status', defaultMessage: 'Status' })}</TableHead>
                <TableHead className="text-right pr-6">
                  {t({ id: 'plugins.col.actions', defaultMessage: 'Actions' })}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plugins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="rounded-full bg-muted p-3">
                        <NavIcon name="puzzle" />
                      </div>
                      <div className="text-muted-foreground">
                        <p className="font-medium">
                          {t({
                            id: 'plugins.installed.empty',
                            defaultMessage: 'No plugins installed',
                          })}
                        </p>
                        <p className="text-sm">
                          {t({
                            id: 'plugins.installed.empty_desc',
                            defaultMessage: 'Get started by browsing the marketplace.',
                          })}
                        </p>
                      </div>
                      <Link
                        className={className(
                          buttonVariants({ variant: 'outline', size: 'sm' }),
                          'mt-2'
                        )}
                        to="/plugins/marketplace"
                      >
                        {t({
                          id: 'plugins.marketplace.visit',
                          defaultMessage: 'Visit Marketplace',
                        })}
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                plugins.map((plugin) => (
                  <TableRow key={plugin.name} className="group transition-colors">
                    <TableCell className="pl-6">
                      <div className="flex items-center space-x-3">
                        <div className="rounded-md bg-primary/10 p-2 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <NavIcon name="rocket" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {plugin.manifest?.displayName || plugin.name}
                          </span>
                          <span className="text-xs text-muted-foreground truncate max-w-48">
                            {plugin.manifest?.description ||
                              t({
                                id: 'plugins.marketplace.no_description',
                                defaultMessage: 'No description',
                              })}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-mono">
                          v{plugin.installedVersion || '0.1.0'}
                        </span>
                        {/* Mock update check */}
                        {false && (
                          <Badge
                            variant="outline"
                            className="mt-1 w-fit border-amber-500/50 text-amber-600 bg-amber-50 text-[0.5625rem] font-bold dark:bg-amber-950/20"
                          >
                            UPDATE AVAILABLE
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={plugin.enabled ? 'default' : 'secondary'}
                        className="capitalize"
                      >
                        {plugin.enabled
                          ? t({ id: 'common.enabled', defaultMessage: 'Enabled' })
                          : t({ id: 'common.disabled', defaultMessage: 'Disabled' })}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          className={className(
                            buttonVariants({ variant: 'ghost', size: 'icon' }),
                            'h-8 w-8'
                          )}
                          to={`/plugins/settings/${encodeURIComponent(plugin.name)}`}
                          title={t({ id: 'common.settings', defaultMessage: 'Settings' })}
                        >
                          <NavIcon name="gear" />
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (
                              window.confirm(
                                t({
                                  id: 'plugins.uninstall.confirm',
                                  defaultMessage: 'Are you sure you want to uninstall this plugin?',
                                })
                              )
                            ) {
                              uninstall.mutate(plugin.name);
                            }
                          }}
                          disabled={uninstall.isPending}
                        >
                          {uninstall.isPending
                            ? t({ id: 'common.processing', defaultMessage: '...' })
                            : t({ id: 'plugins.uninstall', defaultMessage: 'Uninstall' })}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
