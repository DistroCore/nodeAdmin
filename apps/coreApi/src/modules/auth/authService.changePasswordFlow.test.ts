import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compare, hash } from 'bcryptjs';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

import { AuthService } from './authService';

describe('AuthService changePassword flow', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  it('verifies the old password and stores a newly hashed password', async () => {
    const currentPasswordHash = await hash('OldP@ssword1', 4);
    const mockClient = createMockClient([]);
    let persistedPasswordHash: string | null = null;

    mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      mockClient.calls.push({ sql, params: params ?? [] });

      if (sql.includes('UPDATE users')) {
        persistedPasswordHash = params?.[0] as string;
      }

      return { rows: [], rowCount: 1 };
    });

    const mockPool = createMockPool([
      {
        rows: [{ id: 'user-1', password_hash: currentPasswordHash, is_active: 1 }],
        rowCount: 1,
      },
    ]);
    mockPool.connect = vi.fn(async () => mockClient);

    (service as unknown as { pool: typeof mockPool }).pool = mockPool;

    await service.changePassword('user-1', 'tenant-a', 'OldP@ssword1', 'NewP@ssword2');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND tenant_id = $2'),
      ['user-1', 'tenant-a']
    );
    expect(persistedPasswordHash).toBeTypeOf('string');
    expect(persistedPasswordHash).not.toBe(currentPasswordHash);
    expect(await compare('NewP@ssword2', persistedPasswordHash as string)).toBe(true);
    expect(await compare('OldP@ssword1', persistedPasswordHash as string)).toBe(false);
  });

  it('rejects password changes when the tenant does not own the user record', async () => {
    const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);

    (service as unknown as { pool: typeof mockPool }).pool = mockPool;

    await expect(
      service.changePassword('user-1', 'tenant-b', 'OldP@ssword1', 'NewP@ssword2')
    ).rejects.toThrow('User not found.');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND tenant_id = $2'),
      ['user-1', 'tenant-b']
    );
  });

  it('rejects password changes for disabled accounts before updating the hash', async () => {
    const currentPasswordHash = await hash('OldP@ssword1', 4);
    const mockPool = createMockPool([
      {
        rows: [{ id: 'user-1', password_hash: currentPasswordHash, is_active: 0 }],
        rowCount: 1,
      },
    ]);

    (service as unknown as { pool: typeof mockPool }).pool = mockPool;

    await expect(
      service.changePassword('user-1', 'tenant-a', 'OldP@ssword1', 'NewP@ssword2')
    ).rejects.toThrow('Account is disabled.');
  });
});
