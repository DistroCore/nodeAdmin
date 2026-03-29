/**
 * Vitest global setup — sets required env vars before any test module loads.
 * runtimeConfig.ts reads env vars at import time, so they must be set
 * before the module graph is evaluated.
 */

export function setup() {
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret-key';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key';
  process.env.FRONTEND_ORIGINS = process.env.FRONTEND_ORIGINS || 'http://localhost:3000';
  process.env.DATABASE_URL = ''; // empty = services create null pool
}

export function teardown() {
  // no-op
}
