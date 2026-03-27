-- Migration: 0005_messages_user_idx
-- Add composite index on messages(tenant_id, user_id, created_at)
-- Required for per-user message history queries.
-- Aligns with schema.ts messagesTenantUserCreatedIdx definition.

CREATE INDEX IF NOT EXISTS messages_tenant_user_created_idx
  ON messages (tenant_id, user_id, created_at DESC);
