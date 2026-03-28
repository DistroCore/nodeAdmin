/**
 * Test environment setup — must be called before any module that reads runtimeConfig.
 * runtimeConfig calls readRequiredEnv('JWT_ACCESS_SECRET') etc. at import time.
 *
 * The globalSetup file sets these same vars at vitest startup, but this helper
 * is available for per-test setup if needed.
 */

const REQUIRED_KEYS: Record<string, string> = {
  JWT_ACCESS_SECRET: 'test-access-secret-key',
  JWT_REFRESH_SECRET: 'test-refresh-secret-key',
  FRONTEND_ORIGINS: 'http://localhost:3000',
};

let savedEnvs: Record<string, string | undefined> = {};

export function setupTestEnv(): void {
  for (const [key, defaultValue] of Object.entries(REQUIRED_KEYS)) {
    if (!process.env[key]) {
      savedEnvs[key] = process.env[key];
      process.env[key] = defaultValue;
    }
  }
  // Ensure DATABASE_URL is empty so services create a null pool
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = '';
  }
}

export function clearTestEnv(): void {
  for (const key of Object.keys(REQUIRED_KEYS)) {
    if (savedEnvs[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnvs[key];
    }
  }
  delete process.env.DATABASE_URL;
  savedEnvs = {};
}
