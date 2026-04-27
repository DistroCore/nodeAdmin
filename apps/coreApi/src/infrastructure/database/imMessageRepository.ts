import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { runtimeConfig } from '../../app/runtimeConfig';
import { DatabaseService } from './databaseService';
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
  deleted_at: Date | null;
  edited_at: Date | null;
  message_id: string;
  message_type: string;
  metadata_json: string | null;
  sequence_id: number;
  tenant_id: string;
  trace_id: string;
  user_id: string;
};

@Injectable()
export class ImMessageRepository {
  private readonly logger = new Logger(ImMessageRepository.name);

  private readonly pool: Pool | null;

  constructor(
    @Inject(InMemoryMessageStore) private readonly inMemoryStore: InMemoryMessageStore,
    @Inject(DatabaseService) databaseService: DatabaseService = new DatabaseService(),
  ) {
    this.pool = (databaseService.drizzle?.$client as Pool | undefined) ?? null;
    if (!this.pool) {
      this.pool = null;
      this.logger.warn('DATABASE_URL is not set. IM repository will use in-memory storage.');
    }
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

      const metadataJson = message.metadata ? JSON.stringify(message.metadata) : null;
      const messageType = message.messageType ?? 'text';

      const insertResult = await client.query<MessageRow>(
        `
          WITH next_sequence AS (
            SELECT COALESCE(
              (
                SELECT sequence_id
                FROM messages
                WHERE tenant_id = $1
                  AND conversation_id = $2
                ORDER BY sequence_id DESC
                LIMIT 1
              ),
              0
            ) + 1 AS value
          )
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
          SELECT $1,
                 $2,
                 $3,
                 next_sequence.value,
                 $4,
                 $5,
                 $6,
                 $7,
                 $8,
                 $9
          FROM next_sequence
          ON CONFLICT (tenant_id, message_id) DO NOTHING
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
          message.userId,
          message.traceId,
          message.content,
          messageType,
          metadataJson,
          message.createdAt,
        ],
      );

      if (!insertResult.rowCount || insertResult.rowCount === 0) {
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

        if (!duplicateResult.rowCount || duplicateResult.rowCount === 0) {
          throw new Error(`Message insert conflict without existing row: ${message.messageId}`);
        }

        return {
          duplicate: true,
          message: this.toStoredMessage(duplicateResult.rows[0]),
        };
      }

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

  async updateContent(tenantId: string, messageId: string, content: string): Promise<StoredMessage | null> {
    if (!this.pool) {
      return this.inMemoryStore.updateContent(tenantId, '', messageId, content);
    }

    return this.runWithTenant(tenantId, async (client) => {
      const result = await client.query<MessageRow>(
        `
          UPDATE messages
          SET content = $1, edited_at = NOW()
          WHERE tenant_id = $2 AND message_id = $3 AND deleted_at IS NULL
          RETURNING content, conversation_id, created_at, deleted_at, edited_at,
                    message_id, message_type, metadata_json, sequence_id,
                    tenant_id, trace_id, user_id;
        `,
        [content, tenantId, messageId],
      );

      if (!result.rowCount || result.rowCount === 0) return null;
      return this.toStoredMessage(result.rows[0]);
    });
  }

  async softDelete(tenantId: string, messageId: string): Promise<StoredMessage | null> {
    if (!this.pool) {
      return this.inMemoryStore.softDelete(tenantId, '', messageId);
    }

    return this.runWithTenant(tenantId, async (client) => {
      const result = await client.query<MessageRow>(
        `
          UPDATE messages
          SET content = '', deleted_at = NOW()
          WHERE tenant_id = $1 AND message_id = $2 AND deleted_at IS NULL
          RETURNING content, conversation_id, created_at, deleted_at, edited_at,
                    message_id, message_type, metadata_json, sequence_id,
                    tenant_id, trace_id, user_id;
        `,
        [tenantId, messageId],
      );

      if (!result.rowCount || result.rowCount === 0) return null;
      return this.toStoredMessage(result.rows[0]);
    });
  }

  async upsertReadReceipt(tenantId: string, conversationId: string, userId: string, sequenceId: number): Promise<void> {
    if (!this.pool) return;

    await this.runWithTenant(tenantId, async (client) => {
      await client.query(
        `
          INSERT INTO message_reads (tenant_id, conversation_id, user_id, last_read_sequence_id, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (tenant_id, conversation_id, user_id)
          DO UPDATE SET last_read_sequence_id = GREATEST(message_reads.last_read_sequence_id, $4),
                        updated_at = NOW();
        `,
        [tenantId, conversationId, userId, sequenceId],
      );
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
      deletedAt: row.deleted_at?.toISOString() ?? null,
      editedAt: row.edited_at?.toISOString() ?? null,
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
