import { Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';

export interface ValidSmsCode {
  id: string;
  userId: string | null;
  isActive: boolean;
}

/**
 * SmsCodeRepository owns all `sms_codes` table SQL (plus the users LEFT JOIN used by login to
 * resolve the linked user). Note: sms_codes has no tenant_id column — it is keyed by phone; the
 * tenant is applied only when joining to users for the login lookup.
 *
 * Same raw-Pool style as the other auth repositories — see UserRepository header for rationale.
 */
@Injectable()
export class SmsCodeRepository {
  private readonly logger = new Logger(SmsCodeRepository.name);

  private readonly pool: Pool | null;

  constructor(pool: Pool | null = null) {
    this.pool = pool;
    if (!this.pool) {
      this.logger.warn('DATABASE_URL is not set. SmsCodeRepository will have no effect.');
    }
  }

  /**
   * Count codes issued for a phone in the last `windowMs` — used for per-phone rate limiting.
   */
  async countRecentByPhone(phone: string, windowMs: number): Promise<number> {
    if (!this.pool) return 0;

    const result = await this.pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM sms_codes
        WHERE phone = $1
          AND created_at > now() - ($2 || ' milliseconds')::interval
      `,
      [phone, String(windowMs)],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async insert(id: string, phone: string, code: string, expiresAtMs: number): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(
      `INSERT INTO sms_codes (id, phone, code, expires_at) VALUES ($1, $2, $3, now() + ($4 || ' milliseconds')::interval)`,
      [id, phone, code, String(expiresAtMs)],
    );
  }

  /**
   * Find a valid (unused, unexpired) code for a phone, joining users within the tenant to resolve
   * the linked user_id and is_active flag in one query.
   */
  async findValidByPhoneAndCode(phone: string, code: string, tenantId: string): Promise<ValidSmsCode | null> {
    if (!this.pool) return null;

    const result = await this.pool.query<ValidSmsCode>(
      `
        SELECT sc.id,
               u.id AS "userId",
               u.is_active AS "isActive"
        FROM sms_codes sc
        LEFT JOIN users u ON u.phone = sc.phone AND u.tenant_id = $3
        WHERE sc.phone = $1
          AND sc.code = $2
          AND sc.used_at IS NULL
          AND sc.expires_at > now()
        ORDER BY sc.created_at DESC
        LIMIT 1;
      `,
      [phone, code, tenantId],
    );

    return result.rows[0] ?? null;
  }

  async markUsed(id: string): Promise<void> {
    if (!this.pool) return;

    await this.pool.query('UPDATE sms_codes SET used_at = now() WHERE id = $1', [id]);
  }
}
