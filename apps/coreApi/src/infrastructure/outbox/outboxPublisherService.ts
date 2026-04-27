import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { Pool, type PoolClient } from 'pg';
import { runtimeConfig } from '../../app/runtimeConfig';
import { DatabaseService } from '../database/databaseService';

interface OutboxRow {
  aggregate_id: string;
  created_at: Date;
  event_type: string;
  id: string;
  payload: string;
  retry_count: number;
  tenant_id: string;
}

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private static readonly maxErrorLength = 2000;

  private intervalHandle: NodeJS.Timeout | null = null;
  private isPublishing = false;
  private readonly pool: Pool | null;
  private producer: Producer | null = null;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService = new DatabaseService()) {
    this.pool = (databaseService.drizzle?.$client as Pool | undefined) ?? null;
  }

  async onModuleInit(): Promise<void> {
    if (!runtimeConfig.outbox.enabled) {
      return;
    }

    if (!this.pool) {
      this.logger.warn('Outbox publisher enabled but DATABASE_URL is missing.');
      return;
    }

    if (runtimeConfig.kafka.brokers.length === 0) {
      this.logger.warn('Outbox publisher enabled but KAFKA_BROKERS is empty.');
      return;
    }

    try {
      const kafka = new Kafka({
        brokers: runtimeConfig.kafka.brokers,
        clientId: runtimeConfig.kafka.clientId,
      });
      this.producer = kafka.producer();
      await this.producer.connect();

      await this.publishBatch();

      this.intervalHandle = setInterval(() => {
        void this.publishBatch();
      }, runtimeConfig.outbox.pollIntervalMs);

      this.logger.log(
        `Outbox publisher enabled interval=${runtimeConfig.outbox.pollIntervalMs}ms batchSize=${runtimeConfig.outbox.batchSize} topic=${runtimeConfig.kafka.topic} dlq=${runtimeConfig.kafka.dlqTopic}.`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to initialize Outbox publisher. Service will continue without outbox functionality.',
        error,
      );
      // Clean up resources if initialization failed
      if (this.producer) {
        await this.producer.disconnect().catch(() => {});
        this.producer = null;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }

  private async publishBatch(): Promise<void> {
    if (this.isPublishing || !this.pool || !this.producer) {
      return;
    }

    this.isPublishing = true;
    let client: PoolClient | null = null;

    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      const picked = await client.query<OutboxRow>(
        `
          SELECT aggregate_id,
                 created_at,
                 event_type,
                 id,
                 payload,
                 retry_count,
                 tenant_id
          FROM outbox_events
          WHERE published_at IS NULL
            AND (dlq_at IS NULL)
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED;
        `,
        [runtimeConfig.outbox.batchSize],
      );

      if (!picked.rowCount) {
        await client.query('COMMIT');
        return;
      }

      let publishedCount = 0;
      let dlqCount = 0;

      for (const row of picked.rows) {
        const payload = row.payload;

        try {
          await this.producer.send({
            messages: [
              {
                headers: {
                  eventType: row.event_type,
                  outboxId: row.id,
                  tenantId: row.tenant_id,
                },
                // Partition key = aggregate_id (conversationId) to guarantee
                // per-conversation ordering within a Kafka partition.
                key: row.aggregate_id,
                value: payload,
              },
            ],
            topic: runtimeConfig.kafka.topic,
          });

          await client.query(
            `
              UPDATE outbox_events
              SET published_at = NOW(),
                  last_error = NULL
              WHERE id = $1;
            `,
            [row.id],
          );
          publishedCount += 1;
        } catch (publishError) {
          const nextRetry = row.retry_count + 1;
          const serializedError = this.truncateError(String(publishError));

          if (nextRetry >= runtimeConfig.outbox.maxRetry) {
            try {
              await this.producer.send({
                messages: [
                  {
                    headers: {
                      eventType: row.event_type,
                      outboxId: row.id,
                      sourceTopic: runtimeConfig.kafka.topic,
                      tenantId: row.tenant_id,
                    },
                    // Partition key = aggregate_id (conversationId) to guarantee
                    // per-conversation ordering within a Kafka partition.
                    key: row.aggregate_id,
                    value: payload,
                  },
                ],
                topic: runtimeConfig.kafka.dlqTopic,
              });

              await client.query(
                `
                  UPDATE outbox_events
                  SET dlq_at = NOW(),
                      last_error = $2,
                      retry_count = $3
                  WHERE id = $1;
                `,
                [row.id, serializedError, nextRetry],
              );
              dlqCount += 1;
              continue;
            } catch (dlqError) {
              await client.query(
                `
                  UPDATE outbox_events
                  SET retry_count = $2,
                      last_error = $3
                  WHERE id = $1;
                `,
                [row.id, nextRetry, this.truncateError(String(dlqError))],
              );
              continue;
            }
          }

          await client.query(
            `
              UPDATE outbox_events
              SET retry_count = $2,
                  last_error = $3
              WHERE id = $1;
            `,
            [row.id, nextRetry, serializedError],
          );
        }
      }

      await client.query('COMMIT');

      if (publishedCount > 0 || dlqCount > 0) {
        this.logger.log(`Outbox batch complete published=${publishedCount} dlq=${dlqCount}`);
      }
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      this.logger.error(`Outbox publish batch failed: ${String(error)}`);
    } finally {
      client?.release();
      this.isPublishing = false;
    }
  }

  private truncateError(error: string): string {
    return error.slice(0, OutboxPublisherService.maxErrorLength);
  }
}
