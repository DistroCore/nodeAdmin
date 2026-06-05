import React, { useCallback, useEffect, useState } from 'react';
import type { PluginComponentProps, PluginHost } from '@nodeadmin/shared-types';

// Self-contained types — the plugin no longer leans on core shared-types for its domain model.
interface BacklogTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  sprint_id: string | null;
}

interface BacklogSprint {
  id: string;
  name: string;
  status: string;
}

interface Paginated<T> {
  items: T[];
  total: number;
}

const TASKS_PATH = '/api/v1/plugins/backlog/tasks';
const SPRINTS_PATH = '/api/v1/plugins/backlog/sprints';

export default function BacklogPlugin({ host }: PluginComponentProps) {
  const canManage = host.hasPermission('backlog:manage');
  const [tasks, setTasks] = useState<BacklogTask[]>([]);
  const [sprints, setSprints] = useState<BacklogSprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskPage, sprintPage] = await Promise.all([
        host.apiClient.get<Paginated<BacklogTask>>(`${TASKS_PATH}?pageSize=100`),
        host.apiClient.get<Paginated<BacklogSprint>>(`${SPRINTS_PATH}?pageSize=100`),
      ]);
      setTasks(taskPage.items);
      setSprints(sprintPage.items);
    } catch {
      setError(host.translate('backlog.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [host]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createTask = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await host.apiClient.post(TASKS_PATH, { title, tenantId: host.tenantId });
      host.toast.success(host.translate('backlog.task_created'));
      setNewTitle('');
      await reload();
    } catch {
      host.toast.error(host.translate('backlog.task_create_failed'));
    }
  }, [host, newTitle, reload]);

  const deleteTask = useCallback(
    async (id: string) => {
      try {
        await host.apiClient.del(`${TASKS_PATH}/${id}`);
        host.toast.success(host.translate('backlog.task_deleted'));
        await reload();
      } catch {
        host.toast.error(host.translate('backlog.task_delete_failed'));
      }
    },
    [host, reload],
  );

  if (loading) {
    return <div style={{ padding: '2rem' }}>{host.translate('backlog.loading')}</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: '#b91c1c' }}>
        {error} <button onClick={() => void reload()}>{host.translate('backlog.retry')}</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Backlog</h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          {tasks.length} tasks · {sprints.length} sprints
        </p>
      </header>

      {canManage && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={host.translate('backlog.new_task_placeholder')}
            style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
          />
          <button
            onClick={() => void createTask()}
            style={{ padding: '0.5rem 1rem', background: '#2563eb', color: '#fff', borderRadius: '0.375rem' }}
          >
            {host.translate('backlog.add_task')}
          </button>
        </div>
      )}

      <TaskTable tasks={tasks} sprints={sprints} canManage={canManage} onDelete={deleteTask} host={host} />
    </div>
  );
}

function TaskTable({
  tasks,
  sprints,
  canManage,
  onDelete,
  host,
}: {
  tasks: BacklogTask[];
  sprints: BacklogSprint[];
  canManage: boolean;
  onDelete: (id: string) => void;
  host: PluginHost;
}) {
  const sprintName = (id: string | null) => (id ? (sprints.find((s) => s.id === id)?.name ?? id) : '—');

  if (tasks.length === 0) {
    return <p style={{ color: '#6b7280' }}>{host.translate('backlog.no_tasks')}</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
          <th style={{ padding: '0.5rem' }}>{host.translate('backlog.col_title')}</th>
          <th style={{ padding: '0.5rem' }}>{host.translate('backlog.col_status')}</th>
          <th style={{ padding: '0.5rem' }}>{host.translate('backlog.col_priority')}</th>
          <th style={{ padding: '0.5rem' }}>{host.translate('backlog.col_sprint')}</th>
          {canManage && <th style={{ padding: '0.5rem' }} />}
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr key={task.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
            <td style={{ padding: '0.5rem' }}>{task.title}</td>
            <td style={{ padding: '0.5rem' }}>{task.status}</td>
            <td style={{ padding: '0.5rem' }}>{task.priority}</td>
            <td style={{ padding: '0.5rem' }}>{sprintName(task.sprint_id)}</td>
            {canManage && (
              <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                <button onClick={() => onDelete(task.id)} style={{ color: '#b91c1c' }}>
                  {host.translate('backlog.delete')}
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
