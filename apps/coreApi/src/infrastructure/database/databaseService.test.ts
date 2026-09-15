import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDbClient: vi.fn(),
}));

vi.mock('./dbClient', () => ({
  createDbClient: mocks.createDbClient,
}));

import { DatabaseService } from './databaseService';

const originalDatabaseUrl = process.env.DATABASE_URL;

describe('DatabaseService', () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    mocks.createDbClient.mockReset();
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('disables database access when DATABASE_URL is blank', () => {
    process.env.DATABASE_URL = '   ';

    const service = new DatabaseService();

    expect(service.drizzle).toBeNull();
    expect(mocks.createDbClient).not.toHaveBeenCalled();
  });

  it('creates the database client from a trimmed DATABASE_URL', () => {
    const drizzle = { $client: { end: vi.fn() } };
    process.env.DATABASE_URL = '  postgres://localhost/nodeadmin  ';
    mocks.createDbClient.mockReturnValue(drizzle);

    const service = new DatabaseService();

    expect(mocks.createDbClient).toHaveBeenCalledWith('postgres://localhost/nodeadmin');
    expect(service.drizzle).toBe(drizzle);
  });

  it('closes the pool once when the destroy hook runs repeatedly', async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    process.env.DATABASE_URL = 'postgres://localhost/nodeadmin';
    mocks.createDbClient.mockReturnValue({ $client: { end } });
    const service = new DatabaseService();

    await service.onModuleDestroy();
    await service.onModuleDestroy();

    expect(end).toHaveBeenCalledTimes(1);
  });

  it('ignores clients that do not expose a pool end method', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/nodeadmin';
    mocks.createDbClient.mockReturnValue({ $client: {} });
    const service = new DatabaseService();

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
