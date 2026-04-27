import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import type { BacklogTask, BacklogSprint, UserItem, PaginatedResponse } from '@nodeadmin/shared-types';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { Button } from '@/components/ui/button';

import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/useAuthStore';
import { useApiClient } from '@/hooks/useApiClient';

const STATUS_OPTIONS = [
  { value: 'todo', labelId: 'backlog.statusTodo' },
  { value: 'in_progress', labelId: 'backlog.statusInProgress' },
  { value: 'done', labelId: 'backlog.statusDone' },
  { value: 'cancelled', labelId: 'backlog.statusCancelled' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', labelId: 'backlog.priorityLow' },
  { value: 'medium', labelId: 'backlog.priorityMedium' },
  { value: 'high', labelId: 'backlog.priorityHigh' },
  { value: 'critical', labelId: 'backlog.priorityCritical' },
];

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  task?: BacklogTask;
  onSaved: () => void;
}

export function TaskFormDialog({ onClose, onSaved, open, task }: TaskFormDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();
  const tenantId = useAuthStore((s) => s.tenantId);

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState(task?.status ?? 'todo');
  const [priority, setPriority] = useState(task?.priority ?? 'medium');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '');
  const [sprintId, setSprintId] = useState(task?.sprint_id ?? '');

  const isEdit = !!task;

  const usersQuery = useQuery({
    queryFn: () => apiClient.get<PaginatedResponse<UserItem>>('/api/v1/users?pageSize=100'),
    queryKey: ['users', 'list'],
    enabled: open,
  });

  const sprintsQuery = useQuery({
    queryFn: () => apiClient.get<PaginatedResponse<BacklogSprint>>('/api/v1/backlog/sprints?pageSize=100'),
    queryKey: ['backlog', 'sprints', 'list'],
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description: string;
      status: string;
      priority: string;
      assigneeId: string | null;
      sprintId: string | null;
      tenantId: string;
    }) => {
      if (isEdit && task) {
        // For PATCH: only send fields defined in UpdateTaskDto.
        // Strip null values (backend @IsString() rejects null) and tenantId (not in UpdateTaskDto).
        const payload: Record<string, string> = {};
        for (const [key, value] of Object.entries(data)) {
          if (value !== null && value !== undefined && key !== 'tenantId') {
            payload[key] = value;
          }
        }
        await apiClient.patch(`/api/v1/backlog/tasks/${task.id}?tenantId=${data.tenantId}`, payload);
      } else {
        await apiClient.post('/api/v1/backlog/tasks', data);
      }
    },
    onSuccess: () => {
      toast.success(t({ id: 'backlog.saveTaskSuccess' }));
      onSaved();
      handleClose();
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t({ id: 'backlog.saveFailed' });
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      title,
      description,
      status,
      priority,
      assigneeId: assigneeId || null,
      sprintId: sprintId || null,
      tenantId: tenantId ?? 'default',
    });
  };

  const handleClose = () => {
    onClose();
  };

  const users = usersQuery.data?.items ?? [];
  const sprints = sprintsQuery.data?.items ?? [];

  return (
    <Dialog onClose={handleClose} open={open} title={t({ id: isEdit ? 'backlog.editTask' : 'backlog.createTask' })}>
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <FormField label={t({ id: 'backlog.fieldTitle' })} htmlFor="task-title">
            <Input id="task-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>

          <FormField label={t({ id: 'backlog.fieldDescription' })} htmlFor="task-desc">
            <textarea
              className="border-input bg-background ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label={t({ id: 'backlog.fieldStatus' })} htmlFor="task-status">
              <select
                className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
                id="task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t({ id: opt.labelId })}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label={t({ id: 'backlog.fieldPriority' })} htmlFor="task-priority">
              <select
                className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t({ id: opt.labelId })}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label={t({ id: 'backlog.colAssignee' })} htmlFor="task-assignee">
              <select
                className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
                id="task-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label={t({ id: 'backlog.colSprint' })} htmlFor="task-sprint">
              <select
                className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
                id="task-sprint"
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
              >
                <option value="">—</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button disabled={saveMutation.isPending} type="button" variant="secondary" onClick={handleClose}>
            {t({ id: 'common.cancel' })}
          </Button>
          <Button disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending ? (
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
                {t({ id: 'common.saving' })}
              </>
            ) : (
              t({ id: 'common.save' })
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
