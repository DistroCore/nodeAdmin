ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(16) NOT NULL DEFAULT 'text';

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS metadata_json TEXT NULL;

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS dlq_at TIMESTAMPTZ NULL;

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS last_error TEXT NULL;

CREATE INDEX IF NOT EXISTS outbox_dlq_idx
  ON outbox_events (dlq_at);
