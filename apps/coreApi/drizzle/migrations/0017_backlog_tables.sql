-- Backlog Tasks & Sprints tables
CREATE TABLE IF NOT EXISTS backlog_tasks (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id VARCHAR(128) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  assignee_id VARCHAR(128),
  sprint_id VARCHAR(128),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backlog_tasks_tenant_idx ON backlog_tasks (tenant_id);
CREATE INDEX IF NOT EXISTS backlog_tasks_tenant_status_idx ON backlog_tasks (tenant_id, status);
CREATE INDEX IF NOT EXISTS backlog_tasks_tenant_sprint_idx ON backlog_tasks (tenant_id, sprint_id);

CREATE TABLE IF NOT EXISTS backlog_sprints (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id VARCHAR(128) NOT NULL,
  name VARCHAR(200) NOT NULL,
  goal TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'planning',
  start_date VARCHAR(10),
  end_date VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backlog_sprints_tenant_idx ON backlog_sprints (tenant_id);
CREATE INDEX IF NOT EXISTS backlog_sprints_tenant_status_idx ON backlog_sprints (tenant_id, status);

-- RLS policies
ALTER TABLE backlog_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlog_tasks FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'backlog_tasks'
      AND policyname = 'backlog_tasks_tenant_isolation'
  ) THEN
    CREATE POLICY backlog_tasks_tenant_isolation
      ON backlog_tasks
      USING (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END
$$;

ALTER TABLE backlog_sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlog_sprints FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'backlog_sprints'
      AND policyname = 'backlog_sprints_tenant_isolation'
  ) THEN
    CREATE POLICY backlog_sprints_tenant_isolation
      ON backlog_sprints
      USING (tenant_id = current_setting('app.current_tenant', true));
  END IF;
END
$$;
