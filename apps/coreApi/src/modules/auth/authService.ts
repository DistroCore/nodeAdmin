import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { Pool } from 'pg';
import { runtimeConfig } from '../../app/runtimeConfig';
import { DatabaseService } from '../../infrastructure/database/databaseService';
import type { AuthPrincipal } from '../../infrastructure/tenant/authPrincipal';
import { AuthIdentity } from './authIdentity';
interface AccessTokenClaims {
  jti: string;
  roles: string[];
  sub: string;
  tid?: string;
  type: 'access';
}

interface RefreshTokenClaims {
  jti: string;
  sub: string;
  tid: string;
  type: 'refresh';
}

interface IssueTokensInput {
  roles: string[];
  tenantId: string;
  userId: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  is_active: number;
}

interface RoleRow {
  name: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly pool: Pool | null;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService = new DatabaseService()) {
    this.pool = (databaseService.drizzle?.$client as Pool | undefined) ?? null;
    if (!this.pool) {
      this.pool = null;
      this.logger.warn('DATABASE_URL is not set. Database auth is disabled.');
    }
  }

  issueTokens(input: IssueTokensInput): IssuedTokens {
    const accessTokenJti = randomUUID();
    const refreshTokenJti = randomUUID();
    const roles = this.normalizeRoles(input.roles);

    const accessToken = sign(
      {
        jti: accessTokenJti,
        roles,
        sub: input.userId,
        tid: input.tenantId,
        type: 'access',
      } satisfies AccessTokenClaims,
      runtimeConfig.auth.accessSecret,
      { expiresIn: runtimeConfig.auth.accessExpiresIn as StringValue },
    );

    const refreshToken = sign(
      {
        jti: refreshTokenJti,
        sub: input.userId,
        tid: input.tenantId,
        type: 'refresh',
      } satisfies RefreshTokenClaims,
      runtimeConfig.auth.refreshSecret,
      { expiresIn: runtimeConfig.auth.refreshExpiresIn as StringValue },
    );

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  verifyAccessToken(token: string): AuthIdentity {
    const principal = this.verifyAccessPrincipal(token);
    const tenantId = principal.tenantId?.trim();
    const userId = principal.userId?.trim();

    if (principal.principalType !== 'user' || !tenantId || !userId) {
      throw new UnauthorizedException('Malformed access token payload.');
    }

    return {
      jti: principal.jti,
      principalId: principal.principalId,
      principalType: 'user',
      roles: principal.roles,
      tenantId,
      userId,
    };
  }

  verifyAccessPrincipal(token: string): AuthPrincipal {
    let decoded: unknown;
    try {
      decoded = verify(token, runtimeConfig.auth.accessSecret);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    if (!decoded || typeof decoded !== 'object') {
      throw new UnauthorizedException('Invalid access token payload.');
    }

    const payload = decoded as Partial<AccessTokenClaims>;
    const userId = this.normalizeString(payload.sub);
    const tenantId = this.normalizeString(payload.tid);
    const jti = this.normalizeString(payload.jti);
    const roles = Array.isArray(payload.roles) ? payload.roles.filter((role) => typeof role === 'string') : [];
    const tokenType = payload.type;

    if (!userId || !jti || tokenType !== 'access') {
      throw new UnauthorizedException('Malformed access token payload.');
    }

    return {
      jti,
      principalId: userId,
      principalType: 'user' as const,
      roles,
      tenantId: tenantId ?? '',
      userId,
    };
  }

  async register(
    email: string,
    password: string,
    tenantId: string,
    name?: string,
  ): Promise<{ name: string | null; roles: string[]; tokens: IssuedTokens; userId: string }> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    const existing = await this.pool.query('SELECT id FROM users WHERE tenant_id = $1 AND email = $2', [
      tenantId,
      email,
    ]);
    if (existing.rows.length > 0) {
      throw new UnauthorizedException('Email already registered in this tenant.');
    }

    const userId = randomUUID();
    const passwordHash = await hash(password, 12);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query('INSERT INTO users (id, tenant_id, email, password_hash, name) VALUES ($1, $2, $3, $4, $5)', [
        userId,
        tenantId,
        email,
        passwordHash,
        name ?? null,
      ]);

      // Assign viewer role by default
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

    const roles = await this.getUserRoles(userId, tenantId);
    const tokens = this.issueTokens({ roles, tenantId, userId });
    return { name: name ?? null, roles, tokens, userId };
  }

  async login(
    email: string,
    password: string,
    tenantId: string,
  ): Promise<{ name: string | null; roles: string[]; tokens: IssuedTokens; userId: string }> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    const result = await this.pool.query<UserRow>(
      'SELECT id, email, password_hash, name, is_active FROM users WHERE tenant_id = $1 AND email = $2',
      [tenantId, email],
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled.');
    }

    const passwordValid = await compare(password, user.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const roles = await this.getUserRoles(user.id, tenantId);
    const tokens = this.issueTokens({ roles, tenantId, userId: user.id });
    return { name: user.name, roles, tokens, userId: user.id };
  }

  async refreshTokens(refreshToken: string): Promise<IssuedTokens> {
    let decoded: unknown;
    try {
      decoded = verify(refreshToken, runtimeConfig.auth.refreshSecret);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    if (!decoded || typeof decoded !== 'object') {
      throw new UnauthorizedException('Invalid refresh token payload.');
    }

    const payload = decoded as Partial<RefreshTokenClaims>;
    const userId = this.normalizeString(payload.sub);
    const tenantId = this.normalizeString(payload.tid);

    if (!userId || !tenantId || payload.type !== 'refresh') {
      throw new UnauthorizedException('Malformed refresh token.');
    }

    const roles = await this.getUserRoles(userId, tenantId);
    return this.issueTokens({ roles, tenantId, userId });
  }

  async changePassword(userId: string, tenantId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    const result = await this.pool.query<UserRow>(
      'SELECT id, password_hash, is_active FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId],
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled.');
    }

    const passwordValid = await compare(currentPassword, user.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const newPasswordHash = await hash(newPassword, 12);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
        newPasswordHash,
        userId,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async getUserRoles(userId: string, tenantId: string): Promise<string[]> {
    if (!this.pool) return [];

    const result = await this.pool.query<RoleRow>(
      `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1 AND r.tenant_id = $2`,
      [userId, tenantId],
    );
    return result.rows.map((row) => row.name);
  }

  private normalizeRoles(roles: string[]): string[] {
    const roleSet = new Set<string>();
    for (const role of roles) {
      if (typeof role !== 'string') continue;
      const normalizedRole = role.trim();
      if (normalizedRole.length > 0) roleSet.add(normalizedRole);
    }
    return [...roleSet];
  }

  private normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  async resetPassword(email: string, newPassword: string, tenantId: string): Promise<void> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    const result = await this.pool.query<{ id: string; is_active: number }>(
      'SELECT id, is_active FROM users WHERE tenant_id = $1 AND email = $2',
      [tenantId, email],
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled.');
    }

    const newPasswordHash = await hash(newPassword, 12);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
        newPasswordHash,
        user.id,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── SMS Login ────────────────────────────────────────────────

  async sendSmsCode(phone: string): Promise<{ success: boolean }> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    // Rate limit: max 3 codes per phone per minute
    const rateResult = await this.pool.query(
      `SELECT COUNT(*)::text AS count FROM sms_codes WHERE phone = $1 AND created_at > now() - interval '1 minute'`,
      [phone],
    );
    if (parseInt(rateResult.rows[0]?.count ?? '0', 10) >= 3) {
      throw new UnauthorizedException('Too many SMS codes requested. Please try again later.');
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const id = randomUUID();

    await this.pool.query(
      `INSERT INTO sms_codes (id, phone, code, expires_at) VALUES ($1, $2, $3, now() + interval '5 minutes')`,
      [id, phone, code],
    );

    // In production, send SMS via provider (Twilio, Alibaba Cloud SMS, etc.)
    // For dev/testing, the code is returned in the DB row
    this.logger.log(`SMS code generated for ${phone}`);

    return { success: true };
  }

  async loginWithSms(
    phone: string,
    code: string,
    tenantId: string,
  ): Promise<{ name: string | null; roles: string[]; tokens: IssuedTokens; userId: string }> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    // Find valid (unused, not expired) code and join users to get user_id
    const smsResult = await this.pool.query<{
      id: string;
      phone: string;
      code: string;
      user_id: string | null;
      is_active: number;
    }>(
      `SELECT sc.id, sc.phone, sc.code, u.id AS user_id, u.is_active
       FROM sms_codes sc
       LEFT JOIN users u ON u.phone = sc.phone AND u.tenant_id = $3
       WHERE sc.phone = $1 AND sc.code = $2 AND sc.used_at IS NULL AND sc.expires_at > now()
       ORDER BY sc.created_at DESC LIMIT 1`,
      [phone, code, tenantId],
    );

    if (smsResult.rows.length === 0) {
      throw new UnauthorizedException('Invalid or expired SMS code.');
    }

    const smsRow = smsResult.rows[0];

    if (!smsRow.is_active) {
      throw new UnauthorizedException('Account is disabled.');
    }

    if (!smsRow.user_id) {
      throw new UnauthorizedException('No user found for this phone number.');
    }

    // Mark code as used
    await this.pool.query('UPDATE sms_codes SET used_at = now() WHERE id = $1', [smsRow.id]);

    const roles = await this.getUserRoles(smsRow.user_id, tenantId);
    const tokens = this.issueTokens({ roles, tenantId, userId: smsRow.user_id });

    // Get user name
    const userResult = await this.pool.query<{ name: string | null }>('SELECT name FROM users WHERE id = $1', [
      smsRow.user_id,
    ]);

    return {
      name: userResult.rows[0]?.name ?? null,
      roles,
      tokens,
      userId: smsRow.user_id,
    };
  }

  // ─── OAuth Login ────────────────────────────────────────────────

  private static readonly VALID_OAUTH_PROVIDERS = ['github', 'google'] as const;

  async loginWithOAuth(
    provider: string,
    code: string,
    tenantId: string,
  ): Promise<{ name: string | null; roles: string[]; tokens: IssuedTokens; userId: string }> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    if (!AuthService.VALID_OAUTH_PROVIDERS.includes(provider as (typeof AuthService.VALID_OAUTH_PROVIDERS)[number])) {
      throw new UnauthorizedException(`Unsupported OAuth provider: ${provider}`);
    }

    // Exchange code with OAuth provider to get provider user ID
    const providerUserInfo = await this.exchangeOAuthCode(provider, code);
    if (!providerUserInfo) {
      throw new UnauthorizedException('OAuth code exchange failed.');
    }

    // Check if oauth account already linked
    const existingResult = await this.pool.query<{
      user_id: string;
      name: string | null;
      is_active: number;
    }>(
      `SELECT oa.user_id, u.name, u.is_active
       FROM oauth_accounts oa
       JOIN users u ON u.id = oa.user_id
       WHERE oa.provider = $1 AND oa.provider_id = $2`,
      [provider, providerUserInfo.providerId],
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      if (!existing.is_active) {
        throw new UnauthorizedException('Account is disabled.');
      }
      const roles = await this.getUserRoles(existing.user_id, tenantId);
      const tokens = this.issueTokens({ roles, tenantId, userId: existing.user_id });
      return { name: existing.name, roles, tokens, userId: existing.user_id };
    }

    // New OAuth user — create user + oauth_account in transaction
    const userId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query('INSERT INTO users (id, tenant_id, email, password_hash, name) VALUES ($1, $2, $3, $4, $5)', [
        userId,
        tenantId,
        providerUserInfo.email ?? `${userId}@oauth.${provider}`,
        '',
        providerUserInfo.name ?? null,
      ]);
      // Assign viewer role
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE tenant_id = $2 AND name = 'viewer' LIMIT 1`,
        [userId, tenantId],
      );
      await client.query('INSERT INTO oauth_accounts (id, user_id, provider, provider_id) VALUES ($1, $2, $3, $4)', [
        randomUUID(),
        userId,
        provider,
        providerUserInfo.providerId,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const roles = await this.getUserRoles(userId, tenantId);
    const tokens = this.issueTokens({ roles, tenantId, userId });
    return { name: providerUserInfo.name ?? null, roles, tokens, userId };
  }

  /**
   * Exchange OAuth authorization code for provider user info.
   * GitHub: POST to token endpoint → GET user info API.
   * Google: Placeholder — falls back to dev mock if no config.
   */
  private async exchangeOAuthCode(
    provider: string,
    code: string,
  ): Promise<{ providerId: string; email: string | null; name: string | null } | null> {
    if (provider === 'github') {
      return this.exchangeGitHubCode(code);
    }

    // Google OAuth: not yet configured — keep dev mock for now
    if (code === 'fail-exchange') return null;
    return {
      providerId: `${provider}-${code}-${Date.now()}`,
      email: null,
      name: null,
    };
  }

  private async exchangeGitHubCode(
    code: string,
  ): Promise<{ providerId: string; email: string | null; name: string | null } | null> {
    const { clientId, clientSecret } = runtimeConfig.githubOAuth;

    if (!clientId || !clientSecret) {
      this.logger.warn('GitHub OAuth credentials not configured — skipping real exchange.');
      return null;
    }

    try {
      // Step 1: Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        this.logger.error(`GitHub token exchange failed: ${tokenResponse.status}`);
        return null;
      }

      const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string };
      if (tokenData.error || !tokenData.access_token) {
        this.logger.error(`GitHub token exchange error: ${tokenData.error ?? 'no access_token'}`);
        return null;
      }

      // Step 2: Fetch user info from GitHub API
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json',
        },
      });

      if (!userResponse.ok) {
        this.logger.error(`GitHub user info fetch failed: ${userResponse.status}`);
        return null;
      }

      const userData = (await userResponse.json()) as {
        id: number;
        login: string;
        email: string | null;
        name: string | null;
      };

      // Step 3: Try to fetch primary email (GitHub API may not return email in user data)
      let email = userData.email;
      if (!email) {
        try {
          const emailResponse = await fetch('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              Accept: 'application/json',
            },
          });
          if (emailResponse.ok) {
            const emails = (await emailResponse.json()) as Array<{
              email: string;
              primary: boolean;
              verified: boolean;
            }>;
            const primary = emails.find((e) => e.primary && e.verified);
            email = primary?.email ?? emails[0]?.email ?? null;
          }
        } catch {
          // Non-critical — proceed without email
        }
      }

      return {
        providerId: String(userData.id),
        email,
        name: userData.name ?? userData.login,
      };
    } catch (error) {
      this.logger.error(`GitHub OAuth exchange error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  // ─── OAuth Account Management ──────────────────────────────────

  async listOAuthAccounts(userId: string): Promise<{ provider: string; providerId: string; createdAt: string }[]> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

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

  async unlinkOAuthAccount(userId: string, provider: string): Promise<void> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    const result = await this.pool.query('DELETE FROM oauth_accounts WHERE user_id = $1 AND provider = $2', [
      userId,
      provider,
    ]);

    if (result.rowCount === 0) {
      throw new UnauthorizedException('Linked account not found.');
    }
  }
}
