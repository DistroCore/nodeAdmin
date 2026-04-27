import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestEnv, createMockClient, createMockPool } from '../../__tests__/helpers';

setupTestEnv();

import { runtimeConfig } from '../../app/runtimeConfig';
import { OutboxPublisherService } from './outboxPublisherService';

function createOutboxRow(
  overrides?: Partial<{
    aggregate_id: string;
    created_at: Date;
    event_type: string;
    id: string;
    payload: string;
    retry_count: number;
    tenant_id: string;
  }>,
) {
  return {
    aggregate_id: 'conversation-1',
    created_at: new Date('2026-03-30T10:00:00.000Z'),
    event_type: 'im.message.sent',
    id: 'outbox-1',
    payload: '{"messageId":"message-1"}',
    retry_count: 0,
    tenant_id: 'tenant-1',
    ...overrides,
  };
}

describe('OutboxPublisherService', () => {
  let service: OutboxPublisherService;

  beforeEach(() => {
    service = new OutboxPublisherService();
    vi.restoreAllMocks();
  });

  it('publishes an outbox batch and marks rows as published', async () => {
    const client = createMockClient([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [createOutboxRow()] },
      { rowCount: 1, rows: [] },
      { rowCount: 0, rows: [] },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    const producer = {
      disconnect: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    assignInternals(service, { pool, producer });

    await invokePublishBatch(service);

    expect(producer.send).toHaveBeenCalledWith({
      messages: [
        {
          headers: {
            eventType: 'im.message.sent',
            outboxId: 'outbox-1',
            tenantId: 'tenant-1',
          },
          key: 'conversation-1',
          value: '{"messageId":"message-1"}',
        },
      ],
      topic: runtimeConfig.kafka.topic,
    });
    expect(client.calls.some((call) => call.sql.includes('SET published_at = NOW()'))).toBe(true);
    expect(client.calls.some((call) => call.sql === 'COMMIT')).toBe(true);
    expect(client.release).toHaveBeenCalledWith();
  });

  it('sends exhausted messages to the DLQ and records dlq metadata', async () => {
    const originalMaxRetry = runtimeConfig.outbox.maxRetry;
    runtimeConfig.outbox.maxRetry = 3;

    const client = createMockClient([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [createOutboxRow({ id: 'outbox-2', retry_count: 2 })] },
      { rowCount: 1, rows: [] },
      { rowCount: 0, rows: [] },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    const producer = {
      disconnect: vi.fn(),
      send: vi.fn().mockRejectedValueOnce(new Error('primary topic failed')).mockResolvedValueOnce(undefined),
    };

    assignInternals(service, { pool, producer });

    try {
      await invokePublishBatch(service);
    } finally {
      runtimeConfig.outbox.maxRetry = originalMaxRetry;
    }

    expect(producer.send).toHaveBeenNthCalledWith(1, {
      messages: [
        {
          headers: {
            eventType: 'im.message.sent',
            outboxId: 'outbox-2',
            tenantId: 'tenant-1',
          },
          key: 'conversation-1',
          value: '{"messageId":"message-1"}',
        },
      ],
      topic: runtimeConfig.kafka.topic,
    });
    expect(producer.send).toHaveBeenNthCalledWith(2, {
      messages: [
        {
          headers: {
            eventType: 'im.message.sent',
            outboxId: 'outbox-2',
            sourceTopic: runtimeConfig.kafka.topic,
            tenantId: 'tenant-1',
          },
          key: 'conversation-1',
          value: '{"messageId":"message-1"}',
        },
      ],
      topic: runtimeConfig.kafka.dlqTopic,
    });
    expect(client.calls.some((call) => call.sql.includes('SET dlq_at = NOW()'))).toBe(true);
    expect(client.release).toHaveBeenCalledWith();
  });

  it('disconnects kafka and database resources on module destroy', async () => {
    const producer = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
    };
    const pool = {
      end: vi.fn().mockResolvedValue(undefined),
    };
    const intervalHandle = setInterval(() => undefined, 60_000);

    assignInternals(service, { intervalHandle, pool, producer });

    await service.onModuleDestroy();

    expect(producer.disconnect).toHaveBeenCalledWith();
    expect(pool.end).not.toHaveBeenCalled();
  });

  it('increments retry_count when Kafka is unavailable but max retry is not reached', async () => {
    const originalMaxRetry = runtimeConfig.outbox.maxRetry;
    runtimeConfig.outbox.maxRetry = 5;

    const client = createMockClient([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [createOutboxRow({ retry_count: 1 })] },
      { rowCount: 1, rows: [] },
      { rowCount: 0, rows: [] },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    const producer = {
      disconnect: vi.fn(),
      send: vi.fn().mockRejectedValue(new Error('kafka unavailable')),
    };

    assignInternals(service, { pool, producer });

    try {
      await invokePublishBatch(service);
    } finally {
      runtimeConfig.outbox.maxRetry = originalMaxRetry;
    }

    expect(producer.send).toHaveBeenCalledTimes(1);
    expect(
      client.calls.some(
        (call) =>
          call.sql.includes('SET retry_count = $2') &&
          call.params[1] === 2 &&
          call.params[2] === 'Error: kafka unavailable',
      ),
    ).toBe(true);
  });

  it('truncates oversized error messages when storing retry metadata', async () => {
    const originalMaxRetry = runtimeConfig.outbox.maxRetry;
    runtimeConfig.outbox.maxRetry = 5;

    const hugeError = new Error('x'.repeat(4000));
    const client = createMockClient([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [createOutboxRow({ id: 'outbox-3' })] },
      { rowCount: 1, rows: [] },
      { rowCount: 0, rows: [] },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    const producer = {
      disconnect: vi.fn(),
      send: vi.fn().mockRejectedValue(hugeError),
    };

    assignInternals(service, { pool, producer });

    try {
      await invokePublishBatch(service);
    } finally {
      runtimeConfig.outbox.maxRetry = originalMaxRetry;
    }

    const retryUpdate = client.calls.find((call) => call.sql.includes('SET retry_count = $2'));
    expect(retryUpdate).toBeDefined();
    expect(typeof retryUpdate?.params[2]).toBe('string');
    expect((retryUpdate?.params[2] as string).length).toBe(2000);
  });

  it('records the DLQ publish error when both primary topic and DLQ publish fail', async () => {
    const originalMaxRetry = runtimeConfig.outbox.maxRetry;
    runtimeConfig.outbox.maxRetry = 1;

    const client = createMockClient([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [createOutboxRow({ id: 'outbox-4' })] },
      { rowCount: 1, rows: [] },
      { rowCount: 0, rows: [] },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    const producer = {
      disconnect: vi.fn(),
      send: vi.fn().mockRejectedValueOnce(new Error('primary down')).mockRejectedValueOnce(new Error('dlq down')),
    };

    assignInternals(service, { pool, producer });

    try {
      await invokePublishBatch(service);
    } finally {
      runtimeConfig.outbox.maxRetry = originalMaxRetry;
    }

    expect(producer.send).toHaveBeenCalledTimes(2);
    expect(
      client.calls.some(
        (call) =>
          call.sql.includes('SET retry_count = $2') && call.params[1] === 1 && call.params[2] === 'Error: dlq down',
      ),
    ).toBe(true);
  });

  it('skips concurrent publish attempts while a batch is already in progress', async () => {
    const connectDeferred = createDeferred<ReturnType<typeof createMockClient>>();
    const client = createMockClient([
      { rowCount: 0, rows: [] },
      { rowCount: 0, rows: [] },
      { rowCount: 0, rows: [] },
    ]);
    const pool = createMockPool();
    pool.connect = vi.fn(async () => connectDeferred.promise);
    const producer = {
      disconnect: vi.fn(),
      send: vi.fn(),
    };

    assignInternals(service, { pool, producer });

    const firstPublish = invokePublishBatch(service);
    const secondPublish = invokePublishBatch(service);
    connectDeferred.resolve(client);

    await Promise.all([firstPublish, secondPublish]);

    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  it('resets the publishing flag when pool.connect fails before a client is acquired', async () => {
    const pool = createMockPool();
    pool.connect = vi.fn().mockRejectedValue(new Error('connect failed'));
    const producer = {
      disconnect: vi.fn(),
      send: vi.fn(),
    };

    assignInternals(service, { pool, producer });

    await invokePublishBatch(service);

    expect(readIsPublishing(service)).toBe(false);
  });
});

function assignInternals(
  service: OutboxPublisherService,
  values: {
    intervalHandle?: NodeJS.Timeout | null;
    pool?: { connect?: () => Promise<unknown>; end?: () => Promise<void> } | null;
    producer?: {
      disconnect: () => Promise<void>;
      send: (...args: unknown[]) => Promise<unknown>;
    } | null;
  },
): void {
  const target = service as unknown as {
    intervalHandle: NodeJS.Timeout | null;
    pool: typeof values.pool;
    producer: typeof values.producer;
  };

  if ('intervalHandle' in values) {
    target.intervalHandle = values.intervalHandle ?? null;
  }
  if ('pool' in values) {
    target.pool = values.pool ?? null;
  }
  if ('producer' in values) {
    target.producer = values.producer ?? null;
  }
}

async function invokePublishBatch(service: OutboxPublisherService): Promise<void> {
  await (
    service as unknown as {
      publishBatch: () => Promise<void>;
    }
  ).publishBatch();
}

function readIsPublishing(service: OutboxPublisherService): boolean {
  return (
    service as unknown as {
      isPublishing: boolean;
    }
  ).isPublishing;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}
