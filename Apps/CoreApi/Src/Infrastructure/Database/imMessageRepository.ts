import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import {
  AppendResult,
  InMemoryMessageStore,
  MessageMetadata,
  PendingMessage,
  StoredMessage,
} from '../inMemoryMessageStore';

type MessageRow = {
  content: string;
  conversation_id: string;
  created_at: Date;
  message_id: string;
  message_type: string;
  metadata_json: string | null;
  sequence_id: number;
  tenant_id: string;
  trace_id: string;
  user_id: string;
};

@Injectable()
export class ImMessageRepository implements OnModuleDestroy {
  private readonly logger = new Logger(ImMessageRepository.name);

  private readonly databaseUrl = process.env.DATABASE_URL?.trim();
  private readonly pool: Pool | null;

  constructor(private readonly inMemoryStore: InMemoryMessageStore) {
    if (!this.databaseUrl) {
      this.pool = null;
      this.logger.warn('DATABASE_URL is not set. IM repository will use in-memory storage.');
      return;
    }

    this.pool = new Pool({
      connectionString: this.databaseUrl,
      max: 20,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.end();
  }

  async append(message: PendingMessage): Promise<AppendResult> {
    if (!this.pool) {
      return this.inMemoryStore.append(message);
    }

    return this.runWithTenant(message.tenantId, async (client) => {
      await client.query(
        `
          INSERT INTO conversations (tenant_id, id)
          VALUES ($1, $2)
          ON CONFLICT (tenant_id, id) DO NOTHING;
        `,
        [message.tenantId, message.conversationId],
      );

      await client.query(
        `
          SELECT id
          FROM conversations
          WHERE tenant_id = $1
            AND id = $2
          FOR UPDATE;
        `,
        [message.tenantId, message.conversationId],
      );

      const duplicateResult = await client.query<MessageRow>(
        `
          SELECT content,
                 conversation_id,
                 created_at,
                 message_id,
                 message_type,
                 metadata_json,
                 sequence_id,
                 tenant_id,
                 trace_id,
                 user_id
          FROM messages
          WHERE tenant_id = $1
            AND message_id = $2
          LIMIT 1;
        `,
        [message.tenantId, message.messageId],
      );

      if (duplicateResult.rowCount && duplicateResult.rowCount > 0) {
        return {
          duplicate: true,
          message: this.toStoredMessage(duplicateResult.rows[0]),
        };
      }

      const sequenceResult = await client.query<{ next_sequence: number }>(
        `
          SELECT COALESCE(MAX(sequence_id), 0) + 1 AS next_sequence
          FROM messages
          WHERE tenant_id = $1
            AND conversation_id = $2;
        `,
        [message.tenantId, message.conversationId],
      );
      const nextSequence = Number(sequenceResult.rows[0]?.next_sequence ?? 1);
      const metadataJson = message.metadata ? JSON.stringify(message.metadata) : null;
      const messageType = message.messageType ?? 'text';

      const insertResult = await client.query<MessageRow>(
        `
          INSERT INTO messages (
            tenant_id,
            conversation_id,
            message_id,
            sequence_id,
            user_id,
            trace_id,
            content,
            message_type,
            metadata_json,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING content,
                    conversation_id,
                    created_at,
                    message_id,
                    message_type,
                    metadata_json,
                    sequence_id,
                    tenant_id,
                    trace_id,
                    user_id;
        `,
        [
          message.tenantId,
          message.conversationId,
          message.messageId,
          nextSequence,
          message.userId,
          message.traceId,
          message.content,
          messageType,
          metadataJson,
          message.createdAt,
        ],
      );

      const storedMessage = this.toStoredMessage(insertResult.rows[0]);

      await client.query(
        `
          INSERT INTO outbox_events (id, tenant_id, aggregate_id, event_type, payload)
          VALUES ($1, $2, $3, $4, $5);
        `,
        [
          randomUUID(),
          storedMessage.tenantId,
          storedMessage.conversationId,
          'im.message.sent',
          JSON.stringify(storedMessage),
        ],
      );

      return {
        duplicate: false,
        message: storedMessage,
      };
    });
  }

  async getLatest(tenantId: string, conversationId: string, limit: number): Promise<StoredMessage[]> {
    if (!this.pool) {
      return this.inMemoryStore.getLatest(tenantId, conversationId, limit);
    }

    return this.runWithTenant(tenantId, async (client) => {
      const result = await client.query<MessageRow>(
        `
          SELECT content,
                 conversation_id,
                 created_at,
                 message_id,
                 message_type,
                 metadata_json,
                 sequence_id,
                 tenant_id,
                 trace_id,
                 user_id
          FROM messages
          WHERE tenant_id = $1
            AND conversation_id = $2
          ORDER BY sequence_id DESC
          LIMIT $3;
        `,
        [tenantId, conversationId, limit],
      );

      return result.rows.map((row) => this.toStoredMessage(row)).reverse();
    });
  }

  private async runWithTenant<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database pool is not initialized.');
    }

    const client = await this.pool.connect();
    await client.query('BEGIN');

    try {
      await client.query(`SELECT set_config('app.current_tenant', $1, true);`, [tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private toStoredMessage(row: MessageRow): StoredMessage {
    return {
      content: row.content,
      conversationId: row.conversation_id,
      createdAt: row.created_at.toISOString(),
      messageId: row.message_id,
      messageType: this.normalizeMessageType(row.message_type),
      metadata: this.parseMetadata(row.metadata_json),
      sequenceId: Number(row.sequence_id),
      tenantId: row.tenant_id,
      traceId: row.trace_id,
      userId: row.user_id,
    };
  }

  private normalizeMessageType(rawType: string): StoredMessage['messageType'] {
    if (rawType === 'file' || rawType === 'image' || rawType === 'system') {
      return rawType;
    }

    return 'text';
  }

  private parseMetadata(metadataJson: string | null): MessageMetadata | null {
    if (!metadataJson) {
      return null;
    }

    try {
      const parsed = JSON.parse(metadataJson) as MessageMetadata;
      return typeof parsed === 'object' && parsed ? parsed : null;
    } catch {
      this.logger.warn('Invalid message metadata_json encountered. Returning null metadata.');
      return null;
    }
  }
}
