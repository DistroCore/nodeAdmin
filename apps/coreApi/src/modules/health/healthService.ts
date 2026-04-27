import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Kafka } from 'kafkajs';
import { createClient } from 'redis';
import { runtimeConfig } from '../../app/runtimeConfig';
import { DatabaseService } from '../../infrastructure/database/databaseService';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../../package.json');

export type HealthStatus = 'ok' | 'degraded' | 'error';

export interface HealthCheckResult {
  message: string;
  status: HealthStatus;
}

export interface HealthResponse {
  checks: {
    database: HealthCheckResult;
    kafka: HealthCheckResult;
    redis: HealthCheckResult;
  };
  service: string;
  status: HealthStatus;
  timestamp: string;
  version: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getHealth(): Promise<HealthResponse> {
    const [database, redis, kafka] = await Promise.all([this.checkDatabase(), this.checkRedis(), this.checkKafka()]);

    return {
      checks: {
        database,
        kafka,
        redis,
      },
      service: 'coreApi',
      status: this.resolveCompositeStatus(database, redis, kafka),
      timestamp: new Date().toISOString(),
      version: pkg.version,
    };
  }

  private resolveCompositeStatus(
    database: HealthCheckResult,
    redis: HealthCheckResult,
    kafka: HealthCheckResult,
  ): HealthStatus {
    if (database.status === 'error') {
      return 'error';
    }

    if (redis.status !== 'ok' || kafka.status !== 'ok') {
      return 'degraded';
    }

    return 'ok';
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    const drizzle = this.databaseService.drizzle;

    if (!drizzle) {
      return {
        message: 'DATABASE_URL is not configured.',
        status: 'error',
      };
    }

    try {
      await drizzle.execute(sql`SELECT 1`);

      return {
        message: 'Database reachable.',
        status: 'ok',
      };
    } catch (error) {
      return {
        message: `Database check failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'error',
      };
    }
  }

  private async checkRedis(): Promise<HealthCheckResult> {
    if (!runtimeConfig.redis.url) {
      return {
        message: 'Redis is not configured.',
        status: 'degraded',
      };
    }

    const client = createClient({
      socket: {
        connectTimeout: runtimeConfig.redis.connectTimeout,
      },
      url: runtimeConfig.redis.url,
    });

    try {
      await client.connect();
      await client.ping();

      return {
        message: 'Redis reachable.',
        status: 'ok',
      };
    } catch (error) {
      return {
        message: `Redis check failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'degraded',
      };
    } finally {
      await client.quit().catch(() => undefined);
    }
  }

  private async checkKafka(): Promise<HealthCheckResult> {
    if (runtimeConfig.kafka.brokers.length === 0) {
      return {
        message: 'Kafka is not configured.',
        status: 'degraded',
      };
    }

    const admin = new Kafka({
      brokers: runtimeConfig.kafka.brokers,
      clientId: `${runtimeConfig.kafka.clientId}-health`,
    }).admin();

    try {
      await admin.connect();
      await admin.listTopics();

      return {
        message: 'Kafka reachable.',
        status: 'ok',
      };
    } catch (error) {
      return {
        message: `Kafka check failed: ${error instanceof Error ? error.message : String(error)}`,
        status: 'degraded',
      };
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }
}
