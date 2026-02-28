import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sign, verify } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { runtimeConfig } from '../../App/runtimeConfig';
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

@Injectable()
export class AuthService {
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
      {
        expiresIn: runtimeConfig.auth.accessExpiresIn as StringValue,
      },
    );

    const refreshToken = sign(
      {
        jti: refreshTokenJti,
        sub: input.userId,
        tid: input.tenantId,
        type: 'refresh',
      } satisfies RefreshTokenClaims,
      runtimeConfig.auth.refreshSecret,
      {
        expiresIn: runtimeConfig.auth.refreshExpiresIn as StringValue,
      },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
    };
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
    const roles = Array.isArray(payload.roles) ? payload.roles.filter((role) => typeof role === 'string') : [];
    const tokenType = payload.type;

    if (!userId || !tenantId || !jti || tokenType !== 'access') {
      throw new UnauthorizedException('Malformed access token payload.');
    }

    return {
      jti,
      roles,
      tenantId,
      userId,
    };
  }

  private normalizeRoles(roles: string[]): string[] {
    const roleSet = new Set<string>();

    for (const role of roles) {
      if (typeof role !== 'string') {
        continue;
      }

      const normalizedRole = role.trim();
      if (normalizedRole.length > 0) {
        roleSet.add(normalizedRole);
      }
    }

    return [...roleSet];
  }

  private normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }
}
