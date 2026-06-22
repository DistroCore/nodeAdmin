import { beforeEach, describe, expect, it } from 'vitest';
import { hash } from 'bcryptjs';
import { createAuthServiceWithMocks, setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

// Tenant isolation here is asserted at the service→repository boundary: every call into a
// repository method must thread the caller's tenantId through. The SQL-level RLS enforcement is
// covered by repository unit tests (which assert set_config is called inside transactions) and the
// real-database integration tests. Keeping this file focused on the orchestration contract avoids
// duplicating the SQL-shape assertions that now live in the repository tests.
describe('AuthService tenant isolation', () => {
  let mocks: ReturnType<typeof createAuthServiceWithMocks>['mocks'];
  let service: ReturnType<typeof createAuthServiceWithMocks>['service'];

  beforeEach(() => {
    const harness = createAuthServiceWithMocks();
    service = harness.service;
    mocks = harness.mocks;
  });

  it('passes the requested tenant into the registration lookup and write', async () => {
    mocks.userRepository.findByEmail.mockResolvedValue(null);
    mocks.userRepository.createUserWithDefaultRole.mockResolvedValue(undefined);
    mocks.userRepository.getRoleNames.mockResolvedValue(['viewer']);

    const result = await service.register('shared@example.com', 'TenantScopedP@ss1', 'tenant-b', 'Tenant B User');

    expect(result.roles).toEqual(['viewer']);
    // The uniqueness check must scope to tenant-b, not the default tenant.
    expect(mocks.userRepository.findByEmail).toHaveBeenCalledWith('tenant-b', 'shared@example.com');
    // And the user creation transaction must carry tenant-b.
    expect(mocks.userRepository.createUserWithDefaultRole).toHaveBeenCalledWith(
      'tenant-b',
      expect.any(String),
      'shared@example.com',
      expect.any(String),
      'Tenant B User',
    );
    // Role resolution also scoped to tenant-b.
    expect(mocks.userRepository.getRoleNames).toHaveBeenCalledWith(result.userId, 'tenant-b');
  });

  it('refuses registration when the email already exists in the same tenant', async () => {
    mocks.userRepository.findByEmail.mockResolvedValue({
      id: 'existing-user',
      email: 'shared@example.com',
      isActive: true,
      name: null,
      passwordHash: 'hash',
    });

    await expect(service.register('shared@example.com', 'TenantScopedP@ss1', 'tenant-b', 'Dup')).rejects.toThrow(
      'Email already registered in this tenant.',
    );
    expect(mocks.userRepository.createUserWithDefaultRole).not.toHaveBeenCalled();
  });

  it('looks up login credentials inside the tenant supplied by the caller', async () => {
    const passwordHash = await hash('TenantBP@ss2', 4);
    mocks.userRepository.findByEmail.mockResolvedValue({
      id: 'tenant-b-user',
      email: 'shared@example.com',
      isActive: true,
      name: 'Tenant B User',
      passwordHash,
    });
    mocks.userRepository.getRoleNames.mockResolvedValue(['admin']);

    const result = await service.login('shared@example.com', 'TenantBP@ss2', 'tenant-b');

    expect(result.userId).toBe('tenant-b-user');
    expect(result.roles).toEqual(['admin']);
    expect(mocks.userRepository.findByEmail).toHaveBeenCalledWith('tenant-b', 'shared@example.com');
    expect(mocks.userRepository.getRoleNames).toHaveBeenCalledWith('tenant-b-user', 'tenant-b');
  });

  it('rejects cross-tenant logins when the email exists only in another tenant', async () => {
    // Repository returns null for tenant-a — the email lives in tenant-b only. The service must
    // surface a generic "invalid" error rather than leaking which tenant has the account.
    mocks.userRepository.findByEmail.mockResolvedValue(null);

    await expect(service.login('shared@example.com', 'TenantBP@ss2', 'tenant-a')).rejects.toThrow(
      'Invalid email or password.',
    );
    expect(mocks.userRepository.getRoleNames).not.toHaveBeenCalled();
  });
});
