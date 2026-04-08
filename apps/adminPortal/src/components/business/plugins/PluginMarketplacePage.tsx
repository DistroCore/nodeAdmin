import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';
import { useMarketplace, usePluginManagement } from '@/hooks/useMarketplace';
import { usePluginStore } from '@/stores/usePluginStore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { NavIcon } from '@/app/layout/navIcon';
import { className } from '@/lib/className';

export function PluginMarketplacePage() {
  const { formatMessage: t } = useIntl();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, error } = useMarketplace(page, pageSize, search);
  const { install } = usePluginManagement();
  const plugins = usePluginStore((s) => s.plugins);

  const isInstalled = (pluginId: string) => {
    return plugins.some((p) => p.name === pluginId || p.manifest?.id === pluginId);
  };

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  if (error) return <div className="text-destructive">Failed to load marketplace.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {t({ id: 'plugins.marketplace.title', defaultMessage: 'Plugin Marketplace' })}
        </h1>
        <div className="flex w-full max-w-sm items-center space-x-2">
          <Input
            placeholder={t({
              id: 'plugins.marketplace.search',
              defaultMessage: 'Search plugins...',
            })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data?.plugins.map((plugin) => (
          <Card key={plugin.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <NavIcon name="rocket" />
                </div>
                {isInstalled(plugin.id) && (
                  <Badge variant="secondary">
                    {t({ id: 'plugins.status.installed', defaultMessage: 'Installed' })}
                  </Badge>
                )}
              </div>
              <CardTitle className="mt-4">{plugin.displayName}</CardTitle>
              <CardDescription>{plugin.authorName}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground line-clamp-3">
                {plugin.description || 'No description provided.'}
              </p>
              <div className="mt-4 flex items-center space-x-4 text-xs text-muted-foreground">
                <span className="flex items-center">
                  <NavIcon name="bar" /> {plugin.downloadCount}
                </span>
                <span>v{plugin.latestVersion}</span>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Link
                className={className(buttonVariants({ variant: 'outline' }), 'flex-1')}
                to={`/plugins/marketplace/${encodeURIComponent(plugin.id)}`}
              >
                {t({ id: 'plugins.view_details', defaultMessage: 'View Details' })}
              </Link>
              {!isInstalled(plugin.id) && (
                <Button
                  className="flex-1"
                  onClick={() => install.mutate({ pluginId: plugin.id })}
                  disabled={install.isPending}
                >
                  {install.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  {t({ id: 'plugins.install', defaultMessage: 'Install' })}
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {data && data.total > pageSize && (
        <div className="flex justify-center space-x-2 py-4">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page * pageSize >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
