-- Migration: 0006_optimize_indexes
-- Add missing composite indexes for high-concurrency IM workloads.

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON messages (tenant_id, conversation_id, created_at DESC);

-- In current schema, published_at acts as the outbox publish status.
CREATE INDEX IF NOT EXISTS outbox_events_published_created_idx
  ON outbox_events (published_at, created_at);

CREATE INDEX IF NOT EXISTS outbox_events_aggregate_created_idx
  ON outbox_events (aggregate_id, created_at);
