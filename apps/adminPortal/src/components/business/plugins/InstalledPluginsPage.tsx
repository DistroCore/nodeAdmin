import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';
import { usePluginManagement } from '@/hooks/useMarketplace';
import { usePluginStore } from '@/stores/usePluginStore';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {t({ id: 'plugins.installed.title', defaultMessage: 'Installed Plugins' })}
        </h1>
        <Link
          className={className(buttonVariants({ variant: 'default' }))}
          to="/plugins/marketplace"
        >
          {t({ id: 'plugins.marketplace.browse', defaultMessage: 'Browse Marketplace' })}
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-72">Plugin</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plugins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No plugins installed.
                  </TableCell>
                </TableRow>
              ) : (
                plugins.map((plugin) => (
                  <TableRow key={plugin.name}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="rounded-md bg-primary/10 p-2 text-primary">
                          <NavIcon name="rocket" />
                        </div>
                        <div>
                          <div className="font-medium">
                            {plugin.manifest?.displayName || plugin.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-48">
                            {plugin.manifest?.description || 'No description'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>v{plugin.installedVersion || '0.1.0'}</span>
                        {/* Mock update check */}
                        {false && (
                          <span className="text-[0.625rem] text-amber-600 font-bold">
                            UPDATE AVAILABLE
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={plugin.enabled ? 'default' : 'secondary'}>
                        {plugin.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Link
                        className={className(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                        to={`/plugins/settings/${encodeURIComponent(plugin.name)}`}
                      >
                        <NavIcon name="gear" />
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => uninstall.mutate(plugin.name)}
                      >
                        {t({ id: 'plugins.uninstall', defaultMessage: 'Uninstall' })}
                      </Button>
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
