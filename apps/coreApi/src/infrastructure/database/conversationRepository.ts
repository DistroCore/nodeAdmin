import { Injectable } from '@nestjs/common';
import { and, desc, eq, max, sql } from 'drizzle-orm';
import { DatabaseService } from './databaseService';
import { conversations, messages } from './schema';

export interface ConversationRow {
  conversationId: string;
  tenantId: string;
  title: string;
  lastMessageAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ConversationRepository {
  constructor(private readonly db: DatabaseService) {}

  async listByTenant(tenantId: string, limit = 50): Promise<ConversationRow[]> {
    if (!this.db.drizzle) {
      return [];
    }

    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
    const rows = await this.db.drizzle.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);

      const latestMessageByConversation = tx
        .select({
          conversationId: messages.conversationId,
          lastMessageAt: max(messages.createdAt).as('last_message_at'),
          tenantId: messages.tenantId,
        })
        .from(messages)
        .where(eq(messages.tenantId, tenantId))
        .groupBy(messages.tenantId, messages.conversationId)
        .as('latest_message_by_conversation');

      return tx
        .select({
          conversationId: conversations.id,
          tenantId: conversations.tenantId,
          title: conversations.id,
          lastMessageAt: latestMessageByConversation.lastMessageAt,
          createdAt: conversations.createdAt,
        })
        .from(conversations)
        .leftJoin(
          latestMessageByConversation,
          and(
            eq(conversations.tenantId, latestMessageByConversation.tenantId),
            eq(conversations.id, latestMessageByConversation.conversationId),
          ),
        )
        .where(eq(conversations.tenantId, tenantId))
        .orderBy(desc(latestMessageByConversation.lastMessageAt), desc(conversations.createdAt))
        .limit(boundedLimit);
    });

    return rows.map((row) => ({
      conversationId: row.conversationId,
      tenantId: row.tenantId,
      title: row.title,
      lastMessageAt: this.normalizeDate(row.lastMessageAt),
      createdAt: row.createdAt,
    }));
  }

  private normalizeDate(value: Date | string | null): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
