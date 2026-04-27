import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BacklogService } from './backlogService';
import { TaskController } from './taskController';
import { CreateTaskDto } from './dto/createTaskDto';
import { ListBacklogQueryDto } from './dto/listBacklogQueryDto';
import { UpdateTaskDto } from './dto/updateTaskDto';

describe('TaskController', () => {
  let controller: TaskController;
  let service: BacklogService;

  beforeEach(() => {
    service = new BacklogService();
    controller = new TaskController(service);
  });

  describe('list', () => {
    it('should pass query params to service with default tenantId', async () => {
      const listTasksSpy = vi
        .spyOn(service, 'listTasks')
        .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
      const query = Object.assign(new ListBacklogQueryDto(), { page: 1, pageSize: 10 });

      await controller.list(query);

      expect(listTasksSpy).toHaveBeenCalledWith('default', 1, 10, {
        status: undefined,
        sprintId: undefined,
        search: undefined,
      });
    });

    it('should pass tenantId and filters from query', async () => {
      const listTasksSpy = vi
        .spyOn(service, 'listTasks')
        .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
      const query = Object.assign(new ListBacklogQueryDto(), {
        tenantId: 't-1',
        page: 2,
        pageSize: 5,
        status: 'todo',
        sprintId: 's-1',
        search: 'bug',
      });

      await controller.list(query);

      expect(listTasksSpy).toHaveBeenCalledWith('t-1', 2, 5, {
        status: 'todo',
        sprintId: 's-1',
        search: 'bug',
      });
    });
  });

  describe('findOne', () => {
    it('should delegate to service with default tenantId', async () => {
      const findTaskByIdSpy = vi.spyOn(service, 'findTaskById').mockResolvedValue({ id: 'task-1' });

      const result = await controller.findOne('task-1');

      expect(findTaskByIdSpy).toHaveBeenCalledWith('default', 'task-1');
      expect(result).toEqual({ id: 'task-1' });
    });

    it('should pass tenantId from query', async () => {
      const findTaskByIdSpy = vi.spyOn(service, 'findTaskById').mockResolvedValue({ id: 'task-1' });

      await controller.findOne('task-1', 't-1');

      expect(findTaskByIdSpy).toHaveBeenCalledWith('t-1', 'task-1');
    });
  });

  describe('create', () => {
    it('should delegate to service with dto fields', async () => {
      const createTaskSpy = vi.spyOn(service, 'createTask').mockResolvedValue({ id: 'task-new' });
      const dto = Object.assign(new CreateTaskDto(), {
        tenantId: 't-1',
        title: 'New Task',
        description: 'desc',
        status: 'todo',
        priority: 'high',
        assigneeId: 'user-1',
        sprintId: 'sprint-1',
      });

      await controller.create(dto);

      expect(createTaskSpy).toHaveBeenCalledWith('t-1', {
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
      const updateTaskSpy = vi.spyOn(service, 'updateTask').mockResolvedValue({ id: 'task-1', title: 'Updated' });
      const dto = Object.assign(new UpdateTaskDto(), { title: 'Updated', status: 'done' });

      const result = await controller.update('task-1', dto, 't-1');

      expect(updateTaskSpy).toHaveBeenCalledWith('t-1', 'task-1', {
        title: 'Updated',
        status: 'done',
      });
      expect(result).toEqual({ id: 'task-1', title: 'Updated' });
    });

    it('should use default tenantId when not provided', async () => {
      const updateTaskSpy = vi.spyOn(service, 'updateTask').mockResolvedValue({ id: 'task-1' });
      const dto = Object.assign(new UpdateTaskDto(), { title: 'Test' });

      await controller.update('task-1', dto);

      expect(updateTaskSpy).toHaveBeenCalledWith('default', 'task-1', { title: 'Test' });
    });
  });

  describe('remove', () => {
    it('should delegate to service and return success', async () => {
      const removeTaskSpy = vi.spyOn(service, 'removeTask').mockResolvedValue(undefined);

      const result = await controller.remove('task-1', 't-1');

      expect(removeTaskSpy).toHaveBeenCalledWith('t-1', 'task-1');
      expect(result).toEqual({ success: true });
    });

    it('should use default tenantId when not provided', async () => {
      const removeTaskSpy = vi.spyOn(service, 'removeTask').mockResolvedValue(undefined);

      await controller.remove('task-1');

      expect(removeTaskSpy).toHaveBeenCalledWith('default', 'task-1');
    });
  });
});
