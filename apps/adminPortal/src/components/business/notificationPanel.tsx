import { useQuery } from '@tanstack/react-query';
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

export function NotificationPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const { markAsRead, markAllAsRead, readIds } = useNotificationStore();

  const auditQuery = useQuery({
    queryFn: () => apiClient.get<AuditLogResponse>('/api/v1/console/audit-logs?pageSize=50'),
    queryKey: ['notifications-logs'],
    refetchInterval: POLL_INTERVALS.notifications,
  });

  const notifications = auditQuery.data?.items ?? [];

  const getTypeLabel = (action: string) => {
    if (action.includes('login') || action.includes('auth')) return t({ id: 'notifications.type.auth' });
    if (action.includes('user')) return t({ id: 'notifications.type.user' });
    if (action.includes('tenant')) return t({ id: 'notifications.type.tenant' });
    if (action.includes('system')) return t({ id: 'notifications.type.system' });
    return t({ id: 'notifications.type.other' });
  };

  const handleMarkAllRead = () => {
    markAllAsRead(notifications.map((n) => n.id));
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
              const isUnread = !readIds.has(notification.id);
              return (
                <button
                  key={notification.id}
                  className={`group relative flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-accent/5 ${isUnread ? 'bg-primary/10 dark:bg-primary/5' : ''}`}
                  onClick={() => markAsRead(notification.id)}
                  type="button"
                >
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
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
                      <span className="text-[0.625rem] text-muted-foreground whitespace-nowrap">
                        {new Date(notification.createdAt).toLocaleString()}
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
        </CardContent>
      </Card>
    </section>
  );
}
