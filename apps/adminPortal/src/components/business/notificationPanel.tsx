import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/hooks/useApiClient';
import { useNotificationStore } from '@/stores/useNotificationStore';
import type { AuditLogItem } from '@nodeadmin/shared-types';

interface AuditLogResponse {
  items: AuditLogItem[];
  total: number;
}

export function NotificationPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const { markAsRead, markAllAsRead, readIds } = useNotificationStore();

  const auditQuery = useQuery({
    queryFn: () => apiClient.get<AuditLogResponse>('/api/v1/console/audit-logs?pageSize=50'),
    queryKey: ['notifications-logs'],
    refetchInterval: 30000, // Refresh every 30s
  });

  const notifications = auditQuery.data?.items ?? [];

  const getIcon = (action: string) => {
    if (action.includes('login') || action.includes('auth')) return '🔐';
    if (action.includes('user')) return '👤';
    if (action.includes('tenant')) return '🏢';
    if (action.includes('system')) return '⚙️';
    return '🔔';
  };

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
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-4 space-y-2 animate-pulse">
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
                <div
                  key={notification.id}
                  className={`group relative flex items-start gap-4 p-4 transition-colors hover:bg-accent/5 ${isUnread ? 'bg-primary/10 dark:bg-primary/5' : ''}`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
                    {getIcon(notification.action)}
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
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
