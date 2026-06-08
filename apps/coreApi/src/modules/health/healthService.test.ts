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
    expect(result.checks.database.message).toBe('Database check failed.');
  });

  it('returns error when drizzle is unavailable even if optional dependencies are healthy', async () => {
    const service = new HealthService({ drizzle: null } as never);

    const result = await service.getHealth();

    expect(result.status).toBe('error');
    expect(result.checks.database).toEqual({
      message: 'DATABASE_URL is not configured.',
      status: 'error',
    });
    expect(result.checks.redis.status).toBe('ok');
    expect(result.checks.kafka.status).toBe('ok');
  });

  it('returns degraded when Redis ping fails and still attempts to quit the client', async () => {
    healthMocks.redisClient.ping.mockRejectedValue(new Error('redis timeout'));
    const databaseService = {
      drizzle: {
        execute: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      },
    };
    const service = new HealthService(databaseService as never);

    const result = await service.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.checks.redis.status).toBe('degraded');
    expect(result.checks.redis.message).toBe('Redis check failed.');
    expect(healthMocks.redisClient.quit).toHaveBeenCalledWith();
  });

  it('swallows Redis quit errors after a successful health check', async () => {
    healthMocks.redisClient.quit.mockRejectedValue(new Error('quit failed'));
    const databaseService = {
      drizzle: {
        execute: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      },
    };
    const service = new HealthService(databaseService as never);

    await expect(service.getHealth()).resolves.toMatchObject({
      checks: {
        redis: {
          status: 'ok',
        },
      },
      status: 'ok',
    });
  });

  it('returns degraded when Kafka listing topics fails and still disconnects the admin client', async () => {
    healthMocks.kafkaAdmin.listTopics.mockRejectedValue(new Error('broker unavailable'));
    const databaseService = {
      drizzle: {
        execute: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      },
    };
    const service = new HealthService(databaseService as never);

    const result = await service.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.checks.kafka.status).toBe('degraded');
    expect(result.checks.kafka.message).toBe('Kafka check failed.');
    expect(healthMocks.kafkaAdmin.disconnect).toHaveBeenCalledWith();
  });

  it('swallows Kafka disconnect errors after a failed Kafka health check', async () => {
    healthMocks.kafkaAdmin.listTopics.mockRejectedValue(new Error('broker unavailable'));
    healthMocks.kafkaAdmin.disconnect.mockRejectedValue(new Error('disconnect failed'));
    const databaseService = {
      drizzle: {
        execute: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      },
    };
    const service = new HealthService(databaseService as never);

    await expect(service.getHealth()).resolves.toMatchObject({
      checks: {
        kafka: {
          status: 'degraded',
        },
      },
      status: 'degraded',
    });
  });

  it('includes service metadata in the health payload', async () => {
    const databaseService = {
      drizzle: {
        execute: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      },
    };
    const service = new HealthService(databaseService as never);

    const result = await service.getHealth();

    expect(result.service).toBe('coreApi');
    expect(result.version).toBeTypeOf('string');
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
