import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import type { BacklogSprint } from '@nodeadmin/shared-types';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/hooks/useApiClient';

const SPRINT_STATUS_OPTIONS = [
  { value: 'planning', labelId: 'backlog.sprintStatusPlanning' },
  { value: 'active', labelId: 'backlog.sprintStatusActive' },
  { value: 'completed', labelId: 'backlog.sprintStatusCompleted' },
];

interface SprintFormDialogProps {
  open: boolean;
  onClose: () => void;
  sprint?: BacklogSprint;
  onSaved: () => void;
}

export function SprintFormDialog({
  onClose,
  onSaved,
  open,
  sprint,
}: SprintFormDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();

  const [name, setName] = useState(sprint?.name ?? '');
  const [goal, setGoal] = useState(sprint?.goal ?? '');
  const [status, setStatus] = useState(sprint?.status ?? 'planning');
  const [startDate, setStartDate] = useState(sprint?.start_date ?? '');
  const [endDate, setEndDate] = useState(sprint?.end_date ?? '');

  const isEdit = !!sprint;

  const saveMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      goal: string;
      status: string;
      startDate: string;
      endDate: string;
    }) => {
      if (isEdit && sprint) {
        await apiClient.patch(`/api/v1/backlog/sprints/${sprint.id}`, data);
      } else {
        await apiClient.post('/api/v1/backlog/sprints', data);
      }
    },
    onSuccess: () => {
      onSaved();
      handleClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({ name, goal, status, startDate, endDate });
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog
      onClose={handleClose}
      open={open}
      title={t({ id: isEdit ? 'backlog.editSprint' : 'backlog.createSprint' })}
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <FormField label={t({ id: 'backlog.fieldSprintName' })} htmlFor="sprint-name">
            <Input
              id="sprint-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <FormField label={t({ id: 'backlog.fieldSprintGoal' })} htmlFor="sprint-goal">
            <textarea
              className="border-input bg-background ring-ring flex min-h-[60px] w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
              id="sprint-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </FormField>

          <FormField label={t({ id: 'backlog.fieldStatus' })} htmlFor="sprint-status">
            <select
              className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
              id="sprint-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {SPRINT_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t({ id: opt.labelId })}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t({ id: 'backlog.fieldStartDate' })} htmlFor="sprint-start">
              <Input
                id="sprint-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </FormField>
            <FormField label={t({ id: 'backlog.fieldEndDate' })} htmlFor="sprint-end">
              <Input
                id="sprint-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </FormField>
          </div>
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
