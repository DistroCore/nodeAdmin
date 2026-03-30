import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { setupTestEnv, createMockPool, createMockClient } from '../../__tests__/helpers';

setupTestEnv();

import { RolesService } from './rolesService';

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(() => {
    service = new RolesService();
  });

  // ─── list ───────────────────────────────────────────────────

  describe('list', () => {
    it('should return empty array when pool is null', async () => {
      const result = await service.list('t-1');
      expect(result).toEqual([]);
    });

    it('should return roles with permissions', async () => {
      const mockPool = createMockPool([
        {
          rows: [
            { id: 'r-1', name: 'admin', description: 'Admin', is_system: false, permissions: [] },
          ],
          rowCount: 1,
        },
      ]);
      (service as any).pool = mockPool;

      const result = await service.list('t-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('admin');
    });
  });

  // ─── findById ───────────────────────────────────────────────

  describe('findById', () => {
    it('should throw NotFoundException when pool is null', async () => {
      await expect(service.findById('t-1', 'r-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when role not found', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as any).pool = mockPool;

      await expect(service.findById('t-1', 'r-1')).rejects.toThrow('Role not found');
    });

    it('should return role with permissions', async () => {
      const mockPool = createMockPool([
        {
          rows: [
            {
              id: 'r-1',
              name: 'admin',
              description: 'Admin',
              is_system: false,
              permissions: [{ id: 'p-1', code: 'users:read', name: 'Read Users' }],
            },
          ],
          rowCount: 1,
        },
      ]);
      (service as any).pool = mockPool;

      const role = await service.findById('t-1', 'r-1');
      expect(role.id).toBe('r-1');
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('should throw when pool is null', async () => {
      await expect(service.create('t-1', 'editor')).rejects.toThrow('Database not available');
    });

    it('should create role with permissions in transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 1 }, // INSERT role
        { rows: [], rowCount: 1 }, // INSERT role_permissions
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        {
          rows: [{ id: 'r-1', name: 'editor', is_system: false, permissions: [{ id: 'p-1' }] }],
          rowCount: 1,
        },
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      const result = await service.create('t-1', 'editor', 'Editor role', ['p-1']);
      expect(result.name).toBe('editor');
    });

    it('should rollback on error', async () => {
      const mockClient = createMockClient([]);
      mockClient.query.mockImplementation(async (sql: string) => {
        mockClient.calls.push({ sql, params: [] });
        if (sql.includes('INSERT INTO roles')) {
          throw new Error('DB error');
        }
        return { rows: [], rowCount: 0 };
      });

      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await expect(service.create('t-1', 'editor')).rejects.toThrow('DB error');
      expect(mockClient.calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    it('should throw when pool is null', async () => {
      await expect(service.update('t-1', 'r-1', { name: 'x' })).rejects.toThrow(
        'Database not available'
      );
    });

    it('should throw NotFoundException when role not found', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as any).pool = mockPool;

      await expect(service.update('t-1', 'r-1', { name: 'x' })).rejects.toThrow('Role not found');
    });

    it('should throw BadRequestException for system roles', async () => {
      const mockPool = createMockPool([{ rows: [{ is_system: true }], rowCount: 1 }]);
      (service as any).pool = mockPool;

      await expect(service.update('t-1', 'r-1', { name: 'x' })).rejects.toThrow(
        'Cannot modify system roles'
      );
    });

    it('should update role and permissions in transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 1 }, // UPDATE roles
        { rows: [], rowCount: 0 }, // DELETE role_permissions
        { rows: [], rowCount: 1 }, // INSERT role_permissions
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        { rows: [{ is_system: false }], rowCount: 1 }, // check query
        { rows: [{ id: 'r-1', name: 'updated', is_system: false, permissions: [] }], rowCount: 1 }, // findById
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      const result = await service.update('t-1', 'r-1', {
        name: 'updated',
        permissionIds: ['p-1'],
      });
      expect(result.name).toBe('updated');
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should throw when pool is null', async () => {
      await expect(service.remove('t-1', 'r-1')).rejects.toThrow('Database not available');
    });

    it('should throw NotFoundException when role not found', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as any).pool = mockPool;

      await expect(service.remove('t-1', 'r-1')).rejects.toThrow('Role not found');
    });

    it('should throw BadRequestException for system roles', async () => {
      const mockPool = createMockPool([{ rows: [{ is_system: true }], rowCount: 1 }]);
      (service as any).pool = mockPool;

      await expect(service.remove('t-1', 'r-1')).rejects.toThrow('Cannot delete system roles');
    });

    it('should delete role_menus as part of the cleanup', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([{ rows: [{ is_system: false }], rowCount: 1 }]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await service.remove('t-1', 'r-1');

      expect(
        mockClient.calls.some((call) => call.sql === 'DELETE FROM role_menus WHERE role_id = $1')
      ).toBe(true);
    });

    it('should delete role and related records in transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 0 }, // DELETE role_permissions
        { rows: [], rowCount: 0 }, // DELETE user_roles
        { rows: [], rowCount: 1 }, // DELETE roles
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([{ rows: [{ is_system: false }], rowCount: 1 }]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      await service.remove('t-1', 'r-1');
      expect(mockClient.calls.some((c) => c.sql === 'COMMIT')).toBe(true);
    });
  });

  describe('removeMany', () => {
    it('should throw when pool is null', async () => {
      await expect(service.removeMany('t-1', ['r-1'])).rejects.toThrow('Database not available');
    });

    it('should return zero deletions when no role IDs are provided', async () => {
      const mockPool = createMockPool([]);
      (service as any).pool = mockPool;

      await expect(service.removeMany('t-1', [])).resolves.toEqual({ deletedCount: 0 });
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should block batch deletion when one role is system-protected', async () => {
      const mockPool = createMockPool([
        {
          rows: [
            { id: 'r-1', is_system: false },
            { id: 'r-2', is_system: true },
          ],
          rowCount: 2,
        },
      ]);
      (service as any).pool = mockPool;

      await expect(service.removeMany('t-1', ['r-1', 'r-2'])).rejects.toThrow(
        'Cannot delete system roles'
      );
    });

    it('should trim and deduplicate role IDs before running the tenant check', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [{ id: 'r-1' }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([
        {
          rows: [{ id: 'r-1', is_system: false }],
          rowCount: 1,
        },
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      const result = await service.removeMany('t-1', [' r-1 ', 'r-1', '   ']);

      expect(result).toEqual({ deletedCount: 1 });
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT id, is_system FROM roles WHERE tenant_id = $1 AND id = ANY($2)',
        ['t-1', ['r-1']]
      );
    });

    it('should fail when one role belongs to another tenant or is missing', async () => {
      const mockPool = createMockPool([
        {
          rows: [{ id: 'r-1', is_system: false }],
          rowCount: 1,
        },
      ]);
      (service as any).pool = mockPool;

      await expect(service.removeMany('t-1', ['r-1', 'r-2'])).rejects.toThrow(
        'One or more roles not found'
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT id, is_system FROM roles WHERE tenant_id = $1 AND id = ANY($2)',
        ['t-1', ['r-1', 'r-2']]
      );
    });

    it('should delete multiple roles and related records in one transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [{ id: 'r-1' }, { id: 'r-2' }], rowCount: 2 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([
        {
          rows: [
            { id: 'r-1', is_system: false },
            { id: 'r-2', is_system: false },
          ],
          rowCount: 2,
        },
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      (service as any).pool = mockPool;

      const result = await service.removeMany('t-1', ['r-1', 'r-2', 'r-1']);

      expect(result).toEqual({ deletedCount: 2 });
      expect(
        mockClient.calls.some(
          (call) => call.sql === 'DELETE FROM role_menus WHERE role_id = ANY($1)'
        )
      ).toBe(true);
      expect(mockClient.calls.some((call) => call.sql === 'COMMIT')).toBe(true);
    });
  });
});
