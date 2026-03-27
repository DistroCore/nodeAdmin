CREATE TABLE IF NOT EXISTS conversations (
  tenant_id VARCHAR(64) NOT NULL,
  id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_pk PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS conversations_tenant_created_idx
  ON conversations (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  tenant_id VARCHAR(64) NOT NULL,
  conversation_id VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  sequence_id BIGINT NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  trace_id VARCHAR(128) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_tenant_conv_seq_idx
  ON messages (tenant_id, conversation_id, sequence_id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS messages_tenant_message_id_uniq
  ON messages (tenant_id, message_id);

CREATE TABLE IF NOT EXISTS outbox_events (
  id VARCHAR(128) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  payload TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS outbox_created_idx
  ON outbox_events (created_at);

CREATE INDEX IF NOT EXISTS outbox_publish_idx
  ON outbox_events (published_at);
