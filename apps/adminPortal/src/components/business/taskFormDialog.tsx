import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import type { BacklogTask } from '@nodeadmin/shared-types';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { Button } from '@/components/ui/button';
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

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState(task?.status ?? 'todo');
  const [priority, setPriority] = useState(task?.priority ?? 'medium');

  const isEdit = !!task;

  const saveMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description: string;
      status: string;
      priority: string;
    }) => {
      if (isEdit && task) {
        await apiClient.patch(`/api/v1/backlog/tasks/${task.id}`, data);
      } else {
        await apiClient.post('/api/v1/backlog/tasks', data);
      }
    },
    onSuccess: () => {
      onSaved();
      handleClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({ title, description, status, priority });
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog
      onClose={handleClose}
      open={open}
      title={t({ id: isEdit ? 'backlog.editTask' : 'backlog.createTask' })}
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <FormField label={t({ id: 'backlog.fieldTitle' })} htmlFor="task-title">
            <Input
              id="task-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormField>

          <FormField label={t({ id: 'backlog.fieldDescription' })} htmlFor="task-desc">
            <textarea
              className="border-input bg-background ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>

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

        <div className="mt-6 flex justify-end gap-3">
          <Button
            disabled={saveMutation.isPending}
            type="button"
            variant="secondary"
            onClick={handleClose}
          >
            {t({ id: 'common.cancel' })}
          </Button>
          <Button disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending ? '...' : t({ id: 'common.save' })}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
