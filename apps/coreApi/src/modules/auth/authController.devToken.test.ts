import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

import { runtimeConfig } from '../../app/runtimeConfig';
import { AuthController } from './authController';
import { AuthService } from './authService';

function createMockAuditLogService() {
  return {
    listByTenant: vi.fn(),
    record: vi.fn(),
  };
}

describe('AuthController dev token flow', () => {
  let authService: AuthService;
  let controller: AuthController;
  let auditLogService: ReturnType<typeof createMockAuditLogService>;
  let originalEnableDevTokenIssue: boolean;

  beforeEach(() => {
    authService = new AuthService();
    auditLogService = createMockAuditLogService();
    controller = new AuthController(authService, auditLogService as never);
    originalEnableDevTokenIssue = runtimeConfig.auth.enableDevTokenIssue;
  });

  afterEach(() => {
    runtimeConfig.auth.enableDevTokenIssue = originalEnableDevTokenIssue;
  });

  it('issues a valid token with the default super-admin role', async () => {
    const result = await controller.issueDevToken({
      tenantId: 'tenant-a',
      userId: 'dev-user',
    });

    const identity = authService.verifyAccessToken(result.accessToken);

    expect(result.identity).toEqual({
      roles: ['super-admin'],
      tenantId: 'tenant-a',
      userId: 'dev-user',
    });
    expect(identity).toMatchObject({
      roles: ['super-admin'],
      tenantId: 'tenant-a',
      userId: 'dev-user',
    });
  });

  it('preserves custom roles in the issued dev token', async () => {
    const result = await controller.issueDevToken({
      roles: ['admin', 'im:operator'],
      tenantId: 'tenant-a',
      userId: 'dev-user',
    });

    const identity = authService.verifyAccessToken(result.accessToken);

    expect(identity.roles).toEqual(['admin', 'im:operator']);
  });

  it('rejects dev token issuance when the feature flag is disabled', async () => {
    runtimeConfig.auth.enableDevTokenIssue = false;

    await expect(
      controller.issueDevToken({
        roles: ['admin'],
        tenantId: 'tenant-a',
        userId: 'dev-user',
      })
    ).rejects.toThrow(ForbiddenException);
  });
});
