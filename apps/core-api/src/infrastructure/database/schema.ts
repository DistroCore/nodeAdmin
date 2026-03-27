import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const conversations = pgTable(
  'conversations',
  {
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    id: varchar('id', { length: 128 }).notNull(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  },
  (table) => ({
    conversationsTenantCreatedIdx: index('conversations_tenant_created_idx').on(
      table.tenantId,
      table.createdAt
    ),
    pk: primaryKey({ columns: [table.tenantId, table.id], name: 'conversations_pk' }),
  })
);

export const messages = pgTable(
  'messages',
  {
    content: text('content').notNull(),
    conversationId: varchar('conversation_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    messageId: varchar('message_id', { length: 128 }).notNull(),
    messageType: varchar('message_type', { length: 16 }).notNull().default('text'),
    metadataJson: text('metadata_json'),
    sequenceId: bigint('sequence_id', { mode: 'number' }).notNull(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    traceId: varchar('trace_id', { length: 128 }).notNull(),
    userId: varchar('user_id', { length: 128 }).notNull(),
  },
  (table) => ({
    messagesTenantConversationSequenceIdx: index('messages_tenant_conv_seq_idx').on(
      table.tenantId,
      table.conversationId,
      table.sequenceId
    ),
    messagesTenantMessageIdUnique: uniqueIndex('messages_tenant_message_id_uniq').on(
      table.tenantId,
      table.messageId
    ),
    messagesTenantUserCreatedIdx: index('messages_tenant_user_created_idx').on(
      table.tenantId,
      table.userId,
      table.createdAt
    ),
    messagesConversationCreatedIdx: index('messages_conversation_created_idx').on(
      table.tenantId,
      table.conversationId,
      table.createdAt
    ),
  })
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    aggregateId: varchar('aggregate_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    dlqAt: timestamp('dlq_at', { withTimezone: true }),
    eventType: varchar('event_type', { length: 128 }).notNull(),
    id: varchar('id', { length: 128 }).notNull(),
    lastError: text('last_error'),
    payload: text('payload').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    retryCount: integer('retry_count').default(0).notNull(),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  },
  (table) => ({
    outboxCreatedIdx: index('outbox_created_idx').on(table.createdAt),
    outboxDlqIdx: index('outbox_dlq_idx').on(table.dlqAt),
    outboxPublishIdx: index('outbox_publish_idx').on(table.publishedAt),
    outboxEventsPublishedCreatedIdx: index('outbox_events_published_created_idx').on(
      table.publishedAt,
      table.createdAt
    ),
    outboxEventsAggregateCreatedIdx: index('outbox_events_aggregate_created_idx').on(
      table.aggregateId,
      table.createdAt
    ),
    pk: primaryKey({ columns: [table.id], name: 'outbox_events_pk' }),
  })
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    action: varchar('action', { length: 128 }).notNull(),
    contextJson: text('context_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    id: varchar('id', { length: 128 }).notNull(),
    targetId: varchar('target_id', { length: 128 }),
    targetType: varchar('target_type', { length: 64 }),
    tenantId: varchar('tenant_id', { length: 64 }).notNull(),
    traceId: varchar('trace_id', { length: 128 }).notNull(),
    userId: varchar('user_id', { length: 128 }).notNull(),
  },
  (table) => ({
    auditLogsCreatedIdx: index('audit_logs_created_idx').on(table.createdAt),
    auditLogsTenantActionIdx: index('audit_logs_tenant_action_idx').on(
      table.tenantId,
      table.action
    ),
    pk: primaryKey({ columns: [table.id], name: 'audit_logs_pk' }),
  })
);
