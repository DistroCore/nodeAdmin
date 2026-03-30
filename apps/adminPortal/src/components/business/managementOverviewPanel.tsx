import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NavIcon } from '@/app/layout/navIcon';
import { useApiClient } from '@/hooks/useApiClient';

interface OverviewResponse {
  stats: Array<{ label: string; value: string }>;
  todos: string[];
}

interface HealthResponse {
  service: string;
  status: string;
  timestamp: string;
  version: string;
}

const statBgClasses = [
  'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
  'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
] as const;

const statIconNames = ['bar', 'users', 'rocket', 'chat', 'settings'] as const;

export function ManagementOverviewPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const overviewQuery = useQuery({
    queryFn: () => apiClient.get<OverviewResponse>('/api/v1/console/overview'),
    queryKey: ['console-overview'],
  });
  const healthQuery = useQuery({
    queryFn: () => apiClient.get<HealthResponse>('/api/v1/health'),
    queryKey: ['health'],
    staleTime: 60_000,
  });

  const stats = overviewQuery.data?.stats ?? [];
  const todos = overviewQuery.data?.todos ?? [];
  const isOverviewPending = overviewQuery.isLoading;
  const isHealthPending = healthQuery.isLoading;

  const healthVersion = healthQuery.data
    ? `v${healthQuery.data.version}`
    : t({ id: 'overview.unavailable' });
  const healthStatus = healthQuery.data
    ? `${healthQuery.data.service} / ${healthQuery.data.status}`
    : t({ id: 'overview.unavailable' });

  const statCount = stats.length || 5;

  return (
    <section className="flex h-full flex-col gap-6 overflow-y-auto">
      {/* Welcome card */}
      <Card className="bg-gradient-to-r from-primary/5 via-card to-card border-primary/10">
        <CardHeader>
          <CardTitle className="text-lg">{t({ id: 'overview.welcome' })}</CardTitle>
          <CardDescription>{t({ id: 'overview.welcomeDesc' })}</CardDescription>
        </CardHeader>
      </Card>

      {/* Platform Overview */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">{t({ id: 'overview.platformTitle' })}</CardTitle>
          <CardDescription>{t({ id: 'overview.platformDesc' })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOverviewPending ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: statCount }).map((_, index) => (
                <div
                  className="rounded-lg border border-border p-4"
                  key={`overview-stat-skeleton-${index}`}
                >
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-6 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : null}

          {overviewQuery.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive">{t({ id: 'common.failed' })}</p>
              <button
                className="mt-1 text-xs text-primary hover:underline"
                onClick={() => overviewQuery.refetch()}
                type="button"
              >
                {t({ id: 'common.retry' })}
              </button>
            </div>
          ) : null}

          {!isOverviewPending && !overviewQuery.isError ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {stats.map((stat, index) => (
                <div
                  className="group rounded-lg border border-border p-4 transition-shadow hover:shadow-md"
                  key={stat.label}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{t({ id: stat.label })}</p>
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${statBgClasses[index % statBgClasses.length]}`}
                    >
                      <NavIcon name={statIconNames[index % statIconNames.length]} />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold">{stat.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            {isHealthPending ? (
              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {t({ id: 'overview.health.version' })}
                </p>
                <p className="mt-1 flex items-center text-sm font-medium">
                  <span className="relative mr-2 inline-flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                  {healthVersion}
                </p>
                <p className="text-xs text-muted-foreground">{healthStatus}</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current Focus */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t({ id: 'overview.focus.title' })}</CardTitle>
          <CardDescription>{t({ id: 'overview.focus.desc' })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isOverviewPending ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div
                className="h-4 w-full animate-pulse rounded bg-muted"
                key={`overview-todo-skeleton-${index}`}
              />
            ))
          ) : todos.length === 0 ? (
            <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
              {'\u25FB'} {t({ id: 'overview.focus.empty' })}
            </div>
          ) : (
            todos.map((todo, index) => {
              const isCompleted = index === 0;

              return (
                <div
                  className={`flex items-start gap-2 rounded-md border border-border border-l-4 bg-muted/20 px-3 py-2 text-sm ${
                    isCompleted ? 'border-l-green-500' : 'border-l-amber-500'
                  }`}
                  key={todo}
                >
                  <span className={isCompleted ? 'text-green-600' : 'text-muted-foreground'}>
                    {isCompleted ? '\u2611' : '\u25FB'}
                  </span>
                  <span className={isCompleted ? 'text-foreground' : 'text-muted-foreground'}>
                    {todo}
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </section>
  );
}
