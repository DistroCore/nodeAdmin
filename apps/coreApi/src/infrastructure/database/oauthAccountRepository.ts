import { Injectable, Logger } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

export interface LinkedOAuthAccount {
  userId: string;
  isActive: boolean;
  name: string | null;
}

export interface OAuthAccountSummary {
  provider: string;
  providerId: string;
  createdAt: string;
}

/**
 * OAuthAccountRepository owns all `oauth_accounts` table SQL (plus the users JOIN needed to read
 * account state during login). Same raw-Pool style as UserRepository — see that file's header for
 * the rationale on the (intentionally not unified) repository patterns.
 */
@Injectable()
export class OAuthAccountRepository {
  private readonly logger = new Logger(OAuthAccountRepository.name);

  private readonly pool: Pool | null;

  constructor(pool: Pool | null = null) {
    this.pool = pool;
    if (!this.pool) {
      this.logger.warn('DATABASE_URL is not set. OAuthAccountRepository will have no effect.');
    }
  }

  /**
   * Find a linked user by provider-scoped identity. Joins `users` to surface is_active / name so
   * the service can short-circuit disabled accounts in one round-trip.
   */
  async findByProvider(
    provider: string,
    providerId: string,
  ): Promise<LinkedOAuthAccount | null> {
    if (!this.pool) return null;

    const result = await this.pool.query<LinkedOAuthAccount>(
      `
        SELECT oa.user_id AS "userId",
               u.name,
               u.is_active AS "isActive"
        FROM oauth_accounts oa
        JOIN users u ON u.id = oa.user_id
        WHERE oa.provider = $1
          AND oa.provider_id = $2;
      `,
      [provider, providerId],
    );

    return result.rows[0] ?? null;
  }

  /**
   * Insert an oauth_account link row. Must be called inside the caller's registration transaction
   * (so the users insert + link are atomic) — `client` is required.
   */
  async insert(
    tenantId: string,
    id: string,
    userId: string,
    provider: string,
    providerId: string,
    client: PoolClient,
  ): Promise<void> {
    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
    await client.query(
      `INSERT INTO oauth_accounts (id, user_id, provider, provider_id) VALUES ($1, $2, $3, $4)`,
      [id, userId, provider, providerId],
    );
  }

  async listByUserId(userId: string): Promise<OAuthAccountSummary[]> {
    if (!this.pool) return [];

    const result = await this.pool.query<{
      provider: string;
      provider_id: string;
      created_at: string;
    }>('SELECT provider, provider_id, created_at FROM oauth_accounts WHERE user_id = $1', [userId]);

    return result.rows.map((row) => ({
      createdAt: row.created_at,
      provider: row.provider,
      providerId: row.provider_id,
    }));
  }

  /**
   * Delete a linked account. Returns the number of rows removed (0 → caller reports "not found").
   */
  async deleteByUserAndProvider(userId: string, provider: string): Promise<number> {
    if (!this.pool) return 0;

    const result = await this.pool.query(
      'DELETE FROM oauth_accounts WHERE user_id = $1 AND provider = $2',
      [userId, provider],
    );
    return result.rowCount ?? 0;
  }
}
