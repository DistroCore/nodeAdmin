import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { setupTestEnv, createMockPool, createMockClient } from '../../__tests__/helpers';
import type { MockClient, MockPool } from '../../__tests__/helpers';

setupTestEnv();

import { MenusService } from './menusService';

const TENANT_ID = 'tenant-1';

function setMenusServicePool(service: MenusService, pool: MockPool): void {
  (service as unknown as { pool: MockPool }).pool = pool;
}

function createTenantClient(results: Array<{ rows: Record<string, unknown>[]; rowCount: number }>): MockClient {
  return createMockClient([{ rows: [], rowCount: 0 }, { rows: [], rowCount: 0 }, ...results, { rows: [], rowCount: 0 }]);
}

describe('MenusService', () => {
  let service: MenusService;

  beforeEach(() => {
    service = new MenusService();
  });

  describe('findAll', () => {
    it('should return empty array when pool is null', async () => {
      const result = await service.findAll(TENANT_ID);
      expect(result).toEqual([]);
    });

    it('should build tree from flat rows inside a tenant-scoped session', async () => {
      const rows = [
        {
          id: 'm-1',
          parent_id: null,
          name: 'Root',
          path: '/root',
          icon: null,
          sort_order: 0,
          permission_code: null,
          is_visible: true,
          created_at: new Date(),
        },
        {
          id: 'm-2',
          parent_id: 'm-1',
          name: 'Child',
          path: '/root/child',
          icon: null,
          sort_order: 1,
          permission_code: null,
          is_visible: true,
          created_at: new Date(),
        },
      ];
      const client = createTenantClient([{ rows, rowCount: 2 }]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => client);
      setMenusServicePool(service, mockPool);

      const result = await service.findAll(TENANT_ID);

      expect(client.calls[0]).toEqual({ params: [], sql: 'BEGIN' });
      expect(client.calls[1]).toEqual({
        params: [TENANT_ID],
        sql: `SELECT set_config('app.current_tenant', $1, true)`,
      });
      expect(client.calls[2]?.sql).toContain('FROM menus ORDER BY sort_order, created_at');
      expect(client.calls[3]).toEqual({ params: [], sql: 'COMMIT' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('m-1');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children![0].id).toBe('m-2');
    });

    it('should treat orphaned nodes as roots instead of dropping them', async () => {
      const rows = [
        {
          id: 'm-1',
          parent_id: 'missing-parent',
          name: 'Detached',
          path: '/detached',
          icon: null,
          sort_order: 5,
          permission_code: null,
          is_visible: true,
          created_at: new Date(),
        },
      ];
      const client = createTenantClient([{ rows, rowCount: 1 }]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => client);
      setMenusServicePool(service, mockPool);

      const result = await service.findAll(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('m-1');
      expect(result[0].children).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when pool is null', async () => {
      await expect(service.findById(TENANT_ID, 'm-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when menu not found', async () => {
      const client = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => client);
      setMenusServicePool(service, mockPool);

      await expect(service.findById(TENANT_ID, 'nonexistent')).rejects.toThrow('Menu not found');
      expect(client.calls.at(-1)).toEqual({ params: [], sql: 'ROLLBACK' });
    });

    it('should return menu item', async () => {
      const client = createTenantClient([{ rows: [{ id: 'm-1', name: 'Menu1', parent_id: null }], rowCount: 1 }]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => client);
      setMenusServicePool(service, mockPool);

      const result = await service.findById(TENANT_ID, 'm-1');
      expect(result.id).toBe('m-1');
    });
  });

  describe('create', () => {
    it('should throw when pool is null', async () => {
      await expect(service.create(TENANT_ID, { name: 'Menu' })).rejects.toThrow('Database not available');
    });

    it('should insert menu and return it', async () => {
      const txClient = createTenantClient([{ rows: [], rowCount: 1 }]);
      const readClient = createTenantClient([
        {
          rows: [
            {
              id: 'm-1',
              name: 'Menu1',
              parent_id: null,
              path: null,
              icon: null,
              sort_order: 0,
              permission_code: null,
              is_visible: true,
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        },
      ]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn().mockResolvedValueOnce(txClient).mockResolvedValueOnce(readClient);
      setMenusServicePool(service, mockPool);

      const result = await service.create(TENANT_ID, { name: 'Menu1' });

      expect(txClient.calls[1]).toEqual({
        params: [TENANT_ID],
        sql: `SELECT set_config('app.current_tenant', $1, true)`,
      });
      expect(txClient.calls[2]?.sql).toContain('INSERT INTO menus');
      expect(result.name).toBe('Menu1');
    });

    it('should default visibility to true and sortOrder to zero', async () => {
      const txClient = createTenantClient([{ rows: [], rowCount: 1 }]);
      const readClient = createTenantClient([
        {
          rows: [
            {
              id: 'm-1',
              name: 'Defaults',
              parent_id: null,
              path: null,
              icon: null,
              sort_order: 0,
              permission_code: null,
              is_visible: true,
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        },
      ]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn().mockResolvedValueOnce(txClient).mockResolvedValueOnce(readClient);
      setMenusServicePool(service, mockPool);

      await service.create(TENANT_ID, { name: 'Defaults' });

      expect(txClient.calls[2]).toEqual({
        params: [expect.any(String), null, 'Defaults', null, null, 0, null, true],
        sql: 'INSERT INTO menus (id, parent_id, name, path, icon, sort_order, permission_code, is_visible) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      });
    });
  });

  describe('update', () => {
    it('should throw when pool is null', async () => {
      await expect(service.update(TENANT_ID, 'm-1', { name: 'X' })).rejects.toThrow('Database not available');
    });

    it('should return menu unchanged when no fields provided', async () => {
      const client = createTenantClient([
        {
          rows: [
            {
              id: 'm-1',
              name: 'Menu1',
              parent_id: null,
              path: null,
              icon: null,
              sort_order: 0,
              permission_code: null,
              is_visible: true,
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        },
      ]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => client);
      setMenusServicePool(service, mockPool);

      const result = await service.update(TENANT_ID, 'm-1', {});

      expect(result.id).toBe('m-1');
      expect(client.calls).toHaveLength(4);
    });

    it('should update specified fields', async () => {
      const txClient = createTenantClient([{ rows: [], rowCount: 1 }]);
      const readClient = createTenantClient([
        {
          rows: [
            {
              id: 'm-1',
              name: 'Updated',
              parent_id: null,
              path: null,
              icon: null,
              sort_order: 0,
              permission_code: null,
              is_visible: true,
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        },
      ]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn().mockResolvedValueOnce(txClient).mockResolvedValueOnce(readClient);
      setMenusServicePool(service, mockPool);

      const result = await service.update(TENANT_ID, 'm-1', { name: 'Updated' });

      expect(txClient.calls[2]).toEqual({
        params: ['Updated', 'm-1'],
        sql: 'UPDATE menus SET name = $1 WHERE id = $2',
      });
      expect(result.name).toBe('Updated');
    });

    it('should move a menu under a new parent and update sort order together', async () => {
      const txClient = createTenantClient([{ rows: [], rowCount: 1 }]);
      const readClient = createTenantClient([
        {
          rows: [
            {
              id: 'm-1',
              name: 'Moved',
              parent_id: 'm-9',
              path: '/moved',
              icon: null,
              sort_order: 3,
              permission_code: null,
              is_visible: true,
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        },
      ]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn().mockResolvedValueOnce(txClient).mockResolvedValueOnce(readClient);
      setMenusServicePool(service, mockPool);

      await service.update(TENANT_ID, 'm-1', { parentId: 'm-9', sortOrder: 3 });

      expect(txClient.calls[2]).toEqual({
        params: ['m-9', 3, 'm-1'],
        sql: 'UPDATE menus SET parent_id = $1, sort_order = $2 WHERE id = $3',
      });
    });

    it('should preserve false visibility when toggling menu state', async () => {
      const txClient = createTenantClient([{ rows: [], rowCount: 1 }]);
      const readClient = createTenantClient([
        {
          rows: [
            {
              id: 'm-1',
              name: 'Hidden',
              parent_id: null,
              path: null,
              icon: null,
              sort_order: 0,
              permission_code: null,
              is_visible: false,
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        },
      ]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn().mockResolvedValueOnce(txClient).mockResolvedValueOnce(readClient);
      setMenusServicePool(service, mockPool);

      await service.update(TENANT_ID, 'm-1', { isVisible: false });

      expect(txClient.calls[2]).toEqual({
        params: [false, 'm-1'],
        sql: 'UPDATE menus SET is_visible = $1 WHERE id = $2',
      });
    });
  });

  describe('remove', () => {
    it('should throw when pool is null', async () => {
      await expect(service.remove(TENANT_ID, 'm-1')).rejects.toThrow('Database not available');
    });

    it('should recursively delete children inside tenant-scoped sessions', async () => {
      const parentClient = createTenantClient([
        { rows: [], rowCount: 0 },
        { rows: [{ id: 'm-2' }], rowCount: 1 },
        { rows: [{ id: 'm-1' }], rowCount: 1 },
      ]);
      const childClient = createTenantClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [{ id: 'm-2' }], rowCount: 1 },
      ]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn().mockResolvedValueOnce(parentClient).mockResolvedValueOnce(childClient);
      setMenusServicePool(service, mockPool);

      await service.remove(TENANT_ID, 'm-1');

      expect(mockPool.connect).toHaveBeenCalledTimes(2);
      expect(parentClient.calls[1]).toEqual({
        params: [TENANT_ID],
        sql: `SELECT set_config('app.current_tenant', $1, true)`,
      });
      expect(childClient.calls.some((call) => call.sql === 'COMMIT')).toBe(true);
      expect(parentClient.calls.some((call) => call.sql === 'COMMIT')).toBe(true);
    });

    it('should throw NotFoundException when menu not found', async () => {
      const client = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => client);
      setMenusServicePool(service, mockPool);

      await expect(service.remove(TENANT_ID, 'nonexistent')).rejects.toThrow('Menu not found');
      expect(client.calls.at(-1)).toEqual({ params: [], sql: 'ROLLBACK' });
    });
  });

  describe('getRoleMenus', () => {
    it('should return empty array when pool is null', async () => {
      const result = await service.getRoleMenus(TENANT_ID, 'r-1');
      expect(result).toEqual([]);
    });

    it('should return menu IDs for a role inside a tenant-scoped session', async () => {
      const client = createTenantClient([{ rows: [{ menu_id: 'm-1' }, { menu_id: 'm-2' }], rowCount: 2 }]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => client);
      setMenusServicePool(service, mockPool);

      const result = await service.getRoleMenus(TENANT_ID, 'r-1');

      expect(client.calls[2]).toEqual({
        params: ['r-1'],
        sql: 'SELECT menu_id FROM role_menus WHERE role_id = $1',
      });
      expect(result).toEqual(['m-1', 'm-2']);
    });
  });

  describe('setRoleMenus', () => {
    it('should throw when pool is null', async () => {
      await expect(service.setRoleMenus(TENANT_ID, 'r-1', ['m-1'])).rejects.toThrow('Database not available');
    });

    it('should replace role menus in a tenant-scoped transaction', async () => {
      const txClient = createTenantClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 1 },
      ]);
      const readClient = createTenantClient([{ rows: [{ menu_id: 'm-1' }, { menu_id: 'm-2' }], rowCount: 2 }]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn().mockResolvedValueOnce(txClient).mockResolvedValueOnce(readClient);
      setMenusServicePool(service, mockPool);

      const result = await service.setRoleMenus(TENANT_ID, 'r-1', ['m-1', 'm-2']);

      expect(txClient.calls[1]).toEqual({
        params: [TENANT_ID],
        sql: `SELECT set_config('app.current_tenant', $1, true)`,
      });
      expect(txClient.calls[2]).toEqual({
        params: ['r-1'],
        sql: 'DELETE FROM role_menus WHERE role_id = $1',
      });
      expect(result).toEqual(['m-1', 'm-2']);
    });

    it('should rollback on error', async () => {
      const mockClient = createMockClient();
      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        mockClient.calls.push({ sql, params: params ?? [] });
        if (sql.includes('INSERT INTO role_menus')) {
          throw new Error('DB error');
        }
        return { rows: [], rowCount: 0 };
      });

      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => mockClient);
      setMenusServicePool(service, mockPool);

      await expect(service.setRoleMenus(TENANT_ID, 'r-1', ['m-1'])).rejects.toThrow('DB error');
      expect(mockClient.calls.at(-1)).toEqual({ params: [], sql: 'ROLLBACK' });
    });
  });

  describe('getUserMenus', () => {
    it('should return empty array when pool is null', async () => {
      const result = await service.getUserMenus(TENANT_ID, 'u-1');
      expect(result).toEqual([]);
    });

    it('should return menus for user roles as tree', async () => {
      const rows = [
        {
          id: 'm-1',
          parent_id: null,
          name: 'Dashboard',
          path: '/dashboard',
          icon: 'home',
          sort_order: 0,
          permission_code: null,
          is_visible: true,
          created_at: new Date(),
        },
        {
          id: 'm-2',
          parent_id: 'm-1',
          name: 'Analytics',
          path: '/dashboard/analytics',
          icon: 'chart',
          sort_order: 1,
          permission_code: null,
          is_visible: true,
          created_at: new Date(),
        },
      ];
      const client = createTenantClient([{ rows, rowCount: 2 }]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => client);
      setMenusServicePool(service, mockPool);

      const result = await service.getUserMenus(TENANT_ID, 'u-1');
      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
    });

    it('should include visible ancestor groups for assigned child menus', async () => {
      const rows = [
        {
          id: 'group-1',
          parent_id: null,
          name: '开发工具',
          path: null,
          icon: 'code',
          sort_order: 3,
          permission_code: null,
          is_visible: true,
          created_at: new Date('2026-03-31T00:00:00.000Z'),
        },
        {
          id: 'menu-1',
          parent_id: 'group-1',
          name: '代码分析',
          path: '/modernizer',
          icon: 'search',
          sort_order: 1,
          permission_code: 'modernizer:view',
          is_visible: true,
          created_at: new Date('2026-03-31T00:00:01.000Z'),
        },
      ];
      const client = createTenantClient([{ rows, rowCount: 2 }]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => client);
      setMenusServicePool(service, mockPool);

      const result = await service.getUserMenus('default', 'u-1');

      expect(client.calls[2]).toEqual({
        params: ['default', 'u-1'],
        sql: expect.stringContaining('WITH RECURSIVE accessible_menus AS'),
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('group-1');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children![0].id).toBe('menu-1');
    });

    it('should scope user menu queries by tenant to avoid cross-tenant leakage', async () => {
      const client = createTenantClient([{ rows: [], rowCount: 0 }]);
      const mockPool = createMockPool();
      mockPool.connect = vi.fn(async () => client);
      setMenusServicePool(service, mockPool);

      await service.getUserMenus('tenant-b', 'u-1');

      expect(client.calls[1]).toEqual({
        params: ['tenant-b'],
        sql: `SELECT set_config('app.current_tenant', $1, true)`,
      });
      expect(client.calls[2]).toEqual({
        params: ['tenant-b', 'u-1'],
        sql: expect.stringContaining('r.tenant_id = $1 AND ur.user_id = $2'),
      });
    });
  });
});
