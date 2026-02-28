CREATE TABLE IF NOT EXISTS messages_partitioned_rehearsal (
  tenant_id VARCHAR(64) NOT NULL,
  conversation_id VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  sequence_id BIGINT NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  trace_id VARCHAR(128) NOT NULL,
  message_type VARCHAR(16) NOT NULL DEFAULT 'text',
  metadata_json TEXT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY HASH (tenant_id);

CREATE TABLE IF NOT EXISTS messages_partitioned_rehearsal_p0
  PARTITION OF messages_partitioned_rehearsal
  FOR VALUES WITH (MODULUS 4, REMAINDER 0);

CREATE TABLE IF NOT EXISTS messages_partitioned_rehearsal_p1
  PARTITION OF messages_partitioned_rehearsal
  FOR VALUES WITH (MODULUS 4, REMAINDER 1);

CREATE TABLE IF NOT EXISTS messages_partitioned_rehearsal_p2
  PARTITION OF messages_partitioned_rehearsal
  FOR VALUES WITH (MODULUS 4, REMAINDER 2);

CREATE TABLE IF NOT EXISTS messages_partitioned_rehearsal_p3
  PARTITION OF messages_partitioned_rehearsal
  FOR VALUES WITH (MODULUS 4, REMAINDER 3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_partitioned_rehearsal_tenant_message_uniq'
  ) THEN
    ALTER TABLE messages_partitioned_rehearsal
      ADD CONSTRAINT messages_partitioned_rehearsal_tenant_message_uniq UNIQUE (tenant_id, message_id);
  END IF;
END
$$;
