import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/hooks/useApiClient';
import { POLL_INTERVALS } from '@/lib/pollingIntervals';

interface MetricsResponse {
  cpu: {
    system: number;
    user: number;
  };
  memory: {
    external: number;
    heapTotal: number;
    heapUsed: number;
    rss: number;
  };
  eventLoopLagMs: number;
  uptime: number;
}

export function SystemMetricsPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();

  const metricsQuery = useQuery({
    queryFn: () => apiClient.get<MetricsResponse>('/api/v1/metrics'),
    queryKey: ['system-metrics'],
    refetchInterval: POLL_INTERVALS.metrics,
  });

  const metrics = metricsQuery.data;

  const formatMB = (bytes: number) => {
    return (Number(bytes) / 1024 / 1024).toFixed(2) + ' MB';
  };

  const cpuTotal = Number(metrics?.cpu?.user ?? 0) + Number(metrics?.cpu?.system ?? 0);
  const eventLoopLag = Number(metrics?.eventLoopLagMs ?? 0);

  return (
    <section className="h-full overflow-y-auto space-y-4">
      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'metrics.title' })}</CardTitle>
            <CardDescription>{t({ id: 'metrics.desc' })}</CardDescription>
          </div>
          {metricsQuery.isError && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-destructive">{t({ id: 'metrics.loadFailed' })}</span>
              <Button size="sm" variant="outline" onClick={() => metricsQuery.refetch()}>
                {t({ id: 'common.retry' })}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* CPU */}
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2 dark:bg-muted/20">
              <div className="text-sm font-medium text-muted-foreground">{t({ id: 'metrics.cpu' })}</div>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold text-foreground">
                  {metricsQuery.isLoading ? '...' : `${(cpuTotal / 1_000_000).toFixed(2)}s`}
                </div>
                <Badge variant={cpuTotal > 80000000 ? 'destructive' : 'default'}>CPU</Badge>
              </div>
            </div>

            {/* Event Loop Lag */}
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2 dark:bg-muted/20">
              <div className="text-sm font-medium text-muted-foreground">{t({ id: 'metrics.eventLoop' })}</div>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold text-foreground">
                  {metricsQuery.isLoading ? '...' : `${eventLoopLag.toFixed(2)} ms`}
                </div>
                <Badge variant={eventLoopLag > 100 ? 'destructive' : 'default'}>LAG</Badge>
              </div>
            </div>

            {/* Memory Usage (Heap Used) */}
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2 dark:bg-muted/20">
              <div className="text-sm font-medium text-muted-foreground">{t({ id: 'metrics.heapUsed' })}</div>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold text-foreground">
                  {metricsQuery.isLoading ? '...' : formatMB(metrics?.memory.heapUsed ?? 0)}
                </div>
              </div>
            </div>

            {/* Uptime */}
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2 dark:bg-muted/20">
              <div className="text-sm font-medium text-muted-foreground">{t({ id: 'metrics.uptime' })}</div>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold text-foreground">
                  {metricsQuery.isLoading ? '...' : Math.floor(metrics?.uptime ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground pb-1">{t({ id: 'metrics.uptimeUnit' })}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="bg-muted/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t({ id: 'metrics.memory' })}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span>{t({ id: 'metrics.heapUsed' })}</span>
                    <span className="font-mono font-bold text-foreground">
                      {metricsQuery.isLoading ? '...' : formatMB(metrics?.memory.heapUsed ?? 0)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{
                        width: `${metrics ? Math.min(100, (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>{t({ id: 'metrics.heapTotal' })}</span>
                  <span className="font-mono text-foreground/80">
                    {metricsQuery.isLoading ? '...' : formatMB(metrics?.memory.heapTotal ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>{t({ id: 'metrics.rss' })}</span>
                  <span className="font-mono text-foreground/80">
                    {metricsQuery.isLoading ? '...' : formatMB(metrics?.memory.rss ?? 0)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col justify-center rounded-lg border border-dashed border-border p-6 text-center bg-muted/10">
              <p className="text-sm text-muted-foreground">
                {metricsQuery.isFetching && !metricsQuery.isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Updating...
                  </span>
                ) : (
                  `Next update in 5s`
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
