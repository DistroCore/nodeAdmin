import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compare } from 'bcryptjs';
import { createAuthServiceWithMocks, setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

describe('AuthService — resetPassword', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('resets the password for an existing active user', async () => {
    const { service, mocks } = createAuthServiceWithMocks();
    mocks.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: true,
      name: null,
      passwordHash: 'old-hash',
    });

    let persistedHash: string | null = null;
    mocks.userRepository.updatePassword.mockImplementation(async (_tenantId: string, _userId: string, hash: string) => {
      persistedHash = hash;
    });

    await service.resetPassword('user@example.com', 'newPassword123', 'tenant-1');

    expect(mocks.userRepository.findByEmail).toHaveBeenCalledWith('tenant-1', 'user@example.com');
    // The repository receives the userId it resolved from the email lookup, not the email.
    expect(mocks.userRepository.updatePassword).toHaveBeenCalledWith('tenant-1', 'user-1', expect.any(String));

    // The hash is freshly derived from the new password (not the old one) and is bcrypt-formatted.
    expect(persistedHash).not.toBe('old-hash');
    expect(await compare('newPassword123', persistedHash as string)).toBe(true);
  });

  it('throws when no user matches the email in the tenant', async () => {
    const { service, mocks } = createAuthServiceWithMocks();
    mocks.userRepository.findByEmail.mockResolvedValue(null);

    await expect(service.resetPassword('nobody@example.com', 'newPassword123', 'tenant-1')).rejects.toThrow(
      'User not found.',
    );
    expect(mocks.userRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('throws when the account is disabled', async () => {
    const { service, mocks } = createAuthServiceWithMocks();
    mocks.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'disabled@example.com',
      isActive: false,
      name: null,
      passwordHash: 'old-hash',
    });

    await expect(service.resetPassword('disabled@example.com', 'newPassword123', 'tenant-1')).rejects.toThrow(
      'Account is disabled.',
    );
    expect(mocks.userRepository.updatePassword).not.toHaveBeenCalled();
  });
});
