import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesController } from './rolesController';
import { RolesService } from './rolesService';
import { CreateRoleDto } from './dto/createRoleDto';
import { UpdateRoleDto } from './dto/updateRoleDto';

function createMockRolesService() {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
}

describe('RolesController', () => {
  let controller: RolesController;
  let service: ReturnType<typeof createMockRolesService>;

  beforeEach(() => {
    service = createMockRolesService();
    controller = new RolesController(service as unknown as RolesService);
  });

  describe('list', () => {
    it('should delegate with default tenantId', async () => {
      service.list.mockResolvedValue([]);
      await controller.list();
      expect(service.list).toHaveBeenCalledWith('default');
    });

    it('should pass tenantId from query', async () => {
      service.list.mockResolvedValue([]);
      await controller.list('t-1');
      expect(service.list).toHaveBeenCalledWith('t-1');
    });
  });

  describe('findOne', () => {
    it('should delegate to service', async () => {
      service.findById.mockResolvedValue({ id: 'r-1' });
      const result = await controller.findOne('r-1', 't-1');
      expect(service.findById).toHaveBeenCalledWith('t-1', 'r-1');
      expect(result).toEqual({ id: 'r-1' });
    });
  });

  describe('create', () => {
    it('should delegate to service with dto fields', async () => {
      service.create.mockResolvedValue({ id: 'r-1' });
      const dto: CreateRoleDto = {
        tenantId: 't-1',
        name: 'editor',
        description: 'desc',
        permissionIds: ['p-1'],
      };

      await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith('t-1', 'editor', 'desc', ['p-1']);
    });
  });

  describe('update', () => {
    it('should delegate to service with mapped data', async () => {
      service.update.mockResolvedValue({ id: 'r-1' });
      const dto: UpdateRoleDto = { name: 'new-name' };

      await controller.update('r-1', dto, 't-1');
      expect(service.update).toHaveBeenCalledWith('t-1', 'r-1', {
        name: 'new-name',
        description: undefined,
        permissionIds: undefined,
      });
    });
  });

  describe('remove', () => {
    it('should delegate and return success', async () => {
      service.remove.mockResolvedValue(undefined);
      const result = await controller.remove('r-1', 't-1');
      expect(service.remove).toHaveBeenCalledWith('t-1', 'r-1');
      expect(result).toEqual({ success: true });
    });
  });
});
