import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BacklogService } from './backlogService';
import { SprintController } from './sprintController';
import { CreateSprintDto } from './dto/createSprintDto';
import { ListBacklogQueryDto } from './dto/listBacklogQueryDto';
import { UpdateSprintDto } from './dto/updateSprintDto';

describe('SprintController', () => {
  let controller: SprintController;
  let service: BacklogService;

  beforeEach(() => {
    service = new BacklogService();
    controller = new SprintController(service);
  });

  describe('list', () => {
    it('should pass query params to service with default tenantId', async () => {
      const listSprintsSpy = vi
        .spyOn(service, 'listSprints')
        .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
      const query = Object.assign(new ListBacklogQueryDto(), { page: 1, pageSize: 10 });

      await controller.list(query);

      expect(listSprintsSpy).toHaveBeenCalledWith('default', 1, 10, {
        status: undefined,
        search: undefined,
      });
    });

    it('should pass tenantId and filters from query', async () => {
      const listSprintsSpy = vi
        .spyOn(service, 'listSprints')
        .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
      const query = Object.assign(new ListBacklogQueryDto(), {
        tenantId: 't-1',
        page: 2,
        pageSize: 5,
        status: 'active',
        search: 'sprint 1',
      });

      await controller.list(query);

      expect(listSprintsSpy).toHaveBeenCalledWith('t-1', 2, 5, {
        status: 'active',
        search: 'sprint 1',
      });
    });
  });

  describe('findOne', () => {
    it('should delegate to service with default tenantId', async () => {
      const findSprintByIdSpy = vi.spyOn(service, 'findSprintById').mockResolvedValue({ id: 'sprint-1' });

      const result = await controller.findOne('sprint-1');

      expect(findSprintByIdSpy).toHaveBeenCalledWith('default', 'sprint-1');
      expect(result).toEqual({ id: 'sprint-1' });
    });

    it('should pass tenantId from query', async () => {
      const findSprintByIdSpy = vi.spyOn(service, 'findSprintById').mockResolvedValue({ id: 'sprint-1' });

      await controller.findOne('sprint-1', 't-1');

      expect(findSprintByIdSpy).toHaveBeenCalledWith('t-1', 'sprint-1');
    });
  });

  describe('create', () => {
    it('should delegate to service with dto fields', async () => {
      const createSprintSpy = vi.spyOn(service, 'createSprint').mockResolvedValue({ id: 'sprint-new' });
      const dto = Object.assign(new CreateSprintDto(), {
        tenantId: 't-1',
        name: 'Sprint 1',
        goal: 'Ship MVP',
        status: 'planning',
        startDate: '2026-01-01',
        endDate: '2026-01-14',
      });

      await controller.create(dto);

      expect(createSprintSpy).toHaveBeenCalledWith('t-1', {
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
      const updateSprintSpy = vi.spyOn(service, 'updateSprint').mockResolvedValue({ id: 'sprint-1', name: 'Updated' });
      const dto = Object.assign(new UpdateSprintDto(), { name: 'Updated', status: 'active' });

      const result = await controller.update('sprint-1', dto, 't-1');

      expect(updateSprintSpy).toHaveBeenCalledWith('t-1', 'sprint-1', {
        name: 'Updated',
        status: 'active',
      });
      expect(result).toEqual({ id: 'sprint-1', name: 'Updated' });
    });

    it('should use default tenantId when not provided', async () => {
      const updateSprintSpy = vi.spyOn(service, 'updateSprint').mockResolvedValue({ id: 'sprint-1' });
      const dto = Object.assign(new UpdateSprintDto(), { name: 'Test' });

      await controller.update('sprint-1', dto);

      expect(updateSprintSpy).toHaveBeenCalledWith('default', 'sprint-1', { name: 'Test' });
    });
  });

  describe('remove', () => {
    it('should delegate to service and return success', async () => {
      const removeSprintSpy = vi.spyOn(service, 'removeSprint').mockResolvedValue(undefined);

      const result = await controller.remove('sprint-1', 't-1');

      expect(removeSprintSpy).toHaveBeenCalledWith('t-1', 'sprint-1');
      expect(result).toEqual({ success: true });
    });

    it('should use default tenantId when not provided', async () => {
      const removeSprintSpy = vi.spyOn(service, 'removeSprint').mockResolvedValue(undefined);

      await controller.remove('sprint-1');

      expect(removeSprintSpy).toHaveBeenCalledWith('default', 'sprint-1');
    });
  });

  describe('assignTasks', () => {
    it('should delegate to service with task IDs', async () => {
      const assignTasksToSprintSpy = vi
        .spyOn(service, 'assignTasksToSprint')
        .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

      const result = await controller.assignTasks('sprint-1', { taskIds: ['task-1', 'task-2'] }, 't-1');

      expect(assignTasksToSprintSpy).toHaveBeenCalledWith('t-1', 'sprint-1', ['task-1', 'task-2']);
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it('should use default tenantId when not provided', async () => {
      const assignTasksToSprintSpy = vi
        .spyOn(service, 'assignTasksToSprint')
        .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

      await controller.assignTasks('sprint-1', { taskIds: ['task-1'] });

      expect(assignTasksToSprintSpy).toHaveBeenCalledWith('default', 'sprint-1', ['task-1']);
    });
  });
});
