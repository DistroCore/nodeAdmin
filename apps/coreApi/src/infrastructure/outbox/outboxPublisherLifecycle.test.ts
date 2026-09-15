import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockClient, createMockPool, setupTestEnv } from '../../__tests__/helpers';

const kafkaMocks = vi.hoisted(() => ({
  Kafka: vi.fn(),
}));

vi.mock('kafkajs', () => ({
  Kafka: kafkaMocks.Kafka,
}));

setupTestEnv();

import { runtimeConfig } from '../../app/runtimeConfig';
import { OutboxPublisherService } from './outboxPublisherService';

const originalConfig = {
  brokers: [...runtimeConfig.kafka.brokers],
  cleanupIntervalMs: runtimeConfig.outbox.cleanupIntervalMs,
  enabled: runtimeConfig.outbox.enabled,
  pollIntervalMs: runtimeConfig.outbox.pollIntervalMs,
  retentionDays: runtimeConfig.outbox.retentionDays,
};

interface ProducerMock {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

describe('OutboxPublisherService lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    kafkaMocks.Kafka.mockReset();
    runtimeConfig.kafka.brokers = ['kafka:9092'];
    runtimeConfig.outbox.cleanupIntervalMs = 60_000;
    runtimeConfig.outbox.enabled = true;
    runtimeConfig.outbox.pollIntervalMs = 1_000;
    runtimeConfig.outbox.retentionDays = 7;
  });

  afterEach(() => {
    runtimeConfig.kafka.brokers = [...originalConfig.brokers];
    runtimeConfig.outbox.cleanupIntervalMs = originalConfig.cleanupIntervalMs;
    runtimeConfig.outbox.enabled = originalConfig.enabled;
    runtimeConfig.outbox.pollIntervalMs = originalConfig.pollIntervalMs;
    runtimeConfig.outbox.retentionDays = originalConfig.retentionDays;
    vi.useRealTimers();
  });

  it('does not initialize Kafka when the publisher is disabled', async () => {
    runtimeConfig.outbox.enabled = false;
    const service = new OutboxPublisherService();

    await service.onModuleInit();

    expect(kafkaMocks.Kafka).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails initialization without a dedicated database pool', async () => {
    const service = new OutboxPublisherService();

    await expect(service.onModuleInit()).rejects.toThrow('OUTBOX_DATABASE_URL is required');

    expect(kafkaMocks.Kafka).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not initialize Kafka when no brokers are configured', async () => {
    runtimeConfig.kafka.brokers = [];
    const service = createService(createMockPool());

    await expect(service.onModuleInit()).rejects.toThrow('KAFKA_BROKERS is required');

    expect(kafkaMocks.Kafka).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('connects, publishes immediately, polls, and releases lifecycle timers on destroy', async () => {
    const client = createMockClient();
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    const producer = createProducer();
    installProducer(producer);
    const service = createService(pool);

    await service.onModuleInit();

    expect(kafkaMocks.Kafka).toHaveBeenCalledWith({
      brokers: ['kafka:9092'],
      clientId: runtimeConfig.kafka.clientId,
    });
    expect(producer.connect).toHaveBeenCalledTimes(1);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(2);

    await vi.advanceTimersByTimeAsync(runtimeConfig.outbox.pollIntervalMs);
    expect(pool.connect).toHaveBeenCalledTimes(2);

    await service.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(producer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('runs the scheduled retention cleanup callback', async () => {
    runtimeConfig.outbox.cleanupIntervalMs = 1_000;
    runtimeConfig.outbox.pollIntervalMs = 60_000;
    const client = createMockClient();
    const pool = createMockPool();
    pool.connect = vi.fn(async () => client);
    const producer = createProducer();
    installProducer(producer);
    const service = createService(pool);

    await service.onModuleInit();
    await vi.advanceTimersByTimeAsync(runtimeConfig.outbox.cleanupIntervalMs);

    expect(client.calls.some((call) => call.sql.includes('DELETE FROM outbox_events'))).toBe(true);
    await service.onModuleDestroy();
  });

  it('omits the cleanup timer when retention is disabled', async () => {
    runtimeConfig.outbox.retentionDays = 0;
    const pool = createMockPool();
    const producer = createProducer();
    installProducer(producer);
    const service = createService(pool);

    await service.onModuleInit();

    expect(vi.getTimerCount()).toBe(1);
    await service.onModuleDestroy();
  });

  it('disconnects a producer that fails to initialize without leaving timers behind', async () => {
    const producer = createProducer();
    producer.connect.mockRejectedValue(new Error('broker unavailable'));
    installProducer(producer);
    const service = createService(createMockPool());

    await expect(service.onModuleInit()).rejects.toThrow('broker unavailable');

    expect(producer.disconnect).toHaveBeenCalledTimes(1);
    expect(readProducer(service)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function createProducer(): ProducerMock {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
  };
}

function installProducer(producer: ProducerMock): void {
  kafkaMocks.Kafka.mockImplementation(function KafkaMock() {
    return {
      producer: vi.fn(() => producer),
    };
  });
}

function createService(pool: ReturnType<typeof createMockPool>): OutboxPublisherService {
  return new OutboxPublisherService({
    assertSafeRole: vi.fn().mockResolvedValue(undefined),
    pool,
  } as never);
}

function readProducer(service: OutboxPublisherService): unknown {
  return (service as unknown as { producer: unknown }).producer;
}
