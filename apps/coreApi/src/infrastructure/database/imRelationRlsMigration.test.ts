import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'apps/coreApi/drizzle/migrations/0028_im_relation_rls.sql');

describe('IM relation RLS migration', () => {
  it.each(['conversation_members', 'message_reads'])('enables forced tenant isolation for %s', (tableName) => {
    const sql = readFileSync(migrationPath, 'utf8');
    const policy = sql.match(new RegExp(`CREATE POLICY ${tableName}_tenant_isolation[\\s\\S]*?;`))?.[0];

    expect(sql).toContain(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    expect(sql).toContain(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
    expect(policy).toContain(`ON ${tableName}`);
    expect(policy).toContain('FOR ALL');
    expect(policy).toContain('USING (tenant_id = get_current_tenant_strict())');
    expect(policy).toContain('WITH CHECK (tenant_id = get_current_tenant_strict())');
  });
});
