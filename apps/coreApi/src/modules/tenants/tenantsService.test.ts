import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { setupTestEnv, createMockPool, createMockClient } from '../../__tests__/helpers';
import type { MockPool } from '../../__tests__/helpers';

setupTestEnv();

import { TenantsService } from './tenantsService';

function setTenantsServicePool(service: TenantsService, pool: MockPool): void {
  (service as unknown as { pool: MockPool }).pool = pool;
}

describe('TenantsService', () => {
  let service: TenantsService;

  beforeEach(() => {
    service = new TenantsService();
  });

  // ─── list ───────────────────────────────────────────────────

  describe('list', () => {
    it('should return empty array when pool is null', async () => {
      const result = await service.list();
      expect(result).toEqual([]);
    });

    it('should return tenants from database', async () => {
      const mockPool = createMockPool([
        {
          rows: [
            { id: 't-1', name: 'Tenant 1', slug: 'tenant-1', is_active: true },
            { id: 't-2', name: 'Tenant 2', slug: 'tenant-2', is_active: true },
          ],
          rowCount: 2,
        },
      ]);
      setTenantsServicePool(service, mockPool);

      const result = await service.list();
      expect(result).toHaveLength(2);
    });
  });

  // ─── findById ───────────────────────────────────────────────

  describe('findById', () => {
    it('should throw NotFoundException when pool is null', async () => {
      await expect(service.findById('t-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when tenant not found', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      setTenantsServicePool(service, mockPool);

      await expect(service.findById('nonexistent')).rejects.toThrow('Tenant not found');
    });

    it('should return tenant by id', async () => {
      const mockPool = createMockPool([{ rows: [{ id: 't-1', name: 'Tenant 1', slug: 't1' }], rowCount: 1 }]);
      setTenantsServicePool(service, mockPool);

      const result = await service.findById('t-1');
      expect(result.id).toBe('t-1');
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('should throw when pool is null', async () => {
      await expect(service.create({ name: 'T', slug: 't' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('should throw ConflictException for duplicate slug', async () => {
      const mockPool = createMockPool([{ rows: [{ id: 'existing' }], rowCount: 1 }]);
      setTenantsServicePool(service, mockPool);

      await expect(service.create({ name: 'T', slug: 'existing-slug' })).rejects.toThrow('Tenant slug already exists');
    });

    it('should create tenant and return it', async () => {
      const mockPool = createMockPool([
        { rows: [], rowCount: 0 }, // slug check
        { rows: [], rowCount: 1 }, // INSERT
        {
          rows: [{ id: 't-1', name: 'New Tenant', slug: 'new-tenant', is_active: true }],
          rowCount: 1,
        }, // findById
      ]);
      setTenantsServicePool(service, mockPool);

      const result = await service.create({ name: 'New Tenant', slug: 'new-tenant' });
      expect(result.name).toBe('New Tenant');
    });

    it('should store an inactive tenant with is_active = 0', async () => {
      const mockPool = createMockPool([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 1 },
        {
          rows: [{ id: 't-2', name: 'Dormant Tenant', slug: 'dormant', is_active: 0 }],
          rowCount: 1,
        },
      ]);
      setTenantsServicePool(service, mockPool);

      const result = await service.create({
        name: 'Dormant Tenant',
        slug: 'dormant',
        isActive: false,
      });

      expect(result.is_active).toBe(0);
      expect(mockPool.query).toHaveBeenNthCalledWith(
        2,
        'INSERT INTO tenants (id, name, slug, logo, is_active, config_json) VALUES ($1, $2, $3, $4, $5, $6)',
        [expect.any(String), 'Dormant Tenant', 'dormant', null, 0, '{}'],
      );
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    it('should throw when pool is null', async () => {
      await expect(service.update('t-1', { name: 'X' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('should return tenant unchanged when no fields provided', async () => {
      const mockPool = createMockPool([{ rows: [{ id: 't-1', name: 'Tenant 1', slug: 't1' }], rowCount: 1 }]);
      setTenantsServicePool(service, mockPool);

      const result = await service.update('t-1', {});
      expect(result.id).toBe('t-1');
    });

    it('should throw NotFoundException when tenant not found during update', async () => {
      const mockPool = createMockPool([
        { rows: [], rowCount: 0 }, // UPDATE RETURNING (no rows)
      ]);
      setTenantsServicePool(service, mockPool);

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow('Tenant not found');
    });

    it('should update fields and return updated tenant', async () => {
      const mockPool = createMockPool([
        { rows: [{ id: 't-1' }], rowCount: 1 }, // UPDATE RETURNING
        { rows: [{ id: 't-1', name: 'Updated', slug: 't1' }], rowCount: 1 }, // findById
      ]);
      setTenantsServicePool(service, mockPool);

      const result = await service.update('t-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should deactivate a tenant by storing is_active = 0', async () => {
      const mockPool = createMockPool([
        { rows: [{ id: 't-1' }], rowCount: 1 },
        { rows: [{ id: 't-1', name: 'Tenant 1', slug: 't1', is_active: 0 }], rowCount: 1 },
      ]);
      setTenantsServicePool(service, mockPool);

      const result = await service.update('t-1', { isActive: false });

      expect(result.is_active).toBe(0);
      expect(mockPool.query).toHaveBeenNthCalledWith(
        1,
        'UPDATE tenants SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING id',
        [0, 't-1'],
      );
    });

    it('should reactivate a tenant by storing is_active = 1', async () => {
      const mockPool = createMockPool([
        { rows: [{ id: 't-1' }], rowCount: 1 },
        { rows: [{ id: 't-1', name: 'Tenant 1', slug: 't1', is_active: 1 }], rowCount: 1 },
      ]);
      setTenantsServicePool(service, mockPool);

      const result = await service.update('t-1', { isActive: true });

      expect(result.is_active).toBe(1);
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should throw when pool is null', async () => {
      await expect(service.remove('t-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('should throw ConflictException for default tenant', async () => {
      const mockPool = createMockPool([]);
      setTenantsServicePool(service, mockPool);

      await expect(service.remove('default')).rejects.toThrow('Cannot delete the default tenant');
    });

    it('should throw NotFoundException when tenant not found', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      setTenantsServicePool(service, mockPool);

      await expect(service.remove('nonexistent')).rejects.toThrow('Tenant not found');
      expect(mockClient.calls.some((call) => call.sql === 'ROLLBACK')).toBe(true);
    });

    it('should delete tenant', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [{ id: 't-1' }], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      setTenantsServicePool(service, mockPool);

      await service.remove('t-1');
      expect(mockClient.calls.some((call) => call.sql === 'DELETE FROM users WHERE tenant_id = $1')).toBe(true);
      expect(mockClient.calls.some((call) => call.sql === 'DELETE FROM roles WHERE tenant_id = $1')).toBe(true);
      expect(mockClient.calls.some((call) => call.sql === 'DELETE FROM tenants WHERE id = $1 RETURNING id')).toBe(true);
      expect(mockClient.calls.some((call) => call.sql === 'COMMIT')).toBe(true);
    });

    it('should rollback the cascade when one dependent delete fails', async () => {
      const mockClient = createMockClient([]);
      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        mockClient.calls.push({ sql, params: params ?? [] });
        if (sql === 'DELETE FROM roles WHERE tenant_id = $1') {
          throw new Error('role delete failed');
        }
        return { rows: [], rowCount: 0 };
      });
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      setTenantsServicePool(service, mockPool);

      await expect(service.remove('t-1')).rejects.toThrow('role delete failed');
      expect(mockClient.calls.some((call) => call.sql === 'ROLLBACK')).toBe(true);
    });
  });
});
