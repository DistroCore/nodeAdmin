import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
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
  const isOverviewFetching = overviewQuery.isFetching;
  const isHealthPending = healthQuery.isLoading;

  const healthVersion = healthQuery.data ? `v${healthQuery.data.version}` : t({ id: 'overview.unavailable' });
  const healthStatus = healthQuery.data
    ? `${healthQuery.data.service} / ${healthQuery.data.status}`
    : t({ id: 'overview.unavailable' });

  const statCount = stats.length || 5;

  const handleRefresh = () => {
    void overviewQuery.refetch();
    void healthQuery.refetch();
  };

  return (
    <section className="flex h-full flex-col gap-6 overflow-y-auto pb-6">
      {/* Welcome card */}
      <Card className="bg-gradient-to-r from-primary/5 via-card to-card border-primary/10">
        <CardHeader>
          <CardTitle className="text-lg">{t({ id: 'overview.welcome' })}</CardTitle>
          <CardDescription>{t({ id: 'overview.welcomeDesc' })}</CardDescription>
        </CardHeader>
      </Card>

      {/* Platform Overview */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'overview.platformTitle' })}</CardTitle>
            <CardDescription>{t({ id: 'overview.platformDesc' })}</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={isOverviewFetching}
            className="h-8 w-8 p-0"
            title={t({ id: 'common.retry' })}
          >
            {isOverviewFetching ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOverviewPending ? (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: statCount }).map((_, index) => (
                <div
                  className="rounded-lg border border-border p-4 animate-pulse"
                  key={`overview-stat-skeleton-${index}`}
                >
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="mt-3 h-8 w-3/4 rounded bg-muted" />
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
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
              {stats.map((stat, index) => (
                <div
                  className="group rounded-lg border border-border p-4 transition-shadow hover:shadow-md bg-card"
                  key={stat.label}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      {t({ id: stat.label })}
                    </p>
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${statBgClasses[index % statBgClasses.length]}`}
                    >
                      <NavIcon name={statIconNames[index % statIconNames.length]} />
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{stat.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
            {isHealthPending ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 w-1/4 rounded bg-muted" />
                <div className="h-4 w-1/2 rounded bg-muted" />
              </div>
            ) : (
              <>
                <p className="text-[0.625rem] font-bold uppercase tracking-wider text-muted-foreground">
                  {t({ id: 'overview.health.version' })}
                </p>
                <p className="mt-1 flex items-center text-sm font-medium">
                  <span className="relative mr-2 inline-flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                  {healthVersion}
                </p>
                <p className="text-xs text-muted-foreground opacity-80">{healthStatus}</p>
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
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="h-10 w-full rounded-md bg-muted" key={`overview-todo-skeleton-${index}`} />
              ))}
            </div>
          ) : todos.length === 0 ? (
            <div className="rounded-md border border-border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              {t({ id: 'overview.focus.empty' })}
            </div>
          ) : (
            todos.map((todo, index) => {
              const isCompleted = index === 0;

              return (
                <div
                  className={`flex items-start gap-2 rounded-md border border-border border-l-4 bg-muted/10 px-3 py-3 text-sm transition-colors hover:bg-muted/20 ${
                    isCompleted ? 'border-l-green-500' : 'border-l-amber-500'
                  }`}
                  key={todo}
                >
                  <span className={`mt-0.5 ${isCompleted ? 'text-green-600' : 'text-amber-500'}`}>
                    {isCompleted ? (
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      </svg>
                    )}
                  </span>
                  <span className={isCompleted ? 'text-foreground/90 line-through' : 'text-foreground/90'}>{todo}</span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </section>
  );
}
