ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'conversations_tenant_isolation'
  ) THEN
    CREATE POLICY conversations_tenant_isolation
      ON conversations
      USING (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'messages_tenant_isolation'
  ) THEN
    CREATE POLICY messages_tenant_isolation
      ON messages
      USING (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outbox_events'
      AND policyname = 'outbox_tenant_isolation'
  ) THEN
    CREATE POLICY outbox_tenant_isolation
      ON outbox_events
      USING (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END
$$;
