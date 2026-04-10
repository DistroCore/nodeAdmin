import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hash } from 'bcryptjs';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

import { AuthService } from './authService';

describe('AuthService tenant isolation', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  it('scopes registration uniqueness checks and writes to the requested tenant', async () => {
    const mockClient = createMockClient([]);
    const mockPool = createMockPool([
      { rows: [], rowCount: 0 },
      { rows: [{ name: 'viewer' }], rowCount: 1 },
    ]);
    mockPool.connect = vi.fn(async () => mockClient);

    (service as unknown as { pool: typeof mockPool }).pool = mockPool;

    const result = await service.register('shared@example.com', 'TenantScopedP@ss1', 'tenant-b', 'Tenant B User');

    expect(result.roles).toEqual(['viewer']);
    expect(mockPool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT id FROM users WHERE tenant_id = $1 AND email = $2'),
      ['tenant-b', 'shared@example.com'],
    );

    const insertUserCall = mockClient.calls.find((call) => call.sql.includes('INSERT INTO users'));
    expect(insertUserCall?.params).toEqual([
      expect.any(String),
      'tenant-b',
      'shared@example.com',
      expect.any(String),
      'Tenant B User',
    ]);
  });

  it('looks up login credentials inside the tenant supplied by the caller', async () => {
    const passwordHash = await hash('TenantBP@ss2', 4);
    const mockPool = createMockPool([
      {
        rows: [
          {
            id: 'tenant-b-user',
            email: 'shared@example.com',
            password_hash: passwordHash,
            name: 'Tenant B User',
            is_active: 1,
          },
        ],
        rowCount: 1,
      },
      { rows: [{ name: 'admin' }], rowCount: 1 },
    ]);

    (service as unknown as { pool: typeof mockPool }).pool = mockPool;

    const result = await service.login('shared@example.com', 'TenantBP@ss2', 'tenant-b');

    expect(result.userId).toBe('tenant-b-user');
    expect(result.roles).toEqual(['admin']);
    expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE tenant_id = $1 AND email = $2'), [
      'tenant-b',
      'shared@example.com',
    ]);
  });

  it('rejects cross-tenant logins when the email exists in another tenant only', async () => {
    const mockPool = createMockPool([{ rows: [], rowCount: 0 }]);

    (service as unknown as { pool: typeof mockPool }).pool = mockPool;

    await expect(service.login('shared@example.com', 'TenantBP@ss2', 'tenant-a')).rejects.toThrow(
      'Invalid email or password.',
    );

    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id = $1 AND email = $2'), [
      'tenant-a',
      'shared@example.com',
    ]);
  });
});
