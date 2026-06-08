import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { BacklogService } from './backlogService';

interface QueryCall {
  sql: string;
  params?: unknown[];
}

/** A fake pg client that records queries and answers based on the SQL shape. */
function createFakeClient(rowsBySql: (sql: string) => unknown[]) {
  const calls: QueryCall[] = [];
  const release = vi.fn();
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return { rows: rowsBySql(sql), rowCount: rowsBySql(sql).length };
  });
  return { client: { query, release }, calls, release };
}

function poolReturning(client: { query: unknown; release: unknown }): Pool {
  return { connect: vi.fn(async () => client) } as unknown as Pool;
}

describe('BacklogService (plugin)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes listTasks by tenant via RLS set_config and builds status/search filters', async () => {
    const { client, calls } = createFakeClient((sql) =>
      sql.includes('COUNT') ? [{ count: 1 }] : sql.startsWith('SELECT t.*') ? [{ id: 'task-1', title: 'A' }] : [],
    );
    const service = new BacklogService(poolReturning(client));

    const result = await service.listTasks('tenant-1', 1, 20, { status: 'todo', search: 'log' });

    expect(result).toEqual({ items: [{ id: 'task-1', title: 'A' }], total: 1, page: 1, pageSize: 20 });
    const setConfig = calls.find((c) => c.sql.includes('set_config'));
    expect(setConfig?.params).toEqual(['tenant-1']);
    const select = calls.find((c) => c.sql.startsWith('SELECT t.*'));
    expect(select?.sql).toContain('t.status = $2');
    expect(select?.sql).toContain('t.title ILIKE $3');
    expect(client.release).toHaveBeenCalled();
  });

  it('createTask inserts inside a tenant-scoped transaction then returns the row', async () => {
    const { client, calls } = createFakeClient((sql) =>
      sql.startsWith('SELECT * FROM backlog_tasks') ? [{ id: 'new', title: 'T' }] : [],
    );
    const service = new BacklogService(poolReturning(client));

    const created = await service.createTask('tenant-9', { title: 'T' });

    expect(created).toEqual({ id: 'new', title: 'T' });
    expect(calls.some((c) => c.sql === 'BEGIN')).toBe(true);
    expect(calls.some((c) => c.sql === 'COMMIT')).toBe(true);
    expect(calls.some((c) => c.sql.includes('INSERT INTO backlog_tasks'))).toBe(true);
    // a generated id is used and default status/priority are applied
    const insert = calls.find((c) => c.sql.includes('INSERT INTO backlog_tasks'));
    expect(insert?.params).toEqual([expect.any(String), 'tenant-9', 'T', null, 'todo', 'medium', null, null, null]);
  });

  it('removeTask throws NotFoundException and rolls back when nothing is deleted', async () => {
    const { client, calls } = createFakeClient(() => []);
    const service = new BacklogService(poolReturning(client));

    await expect(service.removeTask('tenant-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('assignTasksToSprint verifies the sprint exists before reassigning tasks', async () => {
    const { client, calls } = createFakeClient((sql) =>
      sql.startsWith('SELECT * FROM backlog_sprints')
        ? [{ id: 'sprint-1' }]
        : sql.startsWith('SELECT t.*')
          ? []
          : sql.includes('COUNT')
            ? [{ count: 0 }]
            : [],
    );
    const service = new BacklogService(poolReturning(client));

    await service.assignTasksToSprint('tenant-1', 'sprint-1', ['t1', 't2']);

    const updates = calls.filter((c) => c.sql.includes('UPDATE backlog_tasks SET sprint_id'));
    expect(updates).toHaveLength(2);
    expect(updates[0].params).toEqual(['sprint-1', 'tenant-1', 't1']);
  });
});
