import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { setupTestEnv, createMockPool, createMockClient } from '../../__tests__/helpers';
import type { MockPool, QueryResult } from '../../__tests__/helpers';

setupTestEnv();

import { UsersService } from './usersService';

function setUsersServicePool(service: UsersService, pool: MockPool): void {
  (service as unknown as { pool: MockPool }).pool = pool;
}

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    service = new UsersService();
  });

  // ─── list ───────────────────────────────────────────────────

  describe('list', () => {
    it('should return empty result when pool is null', async () => {
      const result = await service.list('t-1');
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it('should return paginated users with roles', async () => {
      const mockPool = createMockPool([
        { rows: [{ count: 1 }], rowCount: 1 } as QueryResult,
        {
          rows: [
            {
              id: 'u-1',
              tenant_id: 't-1',
              email: 'a@b.com',
              phone: null,
              name: 'User1',
              avatar: null,
              is_active: 1,
              created_at: new Date(),
              updated_at: new Date(),
              roles: [{ id: 'r-1', name: 'admin' }],
            },
          ],
          rowCount: 1,
        } as QueryResult,
      ]);
      setUsersServicePool(service, mockPool);

      const result = await service.list('t-1', 1, 20);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should apply search filter when provided', async () => {
      const mockPool = createMockPool([
        { rows: [{ count: 0 }], rowCount: 1 } as QueryResult,
        { rows: [], rowCount: 0 } as QueryResult,
      ]);
      setUsersServicePool(service, mockPool);

      const result = await service.list('t-1', 1, 20, 'search');
      expect(result.items).toHaveLength(0);

      // Verify the search param was included (query was called with more params)
      const callArgs = mockPool.query.mock.calls[0];
      expect(callArgs[1].length).toBeGreaterThanOrEqual(2);
    });

    it('should calculate correct offset for page 2', async () => {
      const mockPool = createMockPool([
        { rows: [{ count: 25 }], rowCount: 1 } as QueryResult,
        { rows: [], rowCount: 0 } as QueryResult,
      ]);
      setUsersServicePool(service, mockPool);

      await service.list('t-1', 2, 10);
      // The second query should include pageSize=10 and offset=10
      const secondCallArgs = mockPool.query.mock.calls[1];
      expect(secondCallArgs[1]).toContain(10); // pageSize
      expect(secondCallArgs[1]).toContain(10); // offset
    });
  });

  // ─── findById ───────────────────────────────────────────────

  describe('findById', () => {
    it('should throw NotFoundException when pool is null', async () => {
      await expect(service.findById('t-1', 'u-1')).rejects.toThrow('User not found');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);
      setUsersServicePool(service, mockPool);

      await expect(service.findById('t-1', 'u-1')).rejects.toThrow('User not found');
    });

    it('should return user with roles', async () => {
      const mockPool = createMockPool([
        {
          rows: [
            {
              id: 'u-1',
              tenant_id: 't-1',
              email: 'a@b.com',
              phone: null,
              name: 'User1',
              avatar: null,
              is_active: 1,
              created_at: new Date(),
              updated_at: new Date(),
              roles: [{ id: 'r-1', name: 'admin' }],
            },
          ],
          rowCount: 1,
        },
      ]);
      setUsersServicePool(service, mockPool);

      const user = await service.findById('t-1', 'u-1');
      expect(user.id).toBe('u-1');
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('should throw when pool is null', async () => {
      await expect(service.create('t-1', 'a@b.com', 'pass', 'Name')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('should create user with transaction and return user', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 1 }, // INSERT user
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        {
          rows: [
            {
              id: 'new-user',
              tenant_id: 't-1',
              email: 'a@b.com',
              roles: [],
            },
          ],
          rowCount: 1,
        },
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      setUsersServicePool(service, mockPool);

      const result = await service.create('t-1', 'a@b.com', 'password123', 'Name');
      expect(result.id).toBe('new-user');
      expect(mockPool.connect).toHaveBeenCalled();
    });

    it('should rollback on INSERT failure', async () => {
      const mockClient = createMockClient([]);
      mockClient.query.mockImplementation(async (sql: string) => {
        mockClient.calls.push({ sql, params: [] });
        if (sql.includes('INSERT INTO users')) {
          throw new Error('DB insert error');
        }
        return { rows: [], rowCount: 0 };
      });

      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      setUsersServicePool(service, mockPool);

      await expect(service.create('t-1', 'a@b.com', 'pass', 'Name')).rejects.toThrow('DB insert error');

      const rollbackCall = mockClient.calls.find((c) => c.sql === 'ROLLBACK');
      expect(rollbackCall).toBeDefined();
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    it('should throw when pool is null', async () => {
      await expect(service.update('t-1', 'u-1', { name: 'New' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('should update fields and commit transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 1 }, // UPDATE
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([
        {
          rows: [{ id: 'u-1', tenant_id: 't-1', email: 'a@b.com', roles: [] }],
          rowCount: 1,
        },
      ]);
      mockPool.connect = vi.fn(async () => mockClient);
      setUsersServicePool(service, mockPool);

      const result = await service.update('t-1', 'u-1', { name: 'New Name' });
      expect(result.id).toBe('u-1');
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should throw when pool is null', async () => {
      await expect(service.remove('t-1', 'u-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('should delete user within transaction', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 0 }, // DELETE user_roles
        { rows: [{ id: 'u-1' }], rowCount: 1 }, // DELETE users RETURNING
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      setUsersServicePool(service, mockPool);

      await service.remove('t-1', 'u-1');
      const commitCall = mockClient.calls.find((c) => c.sql === 'COMMIT');
      expect(commitCall).toBeDefined();
    });

    it('should throw NotFoundException when user not found', async () => {
      const mockClient = createMockClient([
        { rows: [], rowCount: 0 }, // BEGIN
        { rows: [], rowCount: 0 }, // set_config
        { rows: [], rowCount: 0 }, // DELETE user_roles
        { rows: [], rowCount: 0 }, // DELETE users RETURNING (empty)
        { rows: [], rowCount: 0 }, // COMMIT
      ]);
      const mockPool = createMockPool([]);
      mockPool.connect = vi.fn(async () => mockClient);
      setUsersServicePool(service, mockPool);

      await expect(service.remove('t-1', 'u-1')).rejects.toThrow('User not found');
    });
  });
});
