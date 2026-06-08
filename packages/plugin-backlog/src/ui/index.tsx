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

// Reuse the host's design tokens (CSS variables on the document root) so the plugin UI matches the
// app theme and adapts to light/dark automatically, instead of hard-coding hex colours.
const RADIUS = 'var(--radius)';
const MUTED_TEXT_STYLE: React.CSSProperties = { color: 'hsl(var(--muted-foreground))' };
const INPUT_STYLE: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem 0.75rem',
  border: '1px solid hsl(var(--input))',
  borderRadius: RADIUS,
  background: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
  outline: 'none',
};
const BUTTON_PRIMARY_STYLE: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'hsl(var(--primary))',
  color: 'hsl(var(--primary-foreground))',
  border: 'none',
  borderRadius: RADIUS,
  fontWeight: 500,
  cursor: 'pointer',
};
const BUTTON_SECONDARY_STYLE: React.CSSProperties = {
  padding: '0.25rem 0.75rem',
  background: 'transparent',
  color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--border))',
  borderRadius: RADIUS,
  cursor: 'pointer',
};
const BUTTON_DESTRUCTIVE_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'hsl(var(--destructive))',
  cursor: 'pointer',
  padding: 0,
};

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
      setError('加载失败');
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
      host.toast.success('任务已创建');
      setNewTitle('');
      await reload();
    } catch {
      host.toast.error('创建任务失败');
    }
  }, [host, newTitle, reload]);

  const deleteTask = useCallback(
    async (id: string) => {
      try {
        await host.apiClient.del(`${TASKS_PATH}/${id}`);
        host.toast.success('任务已删除');
        await reload();
      } catch {
        host.toast.error('删除任务失败');
      }
    },
    [host, reload],
  );

  if (loading) {
    return <div style={{ padding: '2rem' }}>{'加载中…'}</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'hsl(var(--destructive))' }}>
        {error}{' '}
        <button onClick={() => void reload()} style={BUTTON_SECONDARY_STYLE}>
          {'重试'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Backlog</h1>
        <p style={{ ...MUTED_TEXT_STYLE, fontSize: '0.875rem' }}>
          {tasks.length} tasks · {sprints.length} sprints
        </p>
      </header>

      {canManage && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={'新任务标题…'}
            style={INPUT_STYLE}
          />
          <button onClick={() => void createTask()} style={BUTTON_PRIMARY_STYLE}>
            {'添加任务'}
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
    return <p style={MUTED_TEXT_STYLE}>{'暂无任务'}</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
      <thead>
        <tr style={{ ...MUTED_TEXT_STYLE, textAlign: 'left', borderBottom: '1px solid hsl(var(--border))' }}>
          <th style={{ padding: '0.5rem', fontWeight: 500 }}>{'标题'}</th>
          <th style={{ padding: '0.5rem', fontWeight: 500 }}>{'状态'}</th>
          <th style={{ padding: '0.5rem', fontWeight: 500 }}>{'优先级'}</th>
          <th style={{ padding: '0.5rem', fontWeight: 500 }}>{'Sprint'}</th>
          {canManage && <th style={{ padding: '0.5rem' }} />}
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr key={task.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
            <td style={{ padding: '0.5rem' }}>{task.title}</td>
            <td style={{ padding: '0.5rem' }}>{task.status}</td>
            <td style={{ padding: '0.5rem' }}>{task.priority}</td>
            <td style={{ padding: '0.5rem' }}>{sprintName(task.sprint_id)}</td>
            {canManage && (
              <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                <button onClick={() => onDelete(task.id)} style={BUTTON_DESTRUCTIVE_STYLE}>
                  {'删除'}
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
