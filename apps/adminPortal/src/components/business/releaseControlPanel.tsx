import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/hooks/useApiClient';

interface ReleaseCheck {
  done: boolean;
  title: string;
}

interface ReleaseCheckResponse {
  checks: ReleaseCheck[];
}

export function ReleaseControlPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const releaseQuery = useQuery({
    queryFn: () => apiClient.get<ReleaseCheckResponse>('/api/v1/console/release-checks'),
    queryKey: ['console-release-checks'],
  });

  const releaseChecks = releaseQuery.data?.checks ?? [];
  const totalChecks = releaseChecks.length;
  const completedChecks = releaseChecks.filter((releaseCheck) => releaseCheck.done).length;
  const completionPercent = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;

  const handleRunChecks = () => {
    releaseQuery.refetch();
  };

  return (
    <section className="h-full overflow-y-auto space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'release.title' })}</CardTitle>
            <CardDescription>{t({ id: 'release.desc' })}</CardDescription>
          </div>
          <Button size="sm" onClick={handleRunChecks} disabled={releaseQuery.isFetching} className="w-full sm:w-auto">
            {releaseQuery.isFetching ? (
              <>
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t({ id: 'release.running' })}
              </>
            ) : (
              t({ id: 'release.runChecks' })
            )}
          </Button>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          <div className="mb-6 rounded-lg border bg-muted/30 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-muted-foreground">{t({ id: 'release.readiness' })}</span>
              <span className="font-bold text-primary">{completionPercent}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted">
              <div
                className="h-2.5 rounded-full bg-primary transition-all duration-500"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t({ id: 'release.completed' }, { done: completedChecks, total: totalChecks })}
            </p>
          </div>

          <div className="space-y-3">
            {releaseQuery.isLoading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <div
                    className="flex h-12 items-center justify-between rounded-lg border border-border px-4"
                    key={`release-skeleton-${index}`}
                  >
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-6 w-16 animate-pulse rounded bg-muted" />
                  </div>
                ))
              : null}

            {releaseQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
                <p className="text-sm text-destructive">{t({ id: 'release.loadFailed' })}</p>
                <Button
                  variant="ghost"
                  className="mt-1 h-auto p-0 text-xs text-primary underline"
                  onClick={() => releaseQuery.refetch()}
                >
                  {t({ id: 'common.retry' })}
                </Button>
              </div>
            ) : null}

            {!releaseQuery.isLoading && !releaseQuery.isError && releaseChecks.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                {t({ id: 'release.empty' })}
              </div>
            ) : null}

            {!releaseQuery.isLoading && !releaseQuery.isError
              ? releaseChecks.map((check) => (
                  <div
                    className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent/5"
                    key={check.title}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${
                          check.done ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {check.done ? (
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-current" />
                        )}
                      </div>
                      <span
                        className={`text-sm font-medium ${check.done ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        {check.title}
                      </span>
                    </div>
                    <Badge variant={check.done ? 'default' : 'destructive'} className="min-w-[3.75rem] justify-center">
                      {check.done ? t({ id: 'release.pass' }) : t({ id: 'release.fail' })}
                    </Badge>
                  </div>
                ))
              : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
