import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { setupTestEnv, createMockPool, createMockClient } from '../../__tests__/helpers';

setupTestEnv();

import { MenusService } from './menusService';

describe('MenusService', () => {
  let service: MenusService;

  beforeEach(() => {
    service = new MenusService();
  });

  // ─── buildTree (tested via findAll) ────────────────────────

  describe('findAll', () => {
    it('should return empty array when pool is null', async () => {
      const result = await service.findAll();
      expect(result).toEqual([]);
    });

    it('should build tree from flat rows', async () => {
      const rows = [
        { id: 'm-1', parent_id: null, name: 'Root', path: '/root', icon: null, sort_order: 0, permission_code: null, is_visible: true, created_at: new Date() },
        { id: 'm-2', parent_id: 'm-1', name: 'Child', path: '/root/child', icon: null, sort_order: 1, permission_code: null, is_visible: true, created_at: new Date() },
      ];
      const mockPool = createMockPool([{ rows, rowCount: 2 }]);
      (service as any).pool = mockPool;

      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('m-1');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children![0].id).toBe('m-2');
    });
  });

  // ─── findById ───────────────────────────────────────────────

  describe('findById', () => {
    it('should throw NotFoundException when pool is null', async () => {
      await expect(service.findById('m-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when menu not found', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as any).pool = mockPool;

      await expect(service.findById('nonexistent')).rejects.toThrow('Menu not found');
    });

    it('should return menu item', async () => {
      const mockPool = createMockPool([
        { rows: [{ id: 'm-1', name: 'Menu1', parent_id: null }], rowCount: 1 },
      ]);
      (service as any).pool = mockPool;

      const result = await service.findById('m-1');
      expect(result.id).toBe('m-1');
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('should throw when pool is null', async () => {
      await expect(service.create({ name: 'Menu' })).rejects.toThrow('Database not available');
    });

    it('should insert menu and return it', async () => {
      const mockPool = createMockPool([
        { rows: [], rowCount: 1 }, // INSERT
        { rows: [{ id: 'm-1', name: 'Menu1', parent_id: null, path: null, icon: null, sort_order: 0, permission_code: null, is_visible: true, created_at: new Date() }], rowCount: 1 }, // findById
      ]);
      (service as any).pool = mockPool;

      const result = await service.create({ name: 'Menu1' });
      expect(result.name).toBe('Menu1');
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    it('should throw when pool is null', async () => {
      await expect(service.update('m-1', { name: 'X' })).rejects.toThrow('Database not available');
    });

    it('should return menu unchanged when no fields provided', async () => {
      const mockPool = createMockPool([
        { rows: [{ id: 'm-1', name: 'Menu1', parent_id: null, path: null, icon: null, sort_order: 0, permission_code: null, is_visible: true, created_at: new Date() }], rowCount: 1 },
      ]);
      (service as any).pool = mockPool;

      const result = await service.update('m-1', {});
      expect(result.id).toBe('m-1');
    });

    it('should update specified fields', async () => {
      const mockPool = createMockPool([
        { rows: [], rowCount: 1 }, // UPDATE
        { rows: [{ id: 'm-1', name: 'Updated', parent_id: null, path: null, icon: null, sort_order: 0, permission_code: null, is_visible: true, created_at: new Date() }], rowCount: 1 }, // findById
      ]);
      (service as any).pool = mockPool;

      const result = await service.update('m-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should throw when pool is null', async () => {
      await expect(service.remove('m-1')).rejects.toThrow('Database not available');
    });

    it('should recursively delete children', async () => {
      // First call: delete role_menus, find children, delete child's role_menus, delete child, delete parent
      const mockPool = createMockPool([
        { rows: [], rowCount: 0 }, // DELETE role_menus for parent
        { rows: [{ id: 'm-2' }], rowCount: 1 }, // SELECT children of parent
        { rows: [], rowCount: 0 }, // DELETE role_menus for child
        { rows: [], rowCount: 0 }, // SELECT children of child (none)
        { rows: [{ id: 'm-2' }], rowCount: 1 }, // DELETE child menu
        { rows: [{ id: 'm-1' }], rowCount: 1 }, // DELETE parent menu
      ]);
      (service as any).pool = mockPool;

      await service.remove('m-1');
      // Verify all 6 queries were made
      expect(mockPool.query).toHaveBeenCalledTimes(6);
    });

    it('should throw NotFoundException when menu not found', async () => {
      const mockPool = createMockPool([
        { rows: [], rowCount: 0 }, // DELETE role_menus
        { rows: [], rowCount: 0 }, // SELECT children (none)
        { rows: [], rowCount: 0 }, // DELETE menu RETURNING (empty)
      ]);
      (service as any).pool = mockPool;

      await expect(service.remove('nonexistent')).rejects.toThrow('Menu not found');
    });
  });

  // ─── getRoleMenus ───────────────────────────────────────────

  describe('getRoleMenus', () => {
    it('should return empty array when pool is null', async () => {
      const result = await service.getRoleMenus('r-1');
      expect(result).toEqual([]);
    });

    it('should return menu IDs for a role', async () => {
      const mockPool = createMockPool([
        { rows: [{ menu_id: 'm-1' }, { menu_id: 'm-2' }], rowCount: 2 },
      ]);
      (service as any).pool = mockPool;

      const result = await service.getRoleMenus('r-1');
      expect(result).toEqual(['m-1', 'm-2']);
    });
  });

  // ─── setRoleMenus ───────────────────────────────────────────

  describe('setRoleMenus', () => {
    it('should throw when pool is null', async () => {
      await expect(service.setRoleMenus('r-1', ['m-1'])).rejects.toThrow('Database not available');
    });

    it('should replace role menus in transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // DELETE
        { rows: [], rowCount: 1 }, // INSERT m-1
        { rows: [], rowCount: 1 }, // INSERT m-2
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        { rows: [{ menu_id: 'm-1' }, { menu_id: 'm-2' }], rowCount: 2 }, // getRoleMenus after commit
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      const result = await service.setRoleMenus('r-1', ['m-1', 'm-2']);
      expect(result).toEqual(['m-1', 'm-2']);
    });

    it('should rollback on error', async () => {
      const mockClient = createMockClient([]);
      mockClient.query.mockImplementation(async (sql: string) => {
        mockClient.calls.push({ sql, params: [] });
        if (sql.includes('INSERT INTO role_menus')) {
          throw new Error('DB error');
        }
        return { rows: [], rowCount: 0 };
      });

      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await expect(service.setRoleMenus('r-1', ['m-1'])).rejects.toThrow('DB error');
      expect(mockClient.calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
    });
  });

  // ─── getUserMenus ───────────────────────────────────────────

  describe('getUserMenus', () => {
    it('should return empty array when pool is null', async () => {
      const result = await service.getUserMenus('t-1', 'u-1');
      expect(result).toEqual([]);
    });

    it('should return menus for user roles as tree', async () => {
      const rows = [
        { id: 'm-1', parent_id: null, name: 'Dashboard', path: '/dashboard', icon: 'home', sort_order: 0, permission_code: null, is_visible: true, created_at: new Date() },
        { id: 'm-2', parent_id: 'm-1', name: 'Analytics', path: '/dashboard/analytics', icon: 'chart', sort_order: 1, permission_code: null, is_visible: true, created_at: new Date() },
      ];
      const mockPool = createMockPool([{ rows, rowCount: 2 }]);
      (service as any).pool = mockPool;

      const result = await service.getUserMenus('t-1', 'u-1');
      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
    });
  });
});
