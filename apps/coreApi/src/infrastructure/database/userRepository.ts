import { Injectable, Logger } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

/**
 * Row shape for the subset of `users` columns the auth flow reads/writes. Field names mirror the
 * snake_case DB columns — conversion to camelCase happens at the service layer to keep this
 * repository SQL-shaped and easy to audit.
 */
export interface UserAuthRow {
  id: string;
  email: string;
  isActive: boolean;
  name: string | null;
  passwordHash: string;
}

/**
 * UserRepository owns all `users` table SQL for the auth flow.
 *
 * Uses the raw `pg.Pool` directly (not Drizzle, not DatabaseService) to align with the
 * ImMessageRepository pattern — keeping controller→service→repository layering clean where the
 * repository depends on no Service, only on a connection. RLS tenant context is set inside each
 * transaction via `set_config('app.current_tenant', ...)`.
 *
 * NOTE: this is one of three coexisting repository styles in the codebase (raw Pool / drizzle
 * client / drizzle-without-null). Unifying them is tracked as a separate concern; this file
 * intentionally matches the existing authService raw-SQL style to avoid a larger refactor. See
 * decisionLog D-023 and roadmapPlan TD-19 for the known divergence.
 */
@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  private readonly pool: Pool | null;

  constructor(pool: Pool | null = null) {
    this.pool = pool;
    if (!this.pool) {
      this.logger.warn('DATABASE_URL is not set. UserRepository will have no effect.');
    }
  }

  /**
   * Look up a user by email within a tenant for password-based login / registration checks.
   * Returns null when the user does not exist.
   */
  async findByEmail(tenantId: string, email: string): Promise<UserAuthRow | null> {
    if (!this.pool) return null;

    const result = await this.pool.query<UserAuthRow>(
      `
        SELECT id,
               email,
               is_active AS "isActive",
               name,
               password_hash AS "passwordHash"
        FROM users
        WHERE tenant_id = $1
          AND email = $2;
      `,
      [tenantId, email],
    );

    return result.rows[0] ?? null;
  }

  /**
   * Look up a user by id within a tenant. Used by refresh-time is_active guard and other flows
   * that resolve a user from an already-issued token.
   */
  async findById(tenantId: string, userId: string): Promise<UserAuthRow | null> {
    if (!this.pool) return null;

    const result = await this.pool.query<UserAuthRow>(
      `
        SELECT id,
               email,
               is_active AS "isActive",
               name,
               password_hash AS "passwordHash"
        FROM users
        WHERE id = $1
          AND tenant_id = $2;
      `,
      [userId, tenantId],
    );

    return result.rows[0] ?? null;
  }

  /**
   * Insert a new user row. When called inside a registration transaction, pass the transaction's
   * `client` so the insert participates in BEGIN/COMMIT — otherwise a pool-level connection is used.
   */
  async insert(
    tenantId: string,
    userId: string,
    email: string,
    passwordHash: string,
    name: string | null,
    client?: PoolClient,
  ): Promise<void> {
    await this.runWith(tenantId, client, async (c) => {
      await c.query(`INSERT INTO users (id, tenant_id, email, password_hash, name) VALUES ($1, $2, $3, $4, $5)`, [
        userId,
        tenantId,
        email,
        passwordHash,
        name,
      ]);
    });
  }

  /**
   * Update a user's password hash. `client` participates in the caller's transaction when provided.
   */
  async updatePassword(tenantId: string, userId: string, passwordHash: string, client?: PoolClient): Promise<void> {
    await this.runWith(tenantId, client, async (c) => {
      await c.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, userId]);
    });
  }

  /**
   * Fetch a user's display name by id (no tenant filter — caller has already resolved the tenant
   * scope). Used by SMS login where the join already validated tenancy.
   */
  async findNameById(userId: string): Promise<string | null> {
    if (!this.pool) return null;

    const result = await this.pool.query<{ name: string | null }>('SELECT name FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.name ?? null;
  }

  /**
   * Resolve a user's role names within a tenant. Joins user_roles + roles. Read-only — no RLS
   * transaction wrapper needed since the policy is `tenant_id = current_setting(...)` and reads
   * of tenant-scoped rows are guarded by the query's own tenant filter.
   */
  async getRoleNames(userId: string, tenantId: string): Promise<string[]> {
    if (!this.pool) return [];

    const result = await this.pool.query<{ name: string }>(
      `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1 AND r.tenant_id = $2`,
      [userId, tenantId],
    );
    return result.rows.map((row) => row.name);
  }

  /**
   * Assign the default 'viewer' role to a freshly created user. Called inside the registration
   * transaction — `client` is required so the insert shares BEGIN/COMMIT with the users insert.
   */
  async assignDefaultRole(tenantId: string, userId: string, client: PoolClient): Promise<void> {
    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE tenant_id = $2 AND name = 'viewer' LIMIT 1`,
      [userId, tenantId],
    );
  }

  /**
   * Atomically insert a user AND grant the default viewer role. The two writes must share a
   * transaction (otherwise a mid-flow failure could leave a role-less user). Exposed as a single
   * method so callers don't need to compose a cross-statement transaction themselves.
   */
  async createUserWithDefaultRole(
    tenantId: string,
    userId: string,
    email: string,
    passwordHash: string,
    name: string | null,
  ): Promise<void> {
    if (!this.pool) {
      throw new Error('UserRepository: database pool is not initialized.');
    }

    const client = await this.pool.connect();
    await client.query('BEGIN');
    try {
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query(`INSERT INTO users (id, tenant_id, email, password_hash, name) VALUES ($1, $2, $3, $4, $5)`, [
        userId,
        tenantId,
        email,
        passwordHash,
        name,
      ]);
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE tenant_id = $2 AND name = 'viewer' LIMIT 1`,
        [userId, tenantId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Borrow a pooled client with tenant context already set. Intended ONLY for service-level flows
   * that must coordinate writes across multiple repositories in a single transaction (e.g. OAuth
   * registration inserts into users + user_roles + oauth_accounts atomically). The caller owns the
   * transaction lifecycle (BEGIN/COMMIT/ROLLBACK) and must release the client.
   *
   * This is a deliberate, narrow escape hatch — the vast majority of writes go through dedicated
   * repository methods. Keeping cross-repo composition possible without forcing every repository
   * to re-plumb transaction propagation through every method signature.
   */
  async acquireClient(tenantId: string): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('UserRepository: database pool is not initialized.');
    }

    const client = await this.pool.connect();
    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
    return client;
  }

  private async runWith(
    tenantId: string,
    client: PoolClient | undefined,
    work: (client: PoolClient) => Promise<void>,
  ): Promise<void> {
    if (!this.pool) {
      throw new Error('UserRepository: database pool is not initialized.');
    }

    if (client) {
      // Caller owns the transaction — just set the tenant context and run.
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await work(client);
      return;
    }

    const owned = await this.pool.connect();
    await owned.query('BEGIN');
    try {
      await owned.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await work(owned);
      await owned.query('COMMIT');
    } catch (error) {
      await owned.query('ROLLBACK');
      throw error;
    } finally {
      owned.release();
    }
  }
}
