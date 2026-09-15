export { setupTestEnv, clearTestEnv } from './testEnv';
export { createMockPool, createMockClient, type MockPool, type MockClient, type QueryResult } from './mockPool';

import { vi } from 'vitest';
import { AuthService } from '../../modules/auth/authService';
import { OAuthAccountRepository } from '../../infrastructure/database/oauthAccountRepository';
import { SmsCodeRepository } from '../../infrastructure/database/smsCodeRepository';
import { UserRepository } from '../../infrastructure/database/userRepository';

/**
 * Mocks for the three repositories AuthService depends on. Each property is a vi.fn so individual
 * tests can stub return values with mockResolvedValue/mockRejectedValue. Methods not relevant to a
 * test are left as no-op vi.fn() returning undefined — matching the "explicit per-test stubbing"
 * style the auth tests already use.
 */
export interface AuthRepositoryMocks {
  userRepository: {
    findByEmail: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findNameById: ReturnType<typeof vi.fn>;
    getRoleNames: ReturnType<typeof vi.fn>;
    createUserWithDefaultRole: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
    assignDefaultRole: ReturnType<typeof vi.fn>;
    acquireClient: ReturnType<typeof vi.fn>;
  };
  oauthAccountRepository: {
    findByProvider: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    listByUserId: ReturnType<typeof vi.fn>;
    deleteByUserAndProvider: ReturnType<typeof vi.fn>;
  };
  smsCodeRepository: {
    countRecentByPhone: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    findValidByPhoneAndCode: ReturnType<typeof vi.fn>;
    markUsed: ReturnType<typeof vi.fn>;
  };
}

/**
 * Build an AuthService wired to fresh mock repositories, returning both the service and the mock
 * handles so tests can stub return values and assert calls. Replaces the old pattern of casting
 * `service.pool = mockPool` — after the repository extraction, AuthService no longer holds a pool;
 * it holds three repositories, so tests mock at the repository method boundary instead.
 *
 * Tests that previously asserted on SQL strings (e.g. `mockPool.query` nth-call params) now assert
 * on repository method calls (e.g. `mocks.userRepository.findByEmail`). This is a deliberate
 * granularity shift: the SQL-shape contract moved into the repository's own unit tests, and the
 * service tests verify orchestration.
 */
export function createAuthServiceWithMocks(): { service: AuthService; mocks: AuthRepositoryMocks } {
  const mocks: AuthRepositoryMocks = {
    userRepository: {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      findNameById: vi.fn(),
      getRoleNames: vi.fn(),
      createUserWithDefaultRole: vi.fn(),
      updatePassword: vi.fn(),
      assignDefaultRole: vi.fn(),
      acquireClient: vi.fn(),
    },
    oauthAccountRepository: {
      findByProvider: vi.fn(),
      insert: vi.fn(),
      listByUserId: vi.fn(),
      deleteByUserAndProvider: vi.fn(),
    },
    smsCodeRepository: {
      countRecentByPhone: vi.fn(),
      insert: vi.fn(),
      findValidByPhoneAndCode: vi.fn(),
      markUsed: vi.fn(),
    },
  };

  const service = new AuthService(
    mocks.userRepository as unknown as UserRepository,
    mocks.oauthAccountRepository as unknown as OAuthAccountRepository,
    mocks.smsCodeRepository as unknown as SmsCodeRepository,
  );

  return { service, mocks };
}
