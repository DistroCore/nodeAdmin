import { useParams, Link } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { usePluginDetail, usePluginManagement } from '@/hooks/useMarketplace';
import { usePluginStore } from '@/stores/usePluginStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { NavIcon } from '@/app/layout/navIcon';
import { className } from '@/lib/className';

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Skeleton className="h-9 w-20" />
      </div>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-20 w-20 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-6 w-32" />
              </div>
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        </div>
        <div className="w-full space-y-6 lg:w-80">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function PluginDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { formatMessage: t } = useIntl();
  const { data, isLoading, error, refetch } = usePluginDetail(id || '');
  const { install, uninstall, update } = usePluginManagement();
  const plugins = usePluginStore((s) => s.plugins);
  const canManage = usePermissionStore((s) => s.hasPermission('plugins:manage'));

  const installedPlugin = plugins.find((p) => p.name === id || p.manifest?.id === id);
  const isInstalled = !!installedPlugin;
  const hasUpdate = isInstalled && installedPlugin.installedVersion && data && data.latestVersion !== installedPlugin.installedVersion;

  if (isLoading) return <DetailSkeleton />;

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <div className="rounded-full bg-destructive/10 p-3 text-destructive">
          <NavIcon name="alert" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">
          {t({ id: 'plugins.detail.error', defaultMessage: 'Failed to load details' })}
        </h3>
        <p className="mb-6 text-sm text-muted-foreground">
          {t({
            id: 'plugins.detail.error_desc',
            defaultMessage: 'The plugin information could not be retrieved at this time.',
          })}
        </p>
        <div className="flex gap-2">
          <Link className={buttonVariants({ variant: 'outline' })} to="/plugins/marketplace">
            {t({ id: 'common.back', defaultMessage: 'Back' })}
          </Link>
          <Button onClick={() => refetch()}>{t({ id: 'common.retry', defaultMessage: 'Retry' })}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center space-x-4">
        <Link
          className={className(buttonVariants({ variant: 'ghost', size: 'sm' }), 'flex items-center')}
          to="/plugins/marketplace"
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
          {t({ id: 'common.back', defaultMessage: 'Back' })}
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className="rounded-xl bg-primary/10 p-4 text-primary">
                <NavIcon name="rocket" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{data.displayName}</h1>
                <p className="text-lg text-muted-foreground">{data.authorName}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {isInstalled ? (
                <>
                  <Badge variant="outline" className="h-8 px-3">
                    {t({ id: 'plugins.status.installed_v', defaultMessage: 'Installed' })} v
                    {installedPlugin.installedVersion || 'unknown'}
                  </Badge>
                  {hasUpdate && canManage && (
                    <Button
                      variant="default"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => update.mutate({ id: data.id, version: data.latestVersion })}
                      disabled={update.isPending}
                    >
                      {update.isPending && (
                        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      )}
                      {t(
                        { id: 'plugins.update_to', defaultMessage: 'Update to v{version}' },
                        { version: data.latestVersion },
                      )}
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (window.confirm(t({ id: 'plugins.uninstall.confirm', defaultMessage: 'Are you sure?' }))) {
                          uninstall.mutate(data.id);
                        }
                      }}
                      disabled={uninstall.isPending}
                    >
                      {uninstall.isPending && (
                        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      )}
                      {t({ id: 'plugins.uninstall', defaultMessage: 'Uninstall' })}
                    </Button>
                  )}
                </>
              ) : (
                canManage && (
                  <Button size="lg" onClick={() => install.mutate({ pluginId: data.id, version: data.latestVersion })} disabled={install.isPending}>
                    {install.isPending && (
                      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    )}
                    {t({ id: 'plugins.install', defaultMessage: 'Install Now' })}
                  </Button>
                )
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t({ id: 'plugins.detail.description', defaultMessage: 'Description' })}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                {data.description ||
                  t({
                    id: 'plugins.marketplace.no_description',
                    defaultMessage: 'No description available for this plugin.',
                  })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t({ id: 'plugins.detail.versions', defaultMessage: 'Version History' })}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="pl-6">Version</TableHead>
                    <TableHead>Changelog</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="text-right pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.versions.map((v) => (
                    <TableRow key={v.version}>
                      <TableCell className="font-mono pl-6">v{v.version}</TableCell>
                      <TableCell className="max-w-md truncate text-sm">{v.changelog || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(v.publishedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {canManage && (
                          !isInstalled ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => install.mutate({ pluginId: data.id, version: v.version })}
                            >
                              {t(
                                { id: 'plugins.install_v', defaultMessage: 'Install v{version}' },
                                { version: v.version },
                              )}
                            </Button>
                          ) : (
                            installedPlugin.installedVersion !== v.version && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={() => update.mutate({ id: data.id, version: v.version })}
                                disabled={update.isPending}
                              >
                                {t(
                                  { id: 'plugins.update_v', defaultMessage: 'Update to v{version}' },
                                  { version: v.version },
                                )}
                              </Button>
                            )
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="w-full space-y-6 lg:w-80">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-[0.6875rem]">{data.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Latest Version</span>
                <span className="font-mono">v{data.latestVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Downloads</span>
                <span className="font-medium">{data.downloadCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Released At</span>
                <span>{data.createdAt ? new Date(data.createdAt).toLocaleDateString() : '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Visibility</span>
                <Badge variant="secondary" className="text-[0.625rem]">
                  {data.isPublic ? 'Public' : 'Private'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
