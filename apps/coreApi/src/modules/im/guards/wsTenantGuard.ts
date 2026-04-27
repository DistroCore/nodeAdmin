import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import type { AuthPrincipal } from '../../../infrastructure/tenant/authPrincipal';
import { TenantContextResolver } from '../../../infrastructure/tenant/tenantContextResolver';
import type { AuthIdentity } from '../../auth/authIdentity';
import { AuthService } from '../../auth/authService';

@Injectable()
export class WsTenantGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantContextResolver: TenantContextResolver,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<Socket>();
    const token = this.extractAccessToken(client);
    if (!token) {
      throw new WsException('Missing access token.');
    }

    const principal = this.authService.verifyAccessPrincipal(token);
    const identity = this.toAuthIdentity(principal);
    client.data.identity = identity;

    const data = context.switchToWs().getData<Partial<{ tenantId: string; userId: string }>>();

    if (typeof data.tenantId === 'string' && data.tenantId !== identity.tenantId) {
      throw new WsException('Tenant mismatch between auth and event payload.');
    }

    if (typeof data.userId === 'string' && data.userId !== identity.userId) {
      throw new WsException('User mismatch between auth and event payload.');
    }

    return true;
  }

  private extractAccessToken(client: Socket): string | null {
    const fromSocketAuth = this.toAuthValue(client.handshake.auth?.token);
    if (fromSocketAuth) {
      return fromSocketAuth;
    }

    const authorizationHeader = client.handshake.headers.authorization;
    if (typeof authorizationHeader !== 'string') {
      return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer') {
      return null;
    }

    return this.toAuthValue(token);
  }

  private toAuthValue(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  private toAuthIdentity(principal: AuthPrincipal): AuthIdentity {
    let tenantId: string;

    try {
      tenantId = this.tenantContextResolver.resolve(principal).tenantId;
    } catch (error) {
      throw new WsException(error instanceof Error ? error.message : 'Tenant context could not be resolved.');
    }

    const userId = principal.userId?.trim() || principal.principalId.trim();
    if (principal.principalType !== 'user' || userId.length === 0) {
      throw new WsException('Unsupported principal type for WebSocket requests.');
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
}
