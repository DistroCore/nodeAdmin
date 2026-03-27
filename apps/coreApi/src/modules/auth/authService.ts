import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { Pool } from 'pg';
import { runtimeConfig } from '../../app/runtimeConfig';
import { AuthIdentity } from './authIdentity';

interface AccessTokenClaims {
  jti: string;
  roles: string[];
  sub: string;
  tid: string;
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

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
      this.logger.warn('DATABASE_URL is not set. Database auth is disabled.');
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  issueTokens(input: IssueTokensInput): IssuedTokens {
    const accessTokenJti = randomUUID();
    const refreshTokenJti = randomUUID();
    const roles = this.normalizeRoles(input.roles);

    const accessToken = sign(
      { jti: accessTokenJti, roles, sub: input.userId, tid: input.tenantId, type: 'access' } satisfies AccessTokenClaims,
      runtimeConfig.auth.accessSecret,
      { expiresIn: runtimeConfig.auth.accessExpiresIn as StringValue }
    );

    const refreshToken = sign(
      { jti: refreshTokenJti, sub: input.userId, tid: input.tenantId, type: 'refresh' } satisfies RefreshTokenClaims,
      runtimeConfig.auth.refreshSecret,
      { expiresIn: runtimeConfig.auth.refreshExpiresIn as StringValue }
    );

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  verifyAccessToken(token: string): AuthIdentity {
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
    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((role) => typeof role === 'string')
      : [];
    const tokenType = payload.type;

    if (!userId || !tenantId || !jti || tokenType !== 'access') {
      throw new UnauthorizedException('Malformed access token payload.');
    }

    return { jti, roles, tenantId, userId };
  }

  async register(email: string, password: string, tenantId: string, name?: string): Promise<{ userId: string; tokens: IssuedTokens }> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    const existing = await this.pool.query(
      'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
      [tenantId, email]
    );
    if (existing.rows.length > 0) {
      throw new UnauthorizedException('Email already registered in this tenant.');
    }

    const userId = randomUUID();
    const passwordHash = await hash(password, 12);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query(
        'INSERT INTO users (id, tenant_id, email, password_hash, name) VALUES ($1, $2, $3, $4, $5)',
        [userId, tenantId, email, passwordHash, name ?? null]
      );

      // Assign viewer role by default
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE tenant_id = $2 AND name = 'viewer' LIMIT 1`,
        [userId, tenantId]
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
    return { userId, tokens };
  }

  async login(email: string, password: string, tenantId: string): Promise<{ userId: string; tokens: IssuedTokens }> {
    if (!this.pool) throw new UnauthorizedException('Database not available.');

    const result = await this.pool.query<UserRow>(
      'SELECT id, email, password_hash, is_active FROM users WHERE tenant_id = $1 AND email = $2',
      [tenantId, email]
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
    return { userId: user.id, tokens };
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

  private async getUserRoles(userId: string, tenantId: string): Promise<string[]> {
    if (!this.pool) return [];

    const result = await this.pool.query<RoleRow>(
      `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1 AND r.tenant_id = $2`,
      [userId, tenantId]
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
}
