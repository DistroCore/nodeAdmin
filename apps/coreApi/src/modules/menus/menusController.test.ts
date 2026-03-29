import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenusController } from './menusController';

function createMockMenusService() {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    getRoleMenus: vi.fn(),
    setRoleMenus: vi.fn(),
    getUserMenus: vi.fn(),
  };
}

describe('MenusController', () => {
  let controller: MenusController;
  let service: ReturnType<typeof createMockMenusService>;

  beforeEach(() => {
    service = createMockMenusService();
    controller = new MenusController(service as any);
  });

  describe('findAll', () => {
    it('should delegate to service', async () => {
      service.findAll.mockResolvedValue([]);
      const result = await controller.findAll();
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should delegate to service with id', async () => {
      service.findById.mockResolvedValue({ id: 'm-1' });
      const result = await controller.findOne('m-1');
      expect(service.findById).toHaveBeenCalledWith('m-1');
      expect(result).toEqual({ id: 'm-1' });
    });
  });

  describe('create', () => {
    it('should delegate to service with dto fields', async () => {
      service.create.mockResolvedValue({ id: 'm-1' });
      await controller.create({
        name: 'Menu',
        path: '/menu',
        icon: 'icon',
        sortOrder: 1,
        permissionCode: 'perm',
        isVisible: true,
      } as any);
      expect(service.create).toHaveBeenCalledWith({
        parentId: undefined,
        name: 'Menu',
        path: '/menu',
        icon: 'icon',
        sortOrder: 1,
        permissionCode: 'perm',
        isVisible: true,
      });
    });
  });

  describe('update', () => {
    it('should delegate to service with mapped data', async () => {
      service.update.mockResolvedValue({ id: 'm-1' });
      await controller.update('m-1', { name: 'Updated' } as any);
      expect(service.update).toHaveBeenCalledWith('m-1', {
        parentId: undefined,
        name: 'Updated',
        path: undefined,
        icon: undefined,
        sortOrder: undefined,
        permissionCode: undefined,
        isVisible: undefined,
      });
    });
  });

  describe('remove', () => {
    it('should delegate and return success', async () => {
      service.remove.mockResolvedValue(undefined);
      const result = await controller.remove('m-1');
      expect(service.remove).toHaveBeenCalledWith('m-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('getRoleMenus', () => {
    it('should delegate to service', async () => {
      service.getRoleMenus.mockResolvedValue(['m-1', 'm-2']);
      const result = await controller.getRoleMenus('r-1');
      expect(service.getRoleMenus).toHaveBeenCalledWith('r-1');
      expect(result).toEqual(['m-1', 'm-2']);
    });
  });

  describe('setRoleMenus', () => {
    it('should delegate to service with menu IDs', async () => {
      service.setRoleMenus.mockResolvedValue(['m-1']);
      const result = await controller.setRoleMenus('r-1', { menuIds: ['m-1'] } as any);
      expect(service.setRoleMenus).toHaveBeenCalledWith('r-1', ['m-1']);
      expect(result).toEqual(['m-1']);
    });
  });

  describe('getUserMenus', () => {
    it('should delegate with default tenantId', async () => {
      service.getUserMenus.mockResolvedValue([]);
      await controller.getUserMenus('u-1');
      expect(service.getUserMenus).toHaveBeenCalledWith('default', 'u-1');
    });

    it('should pass tenantId from query', async () => {
      service.getUserMenus.mockResolvedValue([]);
      await controller.getUserMenus('u-1', 't-1');
      expect(service.getUserMenus).toHaveBeenCalledWith('t-1', 'u-1');
    });
  });
});
