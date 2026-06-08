import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';
import { useMarketplace, usePluginManagement } from '@/hooks/useMarketplace';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePluginStore } from '@/stores/usePluginStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NavIcon } from '@/app/layout/navIcon';
import { className } from '@/lib/className';

function PluginCardSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
        <Skeleton className="mt-4 h-6 w-3/4" />
        <Skeleton className="mt-2 h-4 w-1/2" />
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
      <CardFooter className="gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </CardFooter>
    </Card>
  );
}

const ICON_ACCENTS = [
  'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
  'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400',
];

// Stable per-plugin accent so each card icon gets a distinct color instead of a
// uniform primary tint — derived from the plugin id so it stays consistent.
function accentFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ICON_ACCENTS[Math.abs(hash) % ICON_ACCENTS.length];
}

export function PluginMarketplacePage() {
  const { formatMessage: t } = useIntl();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, error, refetch } = useMarketplace(page, pageSize, debouncedSearch);
  const { install } = usePluginManagement();
  const plugins = usePluginStore((s) => s.plugins);
  const canManage = usePermissionStore((s) => s.hasPermission('plugins:manage'));

  const isInstalled = (pluginId: string) => {
    return plugins.some((p) => p.name === pluginId || p.manifest?.id === pluginId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t({ id: 'plugins.marketplace.title', defaultMessage: 'Plugin Marketplace' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t({
              id: 'plugins.marketplace.description',
              defaultMessage: 'Discover and install plugins to extend your platform.',
            })}
          </p>
        </div>
        <div className="flex w-full max-w-sm items-center space-x-2">
          <Input
            aria-label={t({
              id: 'plugins.marketplace.search_label',
              defaultMessage: 'Search plugins',
            })}
            placeholder={t({
              id: 'plugins.marketplace.search',
              defaultMessage: 'Search plugins...',
            })}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <div className="rounded-full bg-destructive/10 p-3 text-destructive">
            <NavIcon name="alert" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">{t({ id: 'common.error', defaultMessage: 'Error' })}</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            {t({
              id: 'plugins.marketplace.load_failed',
              defaultMessage: 'Failed to load marketplace data.',
            })}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            {t({ id: 'common.retry', defaultMessage: 'Retry' })}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PluginCardSkeleton key={i} />
          ))}
        </div>
      ) : !data?.plugins?.length ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <NavIcon name="search" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">
            {t({ id: 'plugins.marketplace.no_results', defaultMessage: 'No plugins found' })}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t({
              id: 'plugins.marketplace.no_results_desc',
              defaultMessage: 'Try adjusting your search to find what you are looking for.',
            })}
          </p>
          {search && (
            <Button className="mt-6" variant="ghost" onClick={() => setSearch('')}>
              {t({ id: 'common.clear_search', defaultMessage: 'Clear search' })}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data?.plugins?.map((plugin) => (
              <Card
                key={plugin.id}
                className="flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={className('rounded-md p-2', accentFor(plugin.id))}>
                      <NavIcon name="rocket" />
                    </div>
                    {isInstalled(plugin.id) && (
                      <Badge variant="success">
                        {t({ id: 'plugins.status.installed', defaultMessage: 'Installed' })}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="mt-4">{plugin.displayName}</CardTitle>
                  <CardDescription>{plugin.authorName}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {plugin.description ||
                      t({
                        id: 'plugins.marketplace.no_description',
                        defaultMessage: 'No description provided.',
                      })}
                  </p>
                  <div className="mt-4 flex items-center gap-3 text-[0.625rem] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <NavIcon name="bar" /> {plugin.downloadCount.toLocaleString()}
                    </span>
                    <span className="rounded border px-1.5 py-0.5 font-mono">v{plugin.latestVersion}</span>
                  </div>
                </CardContent>
                <CardFooter className="gap-2">
                  <Link
                    className={className(buttonVariants({ variant: 'outline' }), 'flex-1')}
                    to={`/plugins/marketplace/${encodeURIComponent(plugin.id)}`}
                  >
                    {t({ id: 'plugins.view_details', defaultMessage: 'View Details' })}
                  </Link>
                  {!isInstalled(plugin.id) && canManage && (
                    <Button
                      className="flex-1"
                      onClick={() => install.mutate({ pluginId: plugin.id, version: plugin.latestVersion })}
                      disabled={install.isPending}
                    >
                      {install.isPending && (
                        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      )}
                      {t({ id: 'plugins.install', defaultMessage: 'Install' })}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>

          {data && data.total > pageSize && (
            <div className="flex items-center justify-center space-x-2 py-8">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                {t({ id: 'common.previous', defaultMessage: 'Previous' })}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t(
                  { id: 'common.page_info', defaultMessage: 'Page {page} of {total}' },
                  {
                    page,
                    total: Math.ceil(data.total / pageSize),
                  },
                )}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * pageSize >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                {t({ id: 'common.next', defaultMessage: 'Next' })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
