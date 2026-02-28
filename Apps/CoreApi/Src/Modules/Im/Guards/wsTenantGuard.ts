import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthService } from '../../Auth/authService';

@Injectable()
export class WsTenantGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<Socket>();
    const token = this.extractAccessToken(client);
    if (!token) {
      throw new WsException('Missing access token.');
    }

    const identity = this.authService.verifyAccessToken(token);
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
}
