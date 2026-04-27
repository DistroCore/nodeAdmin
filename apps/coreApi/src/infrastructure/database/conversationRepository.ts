import { Injectable } from '@nestjs/common';
import { and, desc, eq, exists, ilike, max, ne, notExists, or, sql } from 'drizzle-orm';
import { DatabaseService } from './databaseService';
import { conversationMembers, conversations, messages, users } from './schema';

export interface ConversationRow {
  conversationId: string;
  tenantId: string;
  type: 'dm' | 'group';
  title: string | null;
  creatorId: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberRow {
  conversationId: string;
  joinedAt: Date;
  role: 'admin' | 'member';
  tenantId: string;
  userId: string;
}

@Injectable()
export class ConversationRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(params: {
    id: string;
    tenantId: string;
    type: 'dm' | 'group';
    title: string | null;
    creatorId: string;
    memberUserIds: string[];
  }): Promise<ConversationRow> {
    if (!this.db.drizzle) {
      throw new Error('Database not available');
    }

    const createdConversation = await this.db.drizzle.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${params.tenantId}, true)`);

      const insertedConversations = await tx
        .insert(conversations)
        .values({
          id: params.id,
          tenantId: params.tenantId,
          type: params.type,
          title: params.title,
          creatorId: params.creatorId,
        })
        .returning({
          conversationId: conversations.id,
          tenantId: conversations.tenantId,
          type: conversations.type,
          title: conversations.title,
          creatorId: conversations.creatorId,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        });

      await tx.insert(conversationMembers).values([
        {
          tenantId: params.tenantId,
          conversationId: params.id,
          userId: params.creatorId,
          role: 'admin',
        },
        ...params.memberUserIds.map((memberUserId) => ({
          tenantId: params.tenantId,
          conversationId: params.id,
          userId: memberUserId,
          role: 'member' as const,
        })),
      ]);

      return insertedConversations[0] ?? null;
    });

    if (!createdConversation) {
      throw new Error(`Failed to create conversation ${params.id}`);
    }

    return {
      conversationId: createdConversation.conversationId,
      tenantId: createdConversation.tenantId,
      type: createdConversation.type === 'group' ? 'group' : 'dm',
      title: createdConversation.title,
      creatorId: createdConversation.creatorId,
      lastMessageAt: null,
      createdAt: createdConversation.createdAt,
      updatedAt: createdConversation.updatedAt,
    };
  }

  async findById(tenantId: string, conversationId: string, userId: string): Promise<ConversationRow | null> {
    if (!this.db.drizzle) {
      return null;
    }

    const rows = await this.db.drizzle.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);

      const latestMessageByConversation = tx
        .select({
          conversationId: messages.conversationId,
          lastMessageAt: max(messages.createdAt).as('last_message_at'),
          tenantId: messages.tenantId,
        })
        .from(messages)
        .where(and(eq(messages.tenantId, tenantId), eq(messages.conversationId, conversationId)))
        .groupBy(messages.tenantId, messages.conversationId)
        .as('latest_message_by_conversation');

      return tx
        .select({
          conversationId: conversations.id,
          tenantId: conversations.tenantId,
          type: conversations.type,
          title: conversations.title,
          creatorId: conversations.creatorId,
          lastMessageAt: latestMessageByConversation.lastMessageAt,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .innerJoin(
          conversationMembers,
          and(
            eq(conversations.tenantId, conversationMembers.tenantId),
            eq(conversations.id, conversationMembers.conversationId),
            eq(conversationMembers.userId, userId),
          ),
        )
        .leftJoin(
          latestMessageByConversation,
          and(
            eq(conversations.tenantId, latestMessageByConversation.tenantId),
            eq(conversations.id, latestMessageByConversation.conversationId),
          ),
        )
        .where(and(eq(conversations.tenantId, tenantId), eq(conversations.id, conversationId)))
        .limit(1);
    });

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.mapConversationRow(row);
  }

  async listByMember(tenantId: string, userId: string, limit = 50): Promise<ConversationRow[]> {
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
          type: conversations.type,
          title: conversations.title,
          creatorId: conversations.creatorId,
          lastMessageAt: latestMessageByConversation.lastMessageAt,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .innerJoin(
          conversationMembers,
          and(
            eq(conversations.tenantId, conversationMembers.tenantId),
            eq(conversations.id, conversationMembers.conversationId),
            eq(conversationMembers.userId, userId),
          ),
        )
        .leftJoin(
          latestMessageByConversation,
          and(
            eq(conversations.tenantId, latestMessageByConversation.tenantId),
            eq(conversations.id, latestMessageByConversation.conversationId),
          ),
        )
        .where(eq(conversations.tenantId, tenantId))
        .orderBy(
          desc(latestMessageByConversation.lastMessageAt),
          desc(conversations.updatedAt),
          desc(conversations.createdAt),
        )
        .limit(boundedLimit);
    });

    return rows.map((row) => this.mapConversationRow(row));
  }

  async listMembers(tenantId: string, conversationId: string): Promise<MemberRow[]> {
    if (!this.db.drizzle) {
      return [];
    }

    const rows = await this.db.drizzle.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);

      return tx
        .select({
          conversationId: conversationMembers.conversationId,
          joinedAt: conversationMembers.joinedAt,
          role: conversationMembers.role,
          tenantId: conversationMembers.tenantId,
          userId: conversationMembers.userId,
        })
        .from(conversationMembers)
        .where(and(eq(conversationMembers.tenantId, tenantId), eq(conversationMembers.conversationId, conversationId)))
        .orderBy(desc(conversationMembers.role), conversationMembers.joinedAt);
    });

    return rows.map((row) => ({
      conversationId: row.conversationId,
      joinedAt: row.joinedAt,
      role: row.role === 'admin' ? 'admin' : 'member',
      tenantId: row.tenantId,
      userId: row.userId,
    }));
  }

  async findDmBetweenUsers(tenantId: string, userIdA: string, userIdB: string): Promise<ConversationRow | null> {
    if (!this.db.drizzle) {
      return null;
    }

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

      const hasUserASubquery = tx
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.tenantId, tenantId),
            eq(conversationMembers.conversationId, conversations.id),
            eq(conversationMembers.userId, userIdA),
          ),
        );

      const hasUserBSubquery = tx
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.tenantId, tenantId),
            eq(conversationMembers.conversationId, conversations.id),
            eq(conversationMembers.userId, userIdB),
          ),
        );

      const hasDifferentMemberSubquery = tx
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.tenantId, tenantId),
            eq(conversationMembers.conversationId, conversations.id),
            ne(conversationMembers.userId, userIdA),
            ne(conversationMembers.userId, userIdB),
          ),
        );

      return tx
        .select({
          conversationId: conversations.id,
          tenantId: conversations.tenantId,
          type: conversations.type,
          title: conversations.title,
          creatorId: conversations.creatorId,
          lastMessageAt: latestMessageByConversation.lastMessageAt,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .leftJoin(
          latestMessageByConversation,
          and(
            eq(conversations.tenantId, latestMessageByConversation.tenantId),
            eq(conversations.id, latestMessageByConversation.conversationId),
          ),
        )
        .where(
          and(
            eq(conversations.tenantId, tenantId),
            eq(conversations.type, 'dm'),
            exists(hasUserASubquery),
            exists(hasUserBSubquery),
            notExists(hasDifferentMemberSubquery),
          ),
        )
        .orderBy(
          desc(latestMessageByConversation.lastMessageAt),
          desc(conversations.updatedAt),
          desc(conversations.createdAt),
        )
        .limit(1);
    });

    const row = rows[0];
    return row ? this.mapConversationRow(row) : null;
  }

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
          type: conversations.type,
          title: conversations.title,
          creatorId: conversations.creatorId,
          lastMessageAt: latestMessageByConversation.lastMessageAt,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
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

    return rows.map((row) => this.mapConversationRow(row));
  }

  async searchUsers(
    tenantId: string,
    query: string,
    limit = 20,
  ): Promise<Array<{ id: string; name: string | null; email: string; avatar: string | null }>> {
    if (!this.db.drizzle) {
      return [];
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return [];
    }

    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
    const likeQuery = `%${trimmedQuery}%`;

    return this.db.drizzle.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);

      return tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
        })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), or(ilike(users.email, likeQuery), ilike(users.name, likeQuery))))
        .limit(boundedLimit);
    });
  }

  private mapConversationRow(row: {
    conversationId: string;
    tenantId: string;
    type: string;
    title: string | null;
    creatorId: string | null;
    lastMessageAt: Date | string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ConversationRow {
    return {
      conversationId: row.conversationId,
      tenantId: row.tenantId,
      type: row.type === 'group' ? 'group' : 'dm',
      title: row.title,
      creatorId: row.creatorId,
      lastMessageAt: this.normalizeDate(row.lastMessageAt),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
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
