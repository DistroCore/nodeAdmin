-- Fix RLS Policies: Add WITH CHECK clause for write operations
-- Current policies only restrict reads (USING), not writes (WITH CHECK)

-- Drop existing policies
DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
DROP POLICY IF EXISTS messages_tenant_isolation ON messages;
DROP POLICY IF EXISTS outbox_tenant_isolation ON outbox_events;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;

-- Recreate policies with both USING (for reads) and WITH CHECK (for writes)
CREATE POLICY conversations_tenant_isolation
  ON conversations
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY messages_tenant_isolation
  ON messages
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY outbox_tenant_isolation
  ON outbox_events
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

CREATE POLICY audit_logs_tenant_isolation
  ON audit_logs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
