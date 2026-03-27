import { randomUUID } from 'node:crypto';

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

// ─── RBAC / Admin Platform Tables ────────────────────────────────

export const tenants = pgTable('tenants', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  logo: varchar('logo', { length: 500 }),
  isActive: integer('is_active').$type<boolean>().default(1).notNull(),
  configJson: text('config_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  tenantId: varchar('tenant_id', { length: 128 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }),
  avatar: varchar('avatar', { length: 500 }),
  isActive: integer('is_active').$type<boolean>().default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  usersTenantEmailUnique: uniqueIndex('users_tenant_email_uniq').on(table.tenantId, table.email),
  usersTenantIdx: index('users_tenant_idx').on(table.tenantId),
}));

export const roles = pgTable('roles', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  tenantId: varchar('tenant_id', { length: 128 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isSystem: integer('is_system').$type<boolean>().default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  rolesTenantNameUnique: uniqueIndex('roles_tenant_name_uniq').on(table.tenantId, table.name),
  rolesTenantIdx: index('roles_tenant_idx').on(table.tenantId),
}));

export const permissions = pgTable('permissions', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  code: varchar('code', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  module: varchar('module', { length: 50 }).notNull(),
  description: text('description'),
});

export const userRoles = pgTable('user_roles', {
  userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id),
  roleId: varchar('role_id', { length: 128 }).notNull().references(() => roles.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.roleId], name: 'user_roles_pk' }),
}));

export const rolePermissions = pgTable('role_permissions', {
  roleId: varchar('role_id', { length: 128 }).notNull().references(() => roles.id),
  permissionId: varchar('permission_id', { length: 128 }).notNull().references(() => permissions.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.roleId, table.permissionId], name: 'role_permissions_pk' }),
}));

export const menus = pgTable('menus', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  parentId: varchar('parent_id', { length: 128 }),
  name: varchar('name', { length: 100 }).notNull(),
  path: varchar('path', { length: 200 }),
  icon: varchar('icon', { length: 100 }),
  sortOrder: integer('sort_order').default(0).notNull(),
  permissionCode: varchar('permission_code', { length: 100 }),
  isVisible: integer('is_visible').$type<boolean>().default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  menusParentIdx: index('menus_parent_idx').on(table.parentId),
}));

export const roleMenus = pgTable('role_menus', {
  roleId: varchar('role_id', { length: 128 }).notNull().references(() => roles.id),
  menuId: varchar('menu_id', { length: 128 }).notNull().references(() => menus.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.roleId, table.menuId], name: 'role_menus_pk' }),
}));

export const oauthAccounts = pgTable('oauth_accounts', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  oauthProviderUnique: uniqueIndex('oauth_provider_uniq').on(table.provider, table.providerId),
}));

export const smsCodes = pgTable('sms_codes', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => randomUUID()),
  phone: varchar('phone', { length: 20 }).notNull(),
  code: varchar('code', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  smsPhoneIdx: index('sms_phone_idx').on(table.phone, table.createdAt),
}));
