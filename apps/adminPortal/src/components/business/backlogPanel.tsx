import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import type { BacklogSprint, BacklogTask, PaginatedResponse } from '@nodeadmin/shared-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/dataTable';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useApiClient } from '@/hooks/useApiClient';
import { TaskFormDialog } from './taskFormDialog';
import { SprintFormDialog } from './sprintFormDialog';
import { AssignTasksDialog } from './assignTasksDialog';

type TabKey = 'tasks' | 'sprints';

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<string, 'default' | 'outline' | 'destructive'> = {
  todo: 'outline',
  in_progress: 'default',
  done: 'default',
  cancelled: 'destructive',
  planning: 'outline',
  active: 'default',
  completed: 'default',
};

const PRIORITY_VARIANT: Record<string, 'default' | 'outline' | 'destructive'> = {
  low: 'outline',
  medium: 'default',
  high: 'default',
  critical: 'destructive',
};

export function BacklogPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('tasks');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);

  const handleTabChange = (tab: TabKey) => {
    if (tab === activeTab) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveTab(tab);
      setPage(0);
      setSearch('');
      setStatusFilter('');
      setIsTransitioning(false);
    }, 150);
  };

  // Task dialog state
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editTask, setEditTask] = useState<BacklogTask | undefined>();

  // Sprint dialog state
  const [sprintFormOpen, setSprintFormOpen] = useState(false);
  const [editSprint, setEditSprint] = useState<BacklogSprint | undefined>();
  const [assignTasksSprint, setAssignTasksSprint] = useState<BacklogSprint | undefined>();

  // Delete confirm state
  const [deleteTask, setDeleteTask] = useState<BacklogTask | undefined>();
  const [deleteSprint, setDeleteSprint] = useState<BacklogSprint | undefined>();

  // ─── Tasks Query ─────────────────────────────────────────────────
  const tasksQuery = useQuery<PaginatedResponse<BacklogTask>>({
    queryKey: ['backlog', 'tasks', page, search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        pageSize: String(PAGE_SIZE),
        page: String(page + 1),
      });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      return apiClient.get<PaginatedResponse<BacklogTask>>(
        `/api/v1/backlog/tasks?${params.toString()}`
      );
    },
  });

  // ─── Sprints Query ───────────────────────────────────────────────
  const sprintsQuery = useQuery<PaginatedResponse<BacklogSprint>>({
    queryKey: ['backlog', 'sprints', page, search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        pageSize: String(PAGE_SIZE),
        page: String(page + 1),
      });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      return apiClient.get<PaginatedResponse<BacklogSprint>>(
        `/api/v1/backlog/sprints?${params.toString()}`
      );
    },
  });

  const allSprintsQuery = useQuery<PaginatedResponse<BacklogSprint>>({
    queryKey: ['backlog', 'sprints', 'all'],
    queryFn: () => apiClient.get<PaginatedResponse<BacklogSprint>>('/api/v1/backlog/sprints?pageSize=100'),
  });

  const usersQuery = useQuery<PaginatedResponse<any>>({
    queryKey: ['users', 'all'],
    queryFn: () => apiClient.get<PaginatedResponse<any>>('/api/v1/users?pageSize=100'),
  });

  const sprintsMap = useMemo(() => {
    const map = new Map<string, string>();
    (allSprintsQuery.data?.items ?? []).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [allSprintsQuery.data]);

  const usersMap = useMemo(() => {
    const map = new Map<string, string>();
    (usersQuery.data?.items ?? []).forEach((u) => map.set(u.id, u.name || u.email));
    return map;
  }, [usersQuery.data]);

  // ─── Delete Mutations ────────────────────────────────────────────
  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/v1/backlog/tasks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backlog', 'tasks'] }),
  });

  const deleteSprintMutation = useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/v1/backlog/sprints/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backlog', 'sprints'] }),
  });

  // ─── Handlers ────────────────────────────────────────────────────
  const handleOpenCreateTask = () => {
    setEditTask(undefined);
    setTaskFormOpen(true);
  };

  const handleOpenEditTask = (task: BacklogTask) => {
    setEditTask(task);
    setTaskFormOpen(true);
  };

  const handleOpenCreateSprint = () => {
    setEditSprint(undefined);
    setSprintFormOpen(true);
  };

  const handleOpenEditSprint = (sprint: BacklogSprint) => {
    setEditSprint(sprint);
    setSprintFormOpen(true);
  };

  const handleTaskSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['backlog', 'tasks'] });
  };

  const handleSprintSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['backlog', 'sprints'] });
  };

  const totalPages =
    activeTab === 'tasks'
      ? Math.ceil((tasksQuery.data?.total ?? 0) / PAGE_SIZE)
      : Math.ceil((sprintsQuery.data?.total ?? 0) / PAGE_SIZE);

  return (
    <section className="h-full overflow-y-auto p-2 sm:p-4">
      <Card className="p-3 sm:p-4">
        <CardHeader className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0 p-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'backlog.title' })}</CardTitle>
            <CardDescription>{t({ id: 'backlog.desc' })}</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={activeTab === 'tasks' ? handleOpenCreateTask : handleOpenCreateSprint}
          >
            {activeTab === 'tasks'
              ? t({ id: 'backlog.createTask' })
              : t({ id: 'backlog.createSprint' })}
          </Button>
        </CardHeader>

        {/* Tab switcher */}
        <div className="mb-4 flex gap-1 rounded-lg border p-1">
          {(['tasks', 'sprints'] as TabKey[]).map((tab) => (
            <button
              key={tab}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
              onClick={() => handleTabChange(tab)}
            >
              {t({ id: tab === 'tasks' ? 'backlog.tabTasks' : 'backlog.tabSprints' })}
            </button>
          ))}
        </div>

        {/* Search + Filter */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <Input
            className="w-full sm:max-w-xs"
            placeholder={t({ id: 'backlog.search' })}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <select
            className="border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t({ id: 'backlog.allStatuses' })}</option>
            {activeTab === 'tasks'
              ? ['todo', 'in_progress', 'done', 'cancelled'].map((s) => (
                  <option key={s} value={s}>
                    {t({
                      id: `backlog.status${s.charAt(0).toUpperCase()}${s.slice(1).replace(/_./, (m) => m[1].toUpperCase())}`,
                    })}
                  </option>
                ))
              : ['planning', 'active', 'completed'].map((s) => (
                  <option key={s} value={s}>
                    {t({ id: `backlog.sprintStatus${s.charAt(0).toUpperCase()}${s.slice(1)}` })}
                  </option>
                ))}
          </select>
        </div>

        <div className={`transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <DataTable<BacklogTask>
              columns={[
              {
                header: t({ id: 'backlog.colTitle' }),
                cell: (row) => <span className="font-medium">{row.title}</span>,
              },
              {
                header: t({ id: 'backlog.colStatus' }),
                cell: (row) => (
                  <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{row.status}</Badge>
                ),
              },
              {
                header: t({ id: 'backlog.colPriority' }),
                className: 'hidden sm:table-cell',
                cell: (row) => (
                  <Badge variant={PRIORITY_VARIANT[row.priority] ?? 'default'}>
                    {row.priority}
                  </Badge>
                ),
              },
              {
                header: t({ id: 'backlog.colAssignee' }),
                className: 'hidden lg:table-cell',
                cell: (row) => (
                  <span className="text-sm text-muted-foreground">
                    {row.assignee_id ? (usersMap.get(row.assignee_id) ?? row.assignee_id) : '—'}
                  </span>
                ),
              },
              {
                header: t({ id: 'backlog.colSprint' }),
                className: 'hidden lg:table-cell',
                cell: (row) => (
                  <span className="text-sm text-muted-foreground">
                    {row.sprint_id ? (sprintsMap.get(row.sprint_id) ?? row.sprint_id) : '—'}
                  </span>
                ),
              },
              {
                header: t({ id: 'backlog.colActions' }),
                cell: (row) => (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => handleOpenEditTask(row)}>
                      {t({ id: 'backlog.edit' })}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setDeleteTask(row)}>
                      {t({ id: 'backlog.delete' })}
                    </Button>
                  </div>
                ),
              },
            ]}
            data={tasksQuery.data?.items ?? []}
            emptyMessage={t({ id: 'backlog.emptyTasks' })}
            errorMessage={t({ id: 'backlog.loadFailed' })}
            isError={tasksQuery.isError}
            isLoading={tasksQuery.isFetching}
            onRetry={() => tasksQuery.refetch()}
            retryLabel={t({ id: 'common.retry' })}
            rowKey={(row) => row.id}
            pagination={
              totalPages > 1
                ? {
                    page,
                    totalPages,
                    onPageChange: setPage,
                    pageInfo: t(
                      { id: 'users.pageInfo' },
                      { page: page + 1, total: tasksQuery.data?.total ?? 0 }
                    ),
                    prevLabel: t({ id: 'users.prev' }),
                    nextLabel: t({ id: 'users.next' }),
                  }
                : undefined
            }
          />
        )}

        {/* Sprints Tab */}
        {activeTab === 'sprints' && (
          <DataTable<BacklogSprint>
            columns={[
              {
                header: t({ id: 'backlog.colSprintName' }),
                cell: (row) => <span className="font-medium">{row.name}</span>,
              },
              {
                header: t({ id: 'backlog.colStatus' }),
                cell: (row) => (
                  <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{row.status}</Badge>
                ),
              },
              {
                header: t({ id: 'backlog.colDates' }),
                className: 'hidden sm:table-cell',
                cell: (row) => (
                  <span className="text-sm text-muted-foreground">
                    {row.start_date && row.end_date ? `${row.start_date} → ${row.end_date}` : '—'}
                  </span>
                ),
              },
              {
                header: t({ id: 'backlog.colActions' }),
                cell: (row) => (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setAssignTasksSprint(row)}
                    >
                      {t({ id: 'backlog.assignTasks' })}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleOpenEditSprint(row)}>
                      {t({ id: 'backlog.edit' })}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setDeleteSprint(row)}>
                      {t({ id: 'backlog.delete' })}
                    </Button>
                  </div>
                ),
              },
            ]}
            data={sprintsQuery.data?.items ?? []}
            emptyMessage={t({ id: 'backlog.emptySprints' })}
            errorMessage={t({ id: 'backlog.loadFailed' })}
            isError={sprintsQuery.isError}
            isLoading={sprintsQuery.isFetching}
            onRetry={() => sprintsQuery.refetch()}
            retryLabel={t({ id: 'common.retry' })}
            rowKey={(row) => row.id}
            pagination={
              totalPages > 1
                ? {
                    page,
                    totalPages,
                    onPageChange: setPage,
                    pageInfo: t(
                      { id: 'users.pageInfo' },
                      { page: page + 1, total: sprintsQuery.data?.total ?? 0 }
                    ),
                    prevLabel: t({ id: 'users.prev' }),
                    nextLabel: t({ id: 'users.next' }),
                  }
                : undefined
            }
          />
        )}
      </div>
    </Card>

    <TaskFormDialog
        key={editTask?.id ?? 'create'}
        onClose={() => setTaskFormOpen(false)}
        onSaved={handleTaskSaved}
        open={taskFormOpen}
        task={editTask}
      />
      <SprintFormDialog
        key={editSprint?.id ?? 'create'}
        onClose={() => setSprintFormOpen(false)}
        onSaved={handleSprintSaved}
        open={sprintFormOpen}
        sprint={editSprint}
      />

      {assignTasksSprint && (
        <AssignTasksDialog
          key={`assign-${assignTasksSprint.id}`}
          onClose={() => setAssignTasksSprint(undefined)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['backlog', 'tasks'] });
          }}
          open={!!assignTasksSprint}
          sprint={assignTasksSprint}
        />
      )}

      <ConfirmDialog
        message={t({ id: 'backlog.deleteTaskConfirm' })}
        onClose={() => setDeleteTask(undefined)}
        onConfirm={async () => {
          if (deleteTask) {
            await deleteTaskMutation.mutateAsync(deleteTask.id);
            setDeleteTask(undefined);
          }
        }}
        open={!!deleteTask}
        title={t({ id: 'backlog.deleteTask' })}
      />
      <ConfirmDialog
        message={t({ id: 'backlog.deleteSprintConfirm' })}
        onClose={() => setDeleteSprint(undefined)}
        onConfirm={async () => {
          if (deleteSprint) {
            await deleteSprintMutation.mutateAsync(deleteSprint.id);
            setDeleteSprint(undefined);
          }
        }}
        open={!!deleteSprint}
        title={t({ id: 'backlog.deleteSprint' })}
      />
    </section>
  );
}
