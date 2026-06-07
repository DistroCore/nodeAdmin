import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/hooks/useApiClient';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { POLL_INTERVALS } from '@/lib/pollingIntervals';
import type { AuditLogItem } from '@nodeadmin/shared-types';

function NotificationIcon({ action }: { action: string }): JSX.Element {
  const iconClass = 'h-4 w-4';

  if (action.includes('login') || action.includes('auth')) {
    return (
      <svg
        aria-hidden="true"
        className={iconClass}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M7 11V8a5 5 0 1110 0v3" strokeLinecap="round" strokeLinejoin="round" />
        <rect height="9" rx="2" width="14" x="5" y="11" />
      </svg>
    );
  }

  if (action.includes('user')) {
    return (
      <svg
        aria-hidden="true"
        className={iconClass}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20a8 8 0 0116 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (action.includes('tenant')) {
    return (
      <svg
        aria-hidden="true"
        className={iconClass}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M4 21V7l8-4 8 4v14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 21v-8h6v8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (action.includes('system')) {
    return (
      <svg
        aria-hidden="true"
        className={iconClass}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M12 3v3M12 18v3M4.5 4.5l2.1 2.1M17.4 17.4l2.1 2.1M3 12h3M18 12h3M4.5 19.5l2.1-2.1M17.4 6.6l2.1-2.1"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path
        d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 17a3 3 0 006 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface AuditLogResponse {
  items: AuditLogItem[];
  total: number;
}

const loadingRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];

const PAGE_SIZE = 20;

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// Locale-aware relative time ("5 minutes ago" / "5 分钟前") via the native Intl
// API — no extra i18n keys, follows the active locale. Falls back to a date for
// anything older than a week.
function formatRelativeTime(iso: string, locale: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < HOUR) return rtf.format(Math.round(diffMs / MINUTE), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), 'hour');
  if (abs < 7 * DAY) return rtf.format(Math.round(diffMs / DAY), 'day');
  return new Date(iso).toLocaleDateString(locale);
}

// Type-based accent for the icon circle, matching the dashboard's stat palette.
function notificationAccent(action: string): string {
  if (action.includes('login') || action.includes('auth'))
    return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400';
  if (action.includes('user')) return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400';
  if (action.includes('tenant')) return 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400';
  if (action.includes('system')) return 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400';
  return 'bg-muted text-muted-foreground';
}

export function NotificationPanel(): JSX.Element {
  const { formatMessage: t, locale } = useIntl();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { markAsRead, markAllAsRead, isRead } = useNotificationStore();

  // Infinite list — appends pages on "load more". No polling here: a background
  // refetch would re-request every loaded page (request/memory amplification),
  // so freshness is delegated to the lightweight head poll below.
  const auditQuery = useInfiniteQuery({
    queryKey: ['notifications-logs'],
    queryFn: ({ pageParam }) =>
      apiClient.get<AuditLogResponse>(`/api/v1/console/audit-logs?page=${pageParam}&pageSize=${PAGE_SIZE}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      if (lastPage.items.length < PAGE_SIZE || loaded >= lastPage.total) return undefined;
      return allPages.length + 1;
    },
  });

  // Lightweight head poll — always one request per interval, independent of how
  // many pages the infinite list has loaded. Used only to detect new entries.
  const headQuery = useQuery({
    queryKey: ['notifications-head'],
    queryFn: () => apiClient.get<AuditLogResponse>(`/api/v1/console/audit-logs?page=1&pageSize=${PAGE_SIZE}`),
    refetchInterval: POLL_INTERVALS.notifications,
  });

  // Baseline is the total of the list's own first page (what the user is currently
  // looking at). Comparing it to the freshly-polled head total yields how many new
  // entries exist. Resetting the list (showLatest) refetches page 1, which moves the
  // baseline forward automatically — no separate state to keep in sync.
  const headTotal = headQuery.data?.total ?? 0;
  const listTotal = auditQuery.data?.pages[0]?.total ?? 0;
  const newCount = Math.max(0, headTotal - listTotal);

  const showLatest = () => {
    // Collapse the loaded pages back to a single fresh first page so the newest
    // entries show at the top. The banner clears once the refetch settles (its new
    // first-page total matches the head total).
    void queryClient.resetQueries({ queryKey: ['notifications-logs'] });
  };

  const notifications = auditQuery.data?.pages.flatMap((page: AuditLogResponse) => page.items) ?? [];

  const getTypeLabel = (action: string) => {
    if (action.includes('login') || action.includes('auth')) return t({ id: 'notifications.type.auth' });
    if (action.includes('user')) return t({ id: 'notifications.type.user' });
    if (action.includes('tenant')) return t({ id: 'notifications.type.tenant' });
    if (action.includes('system')) return t({ id: 'notifications.type.system' });
    return t({ id: 'notifications.type.other' });
  };

  const handleMarkAllRead = () => {
    markAllAsRead();
  };

  return (
    <section className="h-full overflow-y-auto space-y-4 pb-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between sm:space-y-0 border-b">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'notifications.title' })}</CardTitle>
            <CardDescription>{t({ id: 'notifications.desc' })}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={notifications.length === 0}>
            {t({ id: 'notifications.markAllRead' })}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {newCount > 0 && !auditQuery.isFetching ? (
            <button
              type="button"
              onClick={showLatest}
              className="flex w-full items-center justify-center gap-2 border-b bg-primary/10 p-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
            >
              {t({ id: 'notifications.newCount' }, { count: newCount })}
            </button>
          ) : null}
          <div className="divide-y">
            {auditQuery.isLoading
              ? loadingRows.map((rowId) => (
                  <div key={rowId} className="p-4 space-y-2 animate-pulse">
                    <div className="h-4 w-1/4 bg-muted rounded" />
                    <div className="h-4 w-3/4 bg-muted rounded" />
                  </div>
                ))
              : null}

            {auditQuery.isError ? (
              <div className="p-8 text-center text-destructive">{t({ id: 'notifications.loadFailed' })}</div>
            ) : null}

            {!auditQuery.isLoading && !auditQuery.isError && notifications.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">{t({ id: 'notifications.empty' })}</div>
            ) : null}

            {notifications.map((notification) => {
              const isUnread = !isRead(notification.id, notification.createdAt);
              return (
                <button
                  key={notification.id}
                  className={`group relative flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-accent/5 ${isUnread ? 'bg-primary/10 dark:bg-primary/5' : ''}`}
                  onClick={() => markAsRead(notification.id)}
                  type="button"
                >
                  <div
                    className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg ${notificationAccent(notification.action)}`}
                  >
                    <NotificationIcon action={notification.action} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                          {getTypeLabel(notification.action)}
                        </span>
                        {isUnread && (
                          <Badge variant="default" className="h-4 px-1 text-[0.5rem] uppercase">
                            {t({ id: 'notifications.unread' })}
                          </Badge>
                        )}
                      </div>
                      <span
                        className="text-[0.625rem] text-muted-foreground whitespace-nowrap"
                        title={new Date(notification.createdAt).toLocaleString()}
                      >
                        {formatRelativeTime(notification.createdAt, locale)}
                      </span>
                    </div>
                    <p
                      className={`text-sm leading-snug ${isUnread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                    >
                      <span className="font-mono text-xs opacity-70 mr-1">[{notification.action}]</span>
                      {notification.targetType} {notification.targetId ? `(${notification.targetId})` : ''}
                      {notification.userId && ` by ${notification.userId}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          {auditQuery.hasNextPage ? (
            <div className="flex justify-center border-t p-3">
              <Button
                variant="outline"
                size="sm"
                disabled={auditQuery.isFetchingNextPage}
                onClick={() => {
                  if (!auditQuery.isFetchingNextPage) void auditQuery.fetchNextPage();
                }}
              >
                {auditQuery.isFetchingNextPage ? t({ id: 'common.loading' }) : t({ id: 'audit.loadMore' })}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
