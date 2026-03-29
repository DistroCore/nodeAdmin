import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

import { BacklogService } from './backlogService';

describe('BacklogService', () => {
  let service: BacklogService;

  beforeEach(() => {
    service = new BacklogService();
  });

  // ─── listTasks ──────────────────────────────────────────────────

  describe('listTasks', () => {
    it('should return empty result when pool is null', async () => {
      const result = await service.listTasks('tenant-1');
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it('should query tasks with pagination', async () => {
      const mockPool = createMockPool([
        { rows: [{ count: 1 }], rowCount: 1 },
        { rows: [{ id: 'task-1', title: 'Task 1' }], rowCount: 1 },
      ]);
      (service as any).pool = mockPool;

      const result = await service.listTasks('tenant-1', 1, 20);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('should apply status filter', async () => {
      const mockPool = createMockPool([
        { rows: [{ count: 0 }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      (service as any).pool = mockPool;

      await service.listTasks('tenant-1', 1, 20, { status: 'todo' });

      // Second call should include status condition
      const countQuery = mockPool.query.mock.calls[0][0] as string;
      expect(countQuery).toContain('t.status = $2');
    });

    it('should apply sprintId filter', async () => {
      const mockPool = createMockPool([
        { rows: [{ count: 0 }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      (service as any).pool = mockPool;

      await service.listTasks('tenant-1', 1, 20, { sprintId: 'sprint-1' });

      const countQuery = mockPool.query.mock.calls[0][0] as string;
      expect(countQuery).toContain('t.sprint_id = $2');
    });

    it('should apply search filter with ILIKE', async () => {
      const mockPool = createMockPool([
        { rows: [{ count: 0 }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      (service as any).pool = mockPool;

      await service.listTasks('tenant-1', 1, 20, { search: 'bug' });

      const countQuery = mockPool.query.mock.calls[0][0] as string;
      expect(countQuery).toContain('t.title ILIKE $2');
      const params = mockPool.query.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('%bug%');
    });
  });

  // ─── findTaskById ───────────────────────────────────────────────

  describe('findTaskById', () => {
    it('should throw NotFoundException when pool is null', async () => {
      await expect(service.findTaskById('tenant-1', 'task-1')).rejects.toThrow(
        'Task not found'
      );
    });

    it('should throw NotFoundException when task does not exist', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as any).pool = mockPool;

      await expect(service.findTaskById('tenant-1', 'task-1')).rejects.toThrow(
        'Task not found'
      );
    });

    it('should return task when found', async () => {
      const task = { id: 'task-1', title: 'My Task', tenant_id: 'tenant-1' };
      const mockPool = createMockPool([{ rows: [task], rowCount: 1 }]);
      (service as any).pool = mockPool;

      const result = await service.findTaskById('tenant-1', 'task-1');
      expect(result).toEqual(task);
    });
  });

  // ─── createTask ─────────────────────────────────────────────────

  describe('createTask', () => {
    it('should throw when pool is null', async () => {
      await expect(
        service.createTask('tenant-1', { title: 'Task' })
      ).rejects.toThrow('Database not available');
    });

    it('should create task and return it via findTaskById', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN response
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 1 }, // INSERT
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        { rows: [{ id: 'task-new', title: 'New Task' }], rowCount: 1 }, // findTaskById
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      const result = await service.createTask('tenant-1', { title: 'New Task' });
      expect(result.title).toBe('New Task');

      const beginCall = mockClient.calls.find((c) => c.sql === 'BEGIN');
      expect(beginCall).toBeDefined();
      const commitCall = mockClient.calls.find((c) => c.sql === 'COMMIT');
      expect(commitCall).toBeDefined();
    });

    it('should rollback on INSERT failure', async () => {
      const mockClient = createMockClient([]);
      mockClient.query.mockImplementation(async (sql: string) => {
        mockClient.calls.push({ sql, params: [] });
        if (sql.includes('INSERT INTO backlog_tasks')) {
          throw new Error('DB insert error');
        }
        return { rows: [], rowCount: 0 };
      });
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await expect(
        service.createTask('tenant-1', { title: 'Fail' })
      ).rejects.toThrow('DB insert error');

      const rollbackCall = mockClient.calls.find((c) => c.sql === 'ROLLBACK');
      expect(rollbackCall).toBeDefined();
    });
  });

  // ─── updateTask ─────────────────────────────────────────────────

  describe('updateTask', () => {
    it('should throw when pool is null', async () => {
      await expect(
        service.updateTask('tenant-1', 'task-1', { title: 'Updated' })
      ).rejects.toThrow('Database not available');
    });

    it('should update specified fields and return updated task', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 1 }, // UPDATE
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        { rows: [{ id: 'task-1', title: 'Updated' }], rowCount: 1 }, // findTaskById
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      const result = await service.updateTask('tenant-1', 'task-1', {
        title: 'Updated',
        status: 'done',
      });
      expect(result.title).toBe('Updated');

      const updateCall = mockClient.calls.find((c) => c.sql.includes('UPDATE backlog_tasks'));
      expect(updateCall).toBeDefined();
      expect(updateCall!.sql).toContain('title');
      expect(updateCall!.sql).toContain('status');
    });

    it('should rollback on UPDATE failure', async () => {
      const mockClient = createMockClient([]);
      mockClient.query.mockImplementation(async (sql: string) => {
        mockClient.calls.push({ sql, params: [] });
        if (sql.includes('UPDATE backlog_tasks')) {
          throw new Error('DB update error');
        }
        return { rows: [], rowCount: 0 };
      });
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await expect(
        service.updateTask('tenant-1', 'task-1', { title: 'Fail' })
      ).rejects.toThrow('DB update error');

      const rollbackCall = mockClient.calls.find((c) => c.sql === 'ROLLBACK');
      expect(rollbackCall).toBeDefined();
    });
  });

  // ─── removeTask ─────────────────────────────────────────────────

  describe('removeTask', () => {
    it('should throw when pool is null', async () => {
      await expect(service.removeTask('tenant-1', 'task-1')).rejects.toThrow(
        'Database not available'
      );
    });

    it('should delete task within transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [{ id: 'task-1' }], rowCount: 1 }, // DELETE RETURNING
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await service.removeTask('tenant-1', 'task-1');

      const deleteCall = mockClient.calls.find((c) => c.sql.includes('DELETE FROM backlog_tasks'));
      expect(deleteCall).toBeDefined();
      const commitCall = mockClient.calls.find((c) => c.sql === 'COMMIT');
      expect(commitCall).toBeDefined();
    });

    it('should throw NotFoundException when task not found', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 0 }, // DELETE RETURNING (empty)
        { rows: [], rowCount: 0 }, // COMMIT (not reached but queued)
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await expect(service.removeTask('tenant-1', 'task-1')).rejects.toThrow(
        'Task not found'
      );
    });
  });

  // ─── listSprints ────────────────────────────────────────────────

  describe('listSprints', () => {
    it('should return empty result when pool is null', async () => {
      const result = await service.listSprints('tenant-1');
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it('should query sprints with pagination', async () => {
      const mockPool = createMockPool([
        { rows: [{ count: 2 }], rowCount: 1 },
        {
          rows: [{ id: 'sprint-1' }, { id: 'sprint-2' }],
          rowCount: 2,
        },
      ]);
      (service as any).pool = mockPool;

      const result = await service.listSprints('tenant-1', 1, 20);
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    it('should apply status and search filters', async () => {
      const mockPool = createMockPool([
        { rows: [{ count: 0 }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      (service as any).pool = mockPool;

      await service.listSprints('tenant-1', 1, 20, {
        status: 'active',
        search: 'sprint 1',
      });

      const countQuery = mockPool.query.mock.calls[0][0] as string;
      expect(countQuery).toContain('s.status = $2');
      expect(countQuery).toContain('s.name ILIKE $3');
    });
  });

  // ─── findSprintById ─────────────────────────────────────────────

  describe('findSprintById', () => {
    it('should throw NotFoundException when pool is null', async () => {
      await expect(service.findSprintById('tenant-1', 'sprint-1')).rejects.toThrow(
        'Sprint not found'
      );
    });

    it('should throw NotFoundException when sprint does not exist', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as any).pool = mockPool;

      await expect(service.findSprintById('tenant-1', 'sprint-x')).rejects.toThrow(
        'Sprint not found'
      );
    });

    it('should return sprint when found', async () => {
      const sprint = { id: 'sprint-1', name: 'Sprint 1', tenant_id: 'tenant-1' };
      const mockPool = createMockPool([{ rows: [sprint], rowCount: 1 }]);
      (service as any).pool = mockPool;

      const result = await service.findSprintById('tenant-1', 'sprint-1');
      expect(result).toEqual(sprint);
    });
  });

  // ─── createSprint ───────────────────────────────────────────────

  describe('createSprint', () => {
    it('should throw when pool is null', async () => {
      await expect(
        service.createSprint('tenant-1', { name: 'Sprint 1' })
      ).rejects.toThrow('Database not available');
    });

    it('should create sprint and return it via findSprintById', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 1 }, // INSERT
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        { rows: [{ id: 'sprint-new', name: 'New Sprint' }], rowCount: 1 },
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      const result = await service.createSprint('tenant-1', {
        name: 'New Sprint',
        goal: 'Ship features',
        startDate: '2026-01-01',
        endDate: '2026-01-14',
      });
      expect(result.name).toBe('New Sprint');

      const insertCall = mockClient.calls.find((c) => c.sql.includes('INSERT INTO backlog_sprints'));
      expect(insertCall).toBeDefined();
      expect(insertCall!.params).toContain('New Sprint');
      expect(insertCall!.params).toContain('Ship features');
    });

    it('should rollback on INSERT failure', async () => {
      const mockClient = createMockClient([]);
      mockClient.query.mockImplementation(async (sql: string) => {
        mockClient.calls.push({ sql, params: [] });
        if (sql.includes('INSERT INTO backlog_sprints')) {
          throw new Error('DB insert error');
        }
        return { rows: [], rowCount: 0 };
      });
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await expect(
        service.createSprint('tenant-1', { name: 'Fail' })
      ).rejects.toThrow('DB insert error');

      const rollbackCall = mockClient.calls.find((c) => c.sql === 'ROLLBACK');
      expect(rollbackCall).toBeDefined();
    });
  });

  // ─── updateSprint ───────────────────────────────────────────────

  describe('updateSprint', () => {
    it('should throw when pool is null', async () => {
      await expect(
        service.updateSprint('tenant-1', 'sprint-1', { name: 'Updated' })
      ).rejects.toThrow('Database not available');
    });

    it('should update specified fields and return updated sprint', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 1 }, // UPDATE
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        { rows: [{ id: 'sprint-1', name: 'Updated Sprint' }], rowCount: 1 },
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      const result = await service.updateSprint('tenant-1', 'sprint-1', {
        name: 'Updated Sprint',
        status: 'active',
      });
      expect(result.name).toBe('Updated Sprint');

      const updateCall = mockClient.calls.find((c) => c.sql.includes('UPDATE backlog_sprints'));
      expect(updateCall).toBeDefined();
      expect(updateCall!.sql).toContain('name');
      expect(updateCall!.sql).toContain('status');
    });

    it('should rollback on UPDATE failure', async () => {
      const mockClient = createMockClient([]);
      mockClient.query.mockImplementation(async (sql: string) => {
        mockClient.calls.push({ sql, params: [] });
        if (sql.includes('UPDATE backlog_sprints')) {
          throw new Error('DB update error');
        }
        return { rows: [], rowCount: 0 };
      });
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await expect(
        service.updateSprint('tenant-1', 'sprint-1', { name: 'Fail' })
      ).rejects.toThrow('DB update error');

      const rollbackCall = mockClient.calls.find((c) => c.sql === 'ROLLBACK');
      expect(rollbackCall).toBeDefined();
    });
  });

  // ─── removeSprint ───────────────────────────────────────────────

  describe('removeSprint', () => {
    it('should throw when pool is null', async () => {
      await expect(service.removeSprint('tenant-1', 'sprint-1')).rejects.toThrow(
        'Database not available'
      );
    });

    it('should delete sprint within transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [{ id: 'sprint-1' }], rowCount: 1 }, // DELETE RETURNING
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await service.removeSprint('tenant-1', 'sprint-1');

      const deleteCall = mockClient.calls.find((c) =>
        c.sql.includes('DELETE FROM backlog_sprints')
      );
      expect(deleteCall).toBeDefined();
      const commitCall = mockClient.calls.find((c) => c.sql === 'COMMIT');
      expect(commitCall).toBeDefined();
    });

    it('should throw NotFoundException when sprint not found', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 0 }, // DELETE RETURNING (empty)
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await expect(service.removeSprint('tenant-1', 'sprint-1')).rejects.toThrow(
        'Sprint not found'
      );
    });
  });

  // ─── assignTasksToSprint ────────────────────────────────────────

  describe('assignTasksToSprint', () => {
    it('should throw when pool is null', async () => {
      await expect(
        service.assignTasksToSprint('tenant-1', 'sprint-1', ['task-1'])
      ).rejects.toThrow('Database not available');
    });

    it('should throw NotFoundException if sprint does not exist', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as any).pool = mockPool;

      await expect(
        service.assignTasksToSprint('tenant-1', 'sprint-x', ['task-1'])
      ).rejects.toThrow('Sprint not found');
    });

    it('should update tasks and return sprint tasks', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 1 }, // UPDATE task-1
        { rows: [], rowCount: 1 }, // UPDATE task-2
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        { rows: [{ id: 'sprint-1' }], rowCount: 1 }, // findSprintById
        { rows: [{ count: 2 }], rowCount: 1 }, // listTasks count
        { rows: [{ id: 'task-1' }, { id: 'task-2' }], rowCount: 2 }, // listTasks items
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      const result = await service.assignTasksToSprint('tenant-1', 'sprint-1', [
        'task-1',
        'task-2',
      ]);
      expect(result.items).toHaveLength(2);

      const updateCalls = mockClient.calls.filter((c) =>
        c.sql.includes('UPDATE backlog_tasks SET sprint_id')
      );
      expect(updateCalls).toHaveLength(2);
    });

    it('should rollback on assignment failure', async () => {
      const mockClient = createMockClient([]);
      mockClient.query.mockImplementation(async (sql: string) => {
        mockClient.calls.push({ sql, params: [] });
        if (sql.includes('UPDATE backlog_tasks SET sprint_id')) {
          throw new Error('DB update error');
        }
        return { rows: [], rowCount: 0 };
      });
      const mockPool = createMockPool([
        { rows: [{ id: 'sprint-1' }], rowCount: 1 }, // findSprintById
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await expect(
        service.assignTasksToSprint('tenant-1', 'sprint-1', ['task-1'])
      ).rejects.toThrow('DB update error');

      const rollbackCall = mockClient.calls.find((c) => c.sql === 'ROLLBACK');
      expect(rollbackCall).toBeDefined();
    });
  });
});
