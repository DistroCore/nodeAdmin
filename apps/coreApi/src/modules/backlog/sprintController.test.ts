import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockBacklogService() {
  return {
    listSprints: vi.fn(),
    findSprintById: vi.fn(),
    createSprint: vi.fn(),
    updateSprint: vi.fn(),
    removeSprint: vi.fn(),
    assignTasksToSprint: vi.fn(),
  };
}

import { SprintController } from './sprintController';

describe('SprintController', () => {
  let controller: SprintController;
  let service: ReturnType<typeof createMockBacklogService>;

  beforeEach(() => {
    service = createMockBacklogService();
    controller = new SprintController(service as any);
  });

  describe('list', () => {
    it('should pass query params to service with default tenantId', async () => {
      service.listSprints.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
      await controller.list({ page: 1, pageSize: 10 } as any);
      expect(service.listSprints).toHaveBeenCalledWith('default', 1, 10, {
        status: undefined,
        search: undefined,
      });
    });

    it('should pass tenantId and filters from query', async () => {
      service.listSprints.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
      await controller.list({
        tenantId: 't-1',
        page: 2,
        pageSize: 5,
        status: 'active',
        search: 'sprint 1',
      } as any);
      expect(service.listSprints).toHaveBeenCalledWith('t-1', 2, 5, {
        status: 'active',
        search: 'sprint 1',
      });
    });
  });

  describe('findOne', () => {
    it('should delegate to service with default tenantId', async () => {
      service.findSprintById.mockResolvedValue({ id: 'sprint-1' });
      const result = await controller.findOne('sprint-1');
      expect(service.findSprintById).toHaveBeenCalledWith('default', 'sprint-1');
      expect(result).toEqual({ id: 'sprint-1' });
    });

    it('should pass tenantId from query', async () => {
      service.findSprintById.mockResolvedValue({ id: 'sprint-1' });
      await controller.findOne('sprint-1', 't-1');
      expect(service.findSprintById).toHaveBeenCalledWith('t-1', 'sprint-1');
    });
  });

  describe('create', () => {
    it('should delegate to service with dto fields', async () => {
      service.createSprint.mockResolvedValue({ id: 'sprint-new' });
      await controller.create({
        tenantId: 't-1',
        name: 'Sprint 1',
        goal: 'Ship MVP',
        status: 'planning',
        startDate: '2026-01-01',
        endDate: '2026-01-14',
      } as any);
      expect(service.createSprint).toHaveBeenCalledWith('t-1', {
        name: 'Sprint 1',
        goal: 'Ship MVP',
        status: 'planning',
        startDate: '2026-01-01',
        endDate: '2026-01-14',
      });
    });
  });

  describe('update', () => {
    it('should delegate to service with mapped data', async () => {
      service.updateSprint.mockResolvedValue({ id: 'sprint-1', name: 'Updated' });
      const result = await controller.update(
        'sprint-1',
        { name: 'Updated', status: 'active' } as any,
        't-1'
      );
      expect(service.updateSprint).toHaveBeenCalledWith('t-1', 'sprint-1', {
        name: 'Updated',
        status: 'active',
      });
      expect(result).toEqual({ id: 'sprint-1', name: 'Updated' });
    });

    it('should use default tenantId when not provided', async () => {
      service.updateSprint.mockResolvedValue({ id: 'sprint-1' });
      await controller.update('sprint-1', { name: 'Test' } as any);
      expect(service.updateSprint).toHaveBeenCalledWith('default', 'sprint-1', { name: 'Test' });
    });
  });

  describe('remove', () => {
    it('should delegate to service and return success', async () => {
      service.removeSprint.mockResolvedValue(undefined);
      const result = await controller.remove('sprint-1', 't-1');
      expect(service.removeSprint).toHaveBeenCalledWith('t-1', 'sprint-1');
      expect(result).toEqual({ success: true });
    });

    it('should use default tenantId when not provided', async () => {
      service.removeSprint.mockResolvedValue(undefined);
      await controller.remove('sprint-1');
      expect(service.removeSprint).toHaveBeenCalledWith('default', 'sprint-1');
    });
  });

  describe('assignTasks', () => {
    it('should delegate to service with task IDs', async () => {
      service.assignTasksToSprint.mockResolvedValue({ items: [], total: 0 });
      const result = await controller.assignTasks(
        'sprint-1',
        { taskIds: ['task-1', 'task-2'] },
        't-1'
      );
      expect(service.assignTasksToSprint).toHaveBeenCalledWith('t-1', 'sprint-1', [
        'task-1',
        'task-2',
      ]);
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('should use default tenantId when not provided', async () => {
      service.assignTasksToSprint.mockResolvedValue({ items: [], total: 0 });
      await controller.assignTasks('sprint-1', { taskIds: ['task-1'] });
      expect(service.assignTasksToSprint).toHaveBeenCalledWith('default', 'sprint-1', ['task-1']);
    });
  });
});
