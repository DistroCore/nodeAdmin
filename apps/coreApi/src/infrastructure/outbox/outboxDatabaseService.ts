import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

interface OutboxRoleCheck {
  can_access_audit_logs: boolean;
  can_access_messages: boolean;
  can_access_outbox: boolean;
  can_access_users: boolean;
  rolbypassrls: boolean;
  rolname: string;
  rolsuper: boolean;
}

@Injectable()
export class OutboxDatabaseService implements OnModuleDestroy {
  readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.OUTBOX_DATABASE_URL?.trim();
    this.pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 2 }) : null;
  }

  async assertSafeRole(): Promise<void> {
    if (!this.pool) {
      throw new Error('OUTBOX_DATABASE_URL is required when the outbox publisher is enabled.');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query<OutboxRoleCheck>(`
        SELECT current_user AS rolname,
               role.rolsuper,
               role.rolbypassrls,
               has_table_privilege(current_user, 'public.outbox_events', 'SELECT,UPDATE,DELETE') AS can_access_outbox,
               has_table_privilege(current_user, 'public.audit_logs', 'SELECT') AS can_access_audit_logs,
               has_table_privilege(current_user, 'public.messages', 'SELECT') AS can_access_messages,
               has_table_privilege(current_user, 'public.users', 'SELECT') AS can_access_users
        FROM pg_roles AS role
        WHERE role.rolname = current_user
      `);
      const role = result.rows[0];

      if (
        !role ||
        role.rolsuper ||
        !role.rolbypassrls ||
        !role.can_access_outbox ||
        role.can_access_audit_logs ||
        role.can_access_messages ||
        role.can_access_users
      ) {
        throw new Error(
          `OUTBOX_DATABASE_URL must use the restricted cross-tenant outbox role; received ${role?.rolname ?? 'unknown'}.`,
        );
      }
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
