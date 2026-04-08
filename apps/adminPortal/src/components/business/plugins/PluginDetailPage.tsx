import { useParams, Link } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { usePluginDetail, usePluginManagement } from '@/hooks/useMarketplace';
import { usePluginStore } from '@/stores/usePluginStore';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { NavIcon } from '@/app/layout/navIcon';
import { className } from '@/lib/className';

export function PluginDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { formatMessage: t } = useIntl();
  const { data, isLoading, error } = usePluginDetail(id || '');
  const { install, uninstall } = usePluginManagement();
  const plugins = usePluginStore((s) => s.plugins);

  const installedPlugin = plugins.find((p) => p.name === id || p.manifest?.id === id);
  const isInstalled = !!installedPlugin;

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  if (error || !data) return <div className="text-destructive">Failed to load plugin details.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link
          className={className(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'flex items-center'
          )}
          to="/plugins/marketplace"
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M15 19l-7-7 7-7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
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
                  <Button
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    onClick={() => uninstall.mutate(data.id)}
                    disabled={uninstall.isPending}
                  >
                    {uninstall.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                    {t({ id: 'plugins.uninstall', defaultMessage: 'Uninstall' })}
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  onClick={() => install.mutate({ pluginId: data.id })}
                  disabled={install.isPending}
                >
                  {install.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  {t({ id: 'plugins.install', defaultMessage: 'Install Now' })}
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {t({ id: 'plugins.detail.description', defaultMessage: 'Description' })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {data.description || 'No description available for this plugin.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {t({ id: 'plugins.detail.versions', defaultMessage: 'Version History' })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Changelog</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.versions.map((v) => (
                    <TableRow key={v.version}>
                      <TableCell className="font-medium">v{v.version}</TableCell>
                      <TableCell className="max-w-md truncate">{v.changelog || '-'}</TableCell>
                      <TableCell>{new Date(v.publishedAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        {!isInstalled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              install.mutate({ pluginId: data.id, version: v.version })
                            }
                          >
                            Install v{v.version}
                          </Button>
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
              <CardTitle>Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono">{data.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Latest Version</span>
                <span>v{data.latestVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Downloads</span>
                <span>{data.downloadCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Released At</span>
                <span>{new Date(data.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Visibility</span>
                <Badge variant="secondary">{data.isPublic ? 'Public' : 'Private'}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
