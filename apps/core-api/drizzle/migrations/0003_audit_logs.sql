CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(128) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  action VARCHAR(128) NOT NULL,
  target_type VARCHAR(64) NULL,
  target_id VARCHAR(128) NULL,
  trace_id VARCHAR(128) NOT NULL,
  context_json TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx
  ON audit_logs (created_at);

CREATE INDEX IF NOT EXISTS audit_logs_tenant_action_idx
  ON audit_logs (tenant_id, action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_tenant_isolation'
  ) THEN
    CREATE POLICY audit_logs_tenant_isolation
      ON audit_logs
      USING (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END
$$;
