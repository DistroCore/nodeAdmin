import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import type { BacklogTask, BacklogSprint, PaginatedResponse } from '@nodeadmin/shared-types';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';

interface AssignTasksDialogProps {
  open: boolean;
  onClose: () => void;
  sprint: BacklogSprint;
  onSaved: () => void;
}

export function AssignTasksDialog({ onClose, onSaved, open, sprint }: AssignTasksDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Fetch unassigned tasks or tasks assigned to this sprint
  const tasksQuery = useQuery({
    queryFn: () => apiClient.get<PaginatedResponse<BacklogTask>>('/api/v1/backlog/tasks?pageSize=100'),
    queryKey: ['backlog', 'tasks', 'all-for-assign'],
    enabled: open,
  });

  const assignMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      await apiClient.post(`/api/v1/backlog/sprints/${sprint.id}/tasks`, { taskIds });
    },
    onSuccess: () => {
      toast.success(t({ id: 'backlog.assignSuccess' }));
      onSaved();
      onClose();
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t({ id: 'backlog.loadFailed' });
      toast.error(message);
    },
  });

  const handleToggleTask = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    assignMutation.mutate(Array.from(selectedTaskIds));
  };

  const tasks = (tasksQuery.data?.items ?? []).filter((task) => !task.sprint_id || task.sprint_id === sprint.id);

  // Initialize selectedTaskIds when dialog opens
  useState(() => {
    const initial = new Set(
      (tasksQuery.data?.items ?? []).filter((task) => task.sprint_id === sprint.id).map((task) => task.id),
    );
    setSelectedTaskIds(initial);
  });

  return (
    <Dialog onClose={onClose} open={open} title={`${t({ id: 'backlog.assignTasks' })}: ${sprint.name}`}>
      <form onSubmit={handleSubmit}>
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border p-3">
          {tasksQuery.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24">
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
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">{t({ id: 'backlog.emptyTasks' })}</div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 py-1">
                <Checkbox
                  id={`task-${task.id}`}
                  checked={selectedTaskIds.has(task.id)}
                  onChange={() => handleToggleTask(task.id)}
                  label={task.title}
                />
              </div>
            ))
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button disabled={assignMutation.isPending} type="button" variant="secondary" onClick={onClose}>
            {t({ id: 'common.cancel' })}
          </Button>
          <Button disabled={assignMutation.isPending} type="submit">
            {assignMutation.isPending ? (
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
