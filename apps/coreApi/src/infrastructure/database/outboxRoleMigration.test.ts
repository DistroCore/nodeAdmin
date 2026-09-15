import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'apps/coreApi/drizzle/migrations/0029_outbox_role.sql'), 'utf8');

describe('outbox role migration', () => {
  it('creates a non-superuser BYPASSRLS role with outbox-only table grants', () => {
    expect(migration).toContain('CREATE ROLE nodeadmin_outbox');
    expect(migration).toContain('NOSUPERUSER');
    expect(migration).toContain('BYPASSRLS');
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM nodeadmin_outbox');
    expect(migration).toContain('GRANT SELECT, UPDATE, DELETE ON TABLE outbox_events TO nodeadmin_outbox');
  });

  it('does not reset the password of an operator-provisioned existing role', () => {
    const existingRoleBranch = migration.match(/ELSE([\s\S]*?)END IF;/)?.[1];

    expect(existingRoleBranch).toBeDefined();
    expect(existingRoleBranch).not.toContain('PASSWORD');
  });
});
