import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { Pool } from 'pg';
import { runtimeConfig } from '../../App/runtimeConfig';

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

  private intervalHandle: NodeJS.Timeout | null = null;
  private isPublishing = false;
  private pool: Pool | null = null;
  private producer: Producer | null = null;

  async onModuleInit(): Promise<void> {
    if (!runtimeConfig.outbox.enabled) {
      return;
    }

    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.logger.warn('Outbox publisher enabled but DATABASE_URL is missing.');
      return;
    }

    if (runtimeConfig.kafka.brokers.length === 0) {
      this.logger.warn('Outbox publisher enabled but KAFKA_BROKERS is empty.');
      return;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
    });

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

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private async publishBatch(): Promise<void> {
    if (this.isPublishing || !this.pool || !this.producer) {
      return;
    }

    this.isPublishing = true;

    const client = await this.pool.connect();

    try {
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
          const serializedError = String(publishError);

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
                [row.id, serializedError.slice(0, 2000), nextRetry],
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
                [row.id, nextRetry, String(dlqError).slice(0, 2000)],
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
            [row.id, nextRetry, serializedError.slice(0, 2000)],
          );
        }
      }

      await client.query('COMMIT');

      if (publishedCount > 0 || dlqCount > 0) {
        this.logger.log(`Outbox batch complete published=${publishedCount} dlq=${dlqCount}`);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Outbox publish batch failed: ${String(error)}`);
    } finally {
      client.release();
      this.isPublishing = false;
    }
  }
}
