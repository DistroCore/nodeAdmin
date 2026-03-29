import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

  return (
    <section className="h-full overflow-y-auto">
      <Card className="p-4">
        <CardHeader className="mb-4 flex-col gap-3 p-0 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'release.title' })}</CardTitle>
            <CardDescription>{t({ id: 'release.desc' })}</CardDescription>
          </div>
          <div className="w-full max-w-48 space-y-1">
            <p className="text-xs text-muted-foreground sm:text-right">
              {t({ id: 'release.completed' }, { done: completedChecks, total: totalChecks })}
            </p>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        </CardHeader>

        <ul className="space-y-2">
          {releaseQuery.isLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <li
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  key={`release-skeleton-${index}`}
                >
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                </li>
              ))
            : null}

          {releaseQuery.isError ? (
            <li className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-sm text-destructive">{t({ id: 'release.loadFailed' })}</p>
              <button
                className="mt-1 text-xs text-primary hover:underline"
                onClick={() => releaseQuery.refetch()}
                type="button"
              >
                {t({ id: 'common.retry' })}
              </button>
            </li>
          ) : null}

          {!releaseQuery.isLoading && !releaseQuery.isError && releaseChecks.length === 0 ? (
            <li className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
              {t({ id: 'release.empty' })}
            </li>
          ) : null}

          {!releaseQuery.isLoading && !releaseQuery.isError
            ? releaseChecks.map((releaseCheck) => (
                <li
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  key={releaseCheck.title}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={releaseCheck.done ? 'text-green-600' : 'text-muted-foreground'}
                    >
                      {releaseCheck.done ? '\u2713' : '\u25CB'}
                    </span>
                    <span
                      className={
                        releaseCheck.done
                          ? 'text-sm text-foreground'
                          : 'text-sm text-muted-foreground'
                      }
                    >
                      {releaseCheck.title}
                    </span>
                  </div>
                </li>
              ))
            : null}
        </ul>
      </Card>
    </section>
  );
}
