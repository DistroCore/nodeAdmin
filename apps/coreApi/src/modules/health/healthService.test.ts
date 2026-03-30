import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

const healthMocks = vi.hoisted(() => {
  const redisClient = {
    connect: vi.fn(),
    ping: vi.fn(),
    quit: vi.fn(),
  };
  const createRedisClient = vi.fn(() => redisClient);

  const kafkaAdmin = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    listTopics: vi.fn(),
  };
  const kafkaAdminFactory = vi.fn(() => kafkaAdmin);
  const kafkaCtor = vi.fn(function kafkaConstructor() {
    return {
      admin: kafkaAdminFactory,
    };
  });

  return {
    createRedisClient,
    kafkaAdmin,
    kafkaCtor,
    redisClient,
  };
});

vi.mock('redis', () => ({
  createClient: healthMocks.createRedisClient,
}));

vi.mock('kafkajs', () => ({
  Kafka: healthMocks.kafkaCtor,
}));

import { runtimeConfig } from '../../app/runtimeConfig';
import { HealthService } from './healthService';

describe('HealthService', () => {
  const originalRedisUrl = runtimeConfig.redis.url;
  const originalKafkaBrokers = [...runtimeConfig.kafka.brokers];
  const originalKafkaClientId = runtimeConfig.kafka.clientId;

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeConfig.redis.url = 'redis://localhost:6379';
    runtimeConfig.kafka.brokers = ['kafka:9092'];
    runtimeConfig.kafka.clientId = 'coreApi';

    healthMocks.redisClient.connect.mockResolvedValue(undefined);
    healthMocks.redisClient.ping.mockResolvedValue('PONG');
    healthMocks.redisClient.quit.mockResolvedValue('OK');
    healthMocks.kafkaAdmin.connect.mockResolvedValue(undefined);
    healthMocks.kafkaAdmin.listTopics.mockResolvedValue(['im.events']);
    healthMocks.kafkaAdmin.disconnect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    runtimeConfig.redis.url = originalRedisUrl;
    runtimeConfig.kafka.brokers = [...originalKafkaBrokers];
    runtimeConfig.kafka.clientId = originalKafkaClientId;
  });

  it('returns ok when database, redis, and kafka are all healthy', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const databaseService = {
      drizzle: {
        execute,
      },
    };
    const service = new HealthService(databaseService as never);

    const result = await service.getHealth();

    expect(execute).toHaveBeenCalledTimes(1);
    const statement = execute.mock.calls[0]?.[0] as { getSQL?: () => unknown } | undefined;
    expect(statement?.getSQL).toBeTypeOf('function');
    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('ok');
    expect(result.checks.redis.status).toBe('ok');
    expect(result.checks.kafka.status).toBe('ok');
  });

  it('returns degraded when optional infrastructure is not configured', async () => {
    runtimeConfig.redis.url = null;
    runtimeConfig.kafka.brokers = [];

    const databaseService = {
      drizzle: {
        execute: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      },
    };
    const service = new HealthService(databaseService as never);

    const result = await service.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.status).toBe('ok');
    expect(result.checks.redis.status).toBe('degraded');
    expect(result.checks.kafka.status).toBe('degraded');
  });

  it('returns error when the database check fails', async () => {
    const databaseService = {
      drizzle: {
        execute: vi.fn().mockRejectedValue(new Error('database unavailable')),
      },
    };
    const service = new HealthService(databaseService as never);

    const result = await service.getHealth();

    expect(result.status).toBe('error');
    expect(result.checks.database.status).toBe('error');
    expect(result.checks.database.message).toContain('database unavailable');
  });
});
