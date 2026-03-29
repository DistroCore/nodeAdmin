import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockBacklogService() {
  return {
    listTasks: vi.fn(),
    findTaskById: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    removeTask: vi.fn(),
  };
}

import { TaskController } from './taskController';

describe('TaskController', () => {
  let controller: TaskController;
  let service: ReturnType<typeof createMockBacklogService>;

  beforeEach(() => {
    service = createMockBacklogService();
    controller = new TaskController(service as any);
  });

  describe('list', () => {
    it('should pass query params to service with default tenantId', async () => {
      service.listTasks.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
      await controller.list({ page: 1, pageSize: 10 } as any);
      expect(service.listTasks).toHaveBeenCalledWith('default', 1, 10, {
        status: undefined,
        sprintId: undefined,
        search: undefined,
      });
    });

    it('should pass tenantId and filters from query', async () => {
      service.listTasks.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
      await controller.list({
        tenantId: 't-1',
        page: 2,
        pageSize: 5,
        status: 'todo',
        sprintId: 's-1',
        search: 'bug',
      } as any);
      expect(service.listTasks).toHaveBeenCalledWith('t-1', 2, 5, {
        status: 'todo',
        sprintId: 's-1',
        search: 'bug',
      });
    });
  });

  describe('findOne', () => {
    it('should delegate to service with default tenantId', async () => {
      service.findTaskById.mockResolvedValue({ id: 'task-1' });
      const result = await controller.findOne('task-1');
      expect(service.findTaskById).toHaveBeenCalledWith('default', 'task-1');
      expect(result).toEqual({ id: 'task-1' });
    });

    it('should pass tenantId from query', async () => {
      service.findTaskById.mockResolvedValue({ id: 'task-1' });
      await controller.findOne('task-1', 't-1');
      expect(service.findTaskById).toHaveBeenCalledWith('t-1', 'task-1');
    });
  });

  describe('create', () => {
    it('should delegate to service with dto fields', async () => {
      service.createTask.mockResolvedValue({ id: 'task-new' });
      await controller.create({
        tenantId: 't-1',
        title: 'New Task',
        description: 'desc',
        status: 'todo',
        priority: 'high',
        assigneeId: 'user-1',
        sprintId: 'sprint-1',
      } as any);
      expect(service.createTask).toHaveBeenCalledWith('t-1', {
        title: 'New Task',
        description: 'desc',
        status: 'todo',
        priority: 'high',
        assigneeId: 'user-1',
        sprintId: 'sprint-1',
      });
    });
  });

  describe('update', () => {
    it('should delegate to service with mapped data', async () => {
      service.updateTask.mockResolvedValue({ id: 'task-1', title: 'Updated' });
      const result = await controller.update(
        'task-1',
        { title: 'Updated', status: 'done' } as any,
        't-1'
      );
      expect(service.updateTask).toHaveBeenCalledWith('t-1', 'task-1', {
        title: 'Updated',
        status: 'done',
      });
      expect(result).toEqual({ id: 'task-1', title: 'Updated' });
    });

    it('should use default tenantId when not provided', async () => {
      service.updateTask.mockResolvedValue({ id: 'task-1' });
      await controller.update('task-1', { title: 'Test' } as any);
      expect(service.updateTask).toHaveBeenCalledWith('default', 'task-1', { title: 'Test' });
    });
  });

  describe('remove', () => {
    it('should delegate to service and return success', async () => {
      service.removeTask.mockResolvedValue(undefined);
      const result = await controller.remove('task-1', 't-1');
      expect(service.removeTask).toHaveBeenCalledWith('t-1', 'task-1');
      expect(result).toEqual({ success: true });
    });

    it('should use default tenantId when not provided', async () => {
      service.removeTask.mockResolvedValue(undefined);
      await controller.remove('task-1');
      expect(service.removeTask).toHaveBeenCalledWith('default', 'task-1');
    });
  });
});
