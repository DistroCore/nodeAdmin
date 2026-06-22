import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { runtimeConfig } from '../../app/runtimeConfig';
import { OAuthAccountRepository } from '../../infrastructure/database/oauthAccountRepository';
import { SmsCodeRepository } from '../../infrastructure/database/smsCodeRepository';
import { UserRepository } from '../../infrastructure/database/userRepository';
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly oauthAccountRepository: OAuthAccountRepository,
    private readonly smsCodeRepository: SmsCodeRepository,
  ) {}

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
    const existing = await this.userRepository.findByEmail(tenantId, email);
    if (existing) {
      throw new UnauthorizedException('Email already registered in this tenant.');
    }

    const userId = randomUUID();
    const passwordHash = await hash(password, 12);

    // Insert the user and grant the default 'viewer' role atomically. Both writes live in the
    // user aggregate (users + user_roles), so the repository owns this as a single transaction.
    await this.userRepository.createUserWithDefaultRole(tenantId, userId, email, passwordHash, name ?? null);

    const roles = await this.userRepository.getRoleNames(userId, tenantId);
    const tokens = this.issueTokens({ roles, tenantId, userId });
    return { name: name ?? null, roles, tokens, userId };
  }

  async login(
    email: string,
    password: string,
    tenantId: string,
  ): Promise<{ name: string | null; roles: string[]; tokens: IssuedTokens; userId: string }> {
    const user = await this.userRepository.findByEmail(tenantId, email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled.');
    }

    const passwordValid = await compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const roles = await this.userRepository.getRoleNames(user.id, tenantId);
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

    // Guard against disabled users refreshing: previously a disabled account could keep minting
    // fresh access tokens for the full 7-day refresh lifetime, because refreshTokens never
    // re-checked is_active. Access tokens still expire naturally (default 15m); this closes the
    // long-lived refresh loophole.
    const user = await this.userRepository.findById(tenantId, userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is disabled.');
    }

    const roles = await this.userRepository.getRoleNames(userId, tenantId);
    return this.issueTokens({ roles, tenantId, userId });
  }

  async changePassword(userId: string, tenantId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(tenantId, userId);
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled.');
    }

    const passwordValid = await compare(currentPassword, user.passwordHash);
    if (!passwordValid) {
      // A wrong *current* password is invalid request input, not an authentication failure: the
      // caller IS authenticated. Returning 400 (not 401) also stops the apiClient from treating it
      // as an expired session and triggering a token-refresh-and-retry dance.
      throw new BadRequestException('Current password is incorrect.');
    }

    const newPasswordHash = await hash(newPassword, 12);
    await this.userRepository.updatePassword(tenantId, userId, newPasswordHash);
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

  async resetPassword(email: string, newPassword: string, tenantId: string): Promise<string> {
    const user = await this.userRepository.findByEmail(tenantId, email);
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled.');
    }

    const newPasswordHash = await hash(newPassword, 12);
    await this.userRepository.updatePassword(tenantId, user.id, newPasswordHash);

    return user.id;
  }

  // ─── SMS Login ────────────────────────────────────────────────

  async sendSmsCode(phone: string): Promise<{ success: boolean }> {
    // Rate limit: max 3 codes per phone per 60s
    const recentCount = await this.smsCodeRepository.countRecentByPhone(phone, 60_000);
    if (recentCount >= 3) {
      throw new UnauthorizedException('Too many SMS codes requested. Please try again later.');
    }

    // Cryptographically secure 6-digit code. Math.random() is not CSPRNG and is theoretically
    // predictable — replaced as part of closing TD-7 before any real SMS provider integration.
    const code = String(randomInt(100000, 1000000));
    const id = randomUUID();

    // Codes expire 5 minutes after issue.
    await this.smsCodeRepository.insert(id, phone, code, 5 * 60 * 1000);

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
    const smsRow = await this.smsCodeRepository.findValidByPhoneAndCode(phone, code, tenantId);

    if (!smsRow) {
      throw new UnauthorizedException('Invalid or expired SMS code.');
    }

    if (!smsRow.isActive) {
      throw new UnauthorizedException('Account is disabled.');
    }

    if (!smsRow.userId) {
      throw new UnauthorizedException('No user found for this phone number.');
    }

    // Mark code as used
    await this.smsCodeRepository.markUsed(smsRow.id);

    const roles = await this.userRepository.getRoleNames(smsRow.userId, tenantId);
    const tokens = this.issueTokens({ roles, tenantId, userId: smsRow.userId });

    const name = await this.userRepository.findNameById(smsRow.userId);

    return {
      name,
      roles,
      tokens,
      userId: smsRow.userId,
    };
  }

  // ─── OAuth Login ────────────────────────────────────────────────

  private static readonly VALID_OAUTH_PROVIDERS = ['github', 'google'] as const;

  async loginWithOAuth(
    provider: string,
    code: string,
    tenantId: string,
  ): Promise<{ name: string | null; roles: string[]; tokens: IssuedTokens; userId: string }> {
    if (!AuthService.VALID_OAUTH_PROVIDERS.includes(provider as (typeof AuthService.VALID_OAUTH_PROVIDERS)[number])) {
      throw new UnauthorizedException(`Unsupported OAuth provider: ${provider}`);
    }

    // Exchange code with OAuth provider to get provider user ID
    const providerUserInfo = await this.exchangeOAuthCode(provider, code);
    if (!providerUserInfo) {
      throw new UnauthorizedException('OAuth code exchange failed.');
    }

    // Check if oauth account already linked
    const existing = await this.oauthAccountRepository.findByProvider(provider, providerUserInfo.providerId);

    if (existing) {
      if (!existing.isActive) {
        throw new UnauthorizedException('Account is disabled.');
      }
      const roles = await this.userRepository.getRoleNames(existing.userId, tenantId);
      const tokens = this.issueTokens({ roles, tenantId, userId: existing.userId });
      return { name: existing.name, roles, tokens, userId: existing.userId };
    }

    // New OAuth user — create user + default role + oauth_account in ONE transaction.
    // This spans two repositories (users aggregate + oauth_accounts), so the service orchestrates
    // the transaction via UserRepository.acquireClient. The repositories' insert methods accept the
    // shared client to participate in this transaction.
    const userId = randomUUID();
    const client = await this.userRepository.acquireClient(tenantId);
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, name) VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          tenantId,
          providerUserInfo.email ?? `${userId}@oauth.${provider}`,
          '',
          providerUserInfo.name ?? null,
        ],
      );
      await this.userRepository.assignDefaultRole(tenantId, userId, client);
      await this.oauthAccountRepository.insert(
        tenantId,
        randomUUID(),
        userId,
        provider,
        providerUserInfo.providerId,
        client,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const roles = await this.userRepository.getRoleNames(userId, tenantId);
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
    return this.oauthAccountRepository.listByUserId(userId);
  }

  async unlinkOAuthAccount(userId: string, provider: string): Promise<void> {
    const removed = await this.oauthAccountRepository.deleteByUserAndProvider(userId, provider);

    if (removed === 0) {
      throw new UnauthorizedException('Linked account not found.');
    }
  }
}
