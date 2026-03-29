import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useQuery } from '@tanstack/react-query';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Timeline } from '@/components/ui/timeline';
import type { TimelineItem } from '@/components/ui/timeline';
import { useApiClient } from '@/hooks/useApiClient';
import type { AuditLogItem, PaginatedResponse } from '@nodeadmin/shared-types';

const PAGE_SIZE = 20;

const ACTION_OPTIONS = [
  { value: 'user.create', label: 'user.create' },
  { value: 'user.update', label: 'user.update' },
  { value: 'user.delete', label: 'user.delete' },
  { value: 'role.create', label: 'role.create' },
  { value: 'role.update', label: 'role.update' },
  { value: 'role.delete', label: 'role.delete' },
  { value: 'auth.login', label: 'auth.login' },
];

function getActionColor(action: string): string {
  if (action.includes('create')) return 'bg-green-500';
  if (action.includes('update')) return 'bg-yellow-500';
  if (action.includes('delete')) return 'bg-red-500';
  if (action.includes('login')) return 'bg-blue-500';
  return 'bg-gray-500';
}

function getActionVerb(action: string): string {
  const parts = action.split('.');
  return parts[parts.length - 1] ?? action;
}

export function AuditLogPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (actionFilter) params.set('action', actionFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return params.toString();
  }, [page, actionFilter, startDate, endDate]);

  const query = useQuery({
    queryFn: () =>
      apiClient.get<PaginatedResponse<AuditLogItem>>(
        `/api/v1/console/audit-logs?${queryParams}`,
      ),
    queryKey: ['audit-logs', queryParams],
  });

  const total = query.data?.total ?? 0;
  const hasMore = page * PAGE_SIZE < total;

  const timelineItems: TimelineItem[] = useMemo(() => {
    const rawItems = query.data?.items ?? [];
    const filteredBySearch = search
      ? rawItems.filter(
          (item) =>
            item.userId.toLowerCase().includes(search.toLowerCase()) ||
            item.action.toLowerCase().includes(search.toLowerCase()),
        )
      : rawItems;

    return filteredBySearch.map((item) => ({
      id: item.id,
      icon: (
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${getActionColor(item.action)}`}
        >
          {item.action.includes('create')
            ? '+'
            : item.action.includes('delete')
              ? '-'
              : item.action.includes('login')
                ? '\u2192'
                : '~'}
        </div>
      ),
      title: (
        <span>
          <span className="font-medium">{item.userId}</span>{' '}
          {t({ id: `audit.action.${getActionVerb(item.action)}` })}{' '}
          <span className="font-medium">{item.targetType ?? ''}</span>
        </span>
      ),
      subtitle: item.targetId ? `${item.targetType}/${item.targetId}` : undefined,
      timestamp: new Date(item.createdAt).toLocaleString(),
    }));
  }, [query.data?.items, search, t]);

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  return (
    <section className="h-full overflow-y-auto">
      <Card className="p-4">
        <CardHeader className="mb-4 space-y-1.5 p-0">
          <CardTitle className="text-base">{t({ id: 'audit.title' })}</CardTitle>
          <CardDescription>{t({ id: 'audit.desc' })}</CardDescription>
        </CardHeader>

        <div className="mb-4 flex flex-wrap gap-2">
          <div className="w-48">
            <Input
              placeholder={t({ id: 'audit.search' })}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              options={ACTION_OPTIONS}
              value={actionFilter}
              onChange={(val) => {
                setActionFilter(val);
                setPage(1);
              }}
              placeholder={t({ id: 'audit.allActions' })}
            />
          </div>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            placeholder={t({ id: 'audit.startDate' })}
            className="w-36"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            placeholder={t({ id: 'audit.endDate' })}
            className="w-36"
          />
        </div>

        <Timeline
          emptyMessage={t({ id: 'audit.empty' })}
          errorMessage={t({ id: 'audit.loadFailed' })}
          hasMore={hasMore}
          isError={query.isError}
          isLoading={query.isLoading}
          items={timelineItems}
          loadMoreLabel={t({ id: 'audit.loadMore' })}
          onLoadMore={handleLoadMore}
          onRetry={() => query.refetch()}
        />
      </Card>
    </section>
  );
}
