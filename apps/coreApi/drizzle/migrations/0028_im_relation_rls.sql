-- Enforce tenant isolation on IM relation tables introduced after the original RLS baseline.

ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_members_tenant_isolation ON conversation_members;
CREATE POLICY conversation_members_tenant_isolation
  ON conversation_members
  FOR ALL
  USING (tenant_id = get_current_tenant_strict())
  WITH CHECK (tenant_id = get_current_tenant_strict());

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_reads_tenant_isolation ON message_reads;
CREATE POLICY message_reads_tenant_isolation
  ON message_reads
  FOR ALL
  USING (tenant_id = get_current_tenant_strict())
  WITH CHECK (tenant_id = get_current_tenant_strict());
