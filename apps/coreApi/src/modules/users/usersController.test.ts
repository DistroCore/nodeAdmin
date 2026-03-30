import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockUsersService() {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
}

// Import controller after defining helpers
import { UsersController } from './usersController';

describe('UsersController', () => {
  let controller: UsersController;
  let service: ReturnType<typeof createMockUsersService>;

  beforeEach(() => {
    service = createMockUsersService();
    controller = new UsersController(service as any);
  });

  describe('list', () => {
    it('should pass query params to service with default tenantId', async () => {
      service.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
      await controller.list({ page: 1, pageSize: 10 } as any);
      expect(service.list).toHaveBeenCalledWith('default', 1, 10, undefined);
    });

    it('should pass tenantId from query', async () => {
      service.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
      await controller.list({ tenantId: 't-1', page: 2, pageSize: 5, search: 'test' } as any);
      expect(service.list).toHaveBeenCalledWith('t-1', 2, 5, 'test');
    });

    it('should forward pagination boundary values unchanged', async () => {
      service.list.mockResolvedValue({ items: [], total: 0, page: 999, pageSize: 100 });

      await controller.list({ tenantId: 't-1', page: 999, pageSize: 100 } as any);

      expect(service.list).toHaveBeenCalledWith('t-1', 999, 100, undefined);
    });

    it('should preserve an empty-string search term', async () => {
      service.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

      await controller.list({ tenantId: 't-1', page: 1, pageSize: 20, search: '' } as any);

      expect(service.list).toHaveBeenCalledWith('t-1', 1, 20, '');
    });
  });

  describe('findOne', () => {
    it('should delegate to service with default tenantId', async () => {
      service.findById.mockResolvedValue({ id: 'u-1' });
      const result = await controller.findOne('u-1');
      expect(service.findById).toHaveBeenCalledWith('default', 'u-1');
      expect(result).toEqual({ id: 'u-1' });
    });

    it('should pass explicit tenantId to service', async () => {
      service.findById.mockResolvedValue({ id: 'u-2' });

      await controller.findOne('u-2', 'tenant-b');

      expect(service.findById).toHaveBeenCalledWith('tenant-b', 'u-2');
    });
  });

  describe('create', () => {
    it('should delegate to service with dto fields', async () => {
      service.create.mockResolvedValue({ id: 'u-1' });
      await controller.create({
        tenantId: 't-1',
        email: 'a@b.com',
        password: 'p',
        name: 'N',
        roleIds: ['r-1'],
      } as any);
      expect(service.create).toHaveBeenCalledWith('t-1', 'a@b.com', 'p', 'N', ['r-1']);
    });

    it('should preserve omitted optional roleIds on create', async () => {
      service.create.mockResolvedValue({ id: 'u-2' });

      await controller.create({
        tenantId: 't-1',
        email: 'b@c.com',
        password: 'p',
        name: 'No Roles',
      } as any);

      expect(service.create).toHaveBeenCalledWith('t-1', 'b@c.com', 'p', 'No Roles', undefined);
    });
  });

  describe('update', () => {
    it('should delegate to service with mapped data', async () => {
      service.update.mockResolvedValue({ id: 'u-1' });
      await controller.update('u-1', { name: 'New', isActive: true } as any, 't-1');
      expect(service.update).toHaveBeenCalledWith('t-1', 'u-1', {
        name: 'New',
        avatar: undefined,
        isActive: true,
        roleIds: undefined,
      });
    });

    it('should preserve false isActive and empty roleIds during status toggles', async () => {
      service.update.mockResolvedValue({ id: 'u-1' });

      await controller.update(
        'u-1',
        { avatar: 'avatar.png', isActive: false, roleIds: [] } as any,
        't-1'
      );

      expect(service.update).toHaveBeenCalledWith('t-1', 'u-1', {
        name: undefined,
        avatar: 'avatar.png',
        isActive: false,
        roleIds: [],
      });
    });
  });

  describe('remove', () => {
    it('should delegate to service and return success', async () => {
      service.remove.mockResolvedValue(undefined);
      const result = await controller.remove('u-1', 't-1');
      expect(service.remove).toHaveBeenCalledWith('t-1', 'u-1');
      expect(result).toEqual({ success: true });
    });
  });
});
