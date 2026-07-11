import { beforeEach, describe, expect, it } from 'vitest';
import { compare, hash } from 'bcryptjs';
import { createAuthServiceWithMocks, setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

describe('AuthService changePassword flow', () => {
  let mocks: ReturnType<typeof createAuthServiceWithMocks>['mocks'];
  let service: ReturnType<typeof createAuthServiceWithMocks>['service'];

  beforeEach(() => {
    const harness = createAuthServiceWithMocks();
    service = harness.service;
    mocks = harness.mocks;
  });

  it('verifies the old password and persists a freshly hashed new password', async () => {
    const currentPasswordHash = await hash('OldP@ssword1', 4);
    mocks.userRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: true,
      name: null,
      passwordHash: currentPasswordHash,
    });

    let persistedHash: string | null = null;
    mocks.userRepository.updatePassword.mockImplementation(
      async (_tenantId: string, _userId: string, hashValue: string) => {
        persistedHash = hashValue;
      },
    );

    await service.changePassword('user-1', 'tenant-a', 'OldP@ssword1', 'NewP@ssword2');

    expect(mocks.userRepository.findById).toHaveBeenCalledWith('tenant-a', 'user-1');
    expect(mocks.userRepository.updatePassword).toHaveBeenCalledWith('tenant-a', 'user-1', expect.any(String));

    expect(persistedHash).toBeTypeOf('string');
    expect(persistedHash).not.toBe(currentPasswordHash);
    expect(await compare('NewP@ssword2', persistedHash as string)).toBe(true);
    expect(await compare('OldP@ssword1', persistedHash as string)).toBe(false);
  });

  it('rejects when no user matches the id within the tenant', async () => {
    mocks.userRepository.findById.mockResolvedValue(null);

    await expect(service.changePassword('user-1', 'tenant-b', 'OldP@ssword1', 'NewP@ssword2')).rejects.toThrow(
      'User not found.',
    );
    expect(mocks.userRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects password changes for disabled accounts before updating the hash', async () => {
    mocks.userRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: false,
      name: null,
      passwordHash: await hash('OldP@ssword1', 4),
    });

    await expect(service.changePassword('user-1', 'tenant-a', 'OldP@ssword1', 'NewP@ssword2')).rejects.toThrow(
      'Account is disabled.',
    );
    expect(mocks.userRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects when the supplied current password does not match', async () => {
    mocks.userRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isActive: true,
      name: null,
      passwordHash: await hash('CorrectOldP@ss1', 4),
    });

    // Returns BadRequest (400), not Unauthorized — see authService.changePassword rationale.
    await expect(service.changePassword('user-1', 'tenant-a', 'WrongCurrentP@ss', 'NewP@ssword2')).rejects.toThrow(
      'Current password is incorrect.',
    );
    expect(mocks.userRepository.updatePassword).not.toHaveBeenCalled();
  });
});
