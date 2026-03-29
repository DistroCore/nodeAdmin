import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { setupTestEnv, createMockPool } from '../../__tests__/helpers';

setupTestEnv();

import { TenantsService } from './tenantsService';

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
      (service as any).pool = mockPool;

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
      (service as any).pool = mockPool;

      await expect(service.findById('nonexistent')).rejects.toThrow('Tenant not found');
    });

    it('should return tenant by id', async () => {
      const mockPool = createMockPool([
        { rows: [{ id: 't-1', name: 'Tenant 1', slug: 't1' }], rowCount: 1 },
      ]);
      (service as any).pool = mockPool;

      const result = await service.findById('t-1');
      expect(result.id).toBe('t-1');
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('should throw when pool is null', async () => {
      await expect(service.create({ name: 'T', slug: 't' })).rejects.toThrow('Database not available');
    });

    it('should throw ConflictException for duplicate slug', async () => {
      const mockPool = createMockPool([
        { rows: [{ id: 'existing' }], rowCount: 1 },
      ]);
      (service as any).pool = mockPool;

      await expect(service.create({ name: 'T', slug: 'existing-slug' })).rejects.toThrow(
        'Tenant slug already exists'
      );
    });

    it('should create tenant and return it', async () => {
      const mockPool = createMockPool([
        { rows: [], rowCount: 0 }, // slug check
        { rows: [], rowCount: 1 }, // INSERT
        { rows: [{ id: 't-1', name: 'New Tenant', slug: 'new-tenant', is_active: true }], rowCount: 1 }, // findById
      ]);
      (service as any).pool = mockPool;

      const result = await service.create({ name: 'New Tenant', slug: 'new-tenant' });
      expect(result.name).toBe('New Tenant');
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    it('should throw when pool is null', async () => {
      await expect(service.update('t-1', { name: 'X' })).rejects.toThrow('Database not available');
    });

    it('should return tenant unchanged when no fields provided', async () => {
      const mockPool = createMockPool([
        { rows: [{ id: 't-1', name: 'Tenant 1', slug: 't1' }], rowCount: 1 },
      ]);
      (service as any).pool = mockPool;

      const result = await service.update('t-1', {});
      expect(result.id).toBe('t-1');
    });

    it('should throw NotFoundException when tenant not found during update', async () => {
      const mockPool = createMockPool([
        { rows: [], rowCount: 0 }, // UPDATE RETURNING (no rows)
      ]);
      (service as any).pool = mockPool;

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow('Tenant not found');
    });

    it('should update fields and return updated tenant', async () => {
      const mockPool = createMockPool([
        { rows: [{ id: 't-1' }], rowCount: 1 }, // UPDATE RETURNING
        { rows: [{ id: 't-1', name: 'Updated', slug: 't1' }], rowCount: 1 }, // findById
      ]);
      (service as any).pool = mockPool;

      const result = await service.update('t-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should throw when pool is null', async () => {
      await expect(service.remove('t-1')).rejects.toThrow('Database not available');
    });

    it('should throw ConflictException for default tenant', async () => {
      const mockPool = createMockPool([]);
      (service as any).pool = mockPool;

      await expect(service.remove('default')).rejects.toThrow('Cannot delete the default tenant');
    });

    it('should throw NotFoundException when tenant not found', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      (service as any).pool = mockPool;

      await expect(service.remove('nonexistent')).rejects.toThrow('Tenant not found');
    });

    it('should delete tenant', async () => {
      const mockPool = createMockPool([
        { rows: [{ id: 't-1' }], rowCount: 1 },
      ]);
      (service as any).pool = mockPool;

      await service.remove('t-1');
      expect(mockPool.query).toHaveBeenCalled();
    });
  });
});
