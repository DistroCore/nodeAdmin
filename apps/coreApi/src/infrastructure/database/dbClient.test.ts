import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  Pool: vi.fn(),
  drizzle: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: mocks.Pool,
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: mocks.drizzle,
}));

import * as schema from './schema';
import { createDbClient } from './dbClient';

describe('createDbClient', () => {
  beforeEach(() => {
    mocks.Pool.mockReset();
    mocks.drizzle.mockReset();
  });

  it('creates a bounded PostgreSQL pool and exposes it through Drizzle', () => {
    const pool = { end: vi.fn() };
    const drizzleClient = { $client: pool };
    mocks.Pool.mockImplementation(function PoolMock() {
      return pool;
    });
    mocks.drizzle.mockReturnValue(drizzleClient);

    const result = createDbClient('postgres://localhost/nodeadmin');

    expect(mocks.Pool).toHaveBeenCalledWith({
      connectionString: 'postgres://localhost/nodeadmin',
      max: 20,
    });
    expect(mocks.drizzle).toHaveBeenCalledWith(pool, { schema });
    expect(result).toBe(drizzleClient);
  });
});
