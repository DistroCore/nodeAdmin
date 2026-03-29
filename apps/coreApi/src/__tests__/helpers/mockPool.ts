import { vi } from 'vitest';

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  calls: Array<{ sql: string; params: unknown[] }>;
}

export interface MockPool {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock pg PoolClient for transaction testing.
 * Tracks all query calls including BEGIN/COMMIT/ROLLBACK.
 */
export function createMockClient(results?: QueryResult[]): MockClient {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const resultQueue = results ? [...results] : [];
  const defaultResult: QueryResult = { rows: [], rowCount: 0 };

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    const result = resultQueue.shift() ?? defaultResult;
    return result;
  });

  const release = vi.fn();

  return { query, release, calls };
}

/**
 * Create a mock pg Pool.
 * - .query() returns results in order from the provided array.
 * - .connect() returns a MockClient for transaction testing.
 */
export function createMockPool(
  poolResults?: QueryResult[],
  clientResults?: QueryResult[]
): MockPool {
  const poolResultQueue = poolResults ? [...poolResults] : [];
  const defaultResult: QueryResult = { rows: [], rowCount: 0 };

  const query = vi.fn(async () => {
    return poolResultQueue.shift() ?? defaultResult;
  });

  const mockClient = createMockClient(clientResults);

  const connect = vi.fn(async () => mockClient);

  return { query, connect };
}
