import 'reflect-metadata';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { HealthController } from './healthController';
import { HealthService } from './healthService';

function createMockHealthService() {
  return {
    getHealth: vi.fn(),
  };
}

describe('HealthController', () => {
  const httpTestTimeoutMs = 15_000;
  let controller: HealthController;
  let healthService: ReturnType<typeof createMockHealthService>;
  let app: NestFastifyApplication | null;

  beforeEach(() => {
    healthService = createMockHealthService();
    controller = new HealthController(healthService as never);
    app = null;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  it('delegates health responses to HealthService', async () => {
    healthService.getHealth.mockResolvedValue({
      checks: {
        database: { message: 'Database reachable.', status: 'ok' },
        kafka: { message: 'Kafka reachable.', status: 'ok' },
        redis: { message: 'Redis reachable.', status: 'ok' },
      },
      service: 'coreApi',
      status: 'ok',
      timestamp: '2026-03-30T10:00:00.000Z',
      version: '0.1.0',
    });

    const result = await controller.getHealth();

    expect(healthService.getHealth).toHaveBeenCalledWith();
    expect(result.status).toBe('ok');
  });

  it(
    'serves /api/v1/health with status ok when the health service reports healthy dependencies',
    async () => {
      healthService.getHealth.mockResolvedValue({
        checks: {
          database: { message: 'Database reachable.', status: 'ok' },
          kafka: { message: 'Kafka reachable.', status: 'ok' },
          redis: { message: 'Redis reachable.', status: 'ok' },
        },
        service: 'coreApi',
        status: 'ok',
        timestamp: '2026-03-30T10:00:00.000Z',
        version: '0.1.0',
      });

      @Module({
        controllers: [HealthController],
        providers: [
          {
            provide: HealthService,
            useValue: healthService,
          },
        ],
      })
      class TestHealthModule {}

      app = await NestFactory.create<NestFastifyApplication>(TestHealthModule, new FastifyAdapter());
      app.setGlobalPrefix('api/v1');
      await app.init();

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        checks: {
          database: { message: 'Database reachable.', status: 'ok' },
          kafka: { message: 'Kafka reachable.', status: 'ok' },
          redis: { message: 'Redis reachable.', status: 'ok' },
        },
        service: 'coreApi',
        status: 'ok',
        timestamp: '2026-03-30T10:00:00.000Z',
        version: '0.1.0',
      });
    },
    httpTestTimeoutMs,
  );

  it('returns degraded payloads without rewriting the service response', async () => {
    healthService.getHealth.mockResolvedValue({
      checks: {
        database: { message: 'Database reachable.', status: 'ok' },
        kafka: { message: 'Kafka is not configured.', status: 'degraded' },
        redis: { message: 'Redis is not configured.', status: 'degraded' },
      },
      service: 'coreApi',
      status: 'degraded',
      timestamp: '2026-03-31T01:00:00.000Z',
      version: '0.1.0',
    });

    const result = await controller.getHealth();

    expect(result.status).toBe('degraded');
    expect(result.checks.kafka.message).toContain('not configured');
  });

  it('propagates service errors to the caller', async () => {
    healthService.getHealth.mockRejectedValue(new Error('health unavailable'));

    await expect(controller.getHealth()).rejects.toThrow('health unavailable');
  });

  it(
    'serves degraded responses over HTTP when optional dependencies are unavailable',
    async () => {
      healthService.getHealth.mockResolvedValue({
        checks: {
          database: { message: 'Database reachable.', status: 'ok' },
          kafka: { message: 'Kafka check failed: timeout', status: 'degraded' },
          redis: { message: 'Redis reachable.', status: 'ok' },
        },
        service: 'coreApi',
        status: 'degraded',
        timestamp: '2026-03-31T01:00:00.000Z',
        version: '0.1.0',
      });

      @Module({
        controllers: [HealthController],
        providers: [
          {
            provide: HealthService,
            useValue: healthService,
          },
        ],
      })
      class TestHealthModule {}

      app = await NestFactory.create<NestFastifyApplication>(TestHealthModule, new FastifyAdapter());
      app.setGlobalPrefix('api/v1');
      await app.init();

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('degraded');
    },
    httpTestTimeoutMs,
  );
});
