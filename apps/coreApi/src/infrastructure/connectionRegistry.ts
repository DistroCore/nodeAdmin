import { Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

export interface SocketContext {
  conversationId: string;
  tenantId: string;
  userId: string;
}

@Injectable()
export class ConnectionRegistry {
  /** Maximum concurrent WebSocket connections allowed per tenant. */
  static readonly MAX_CONNECTIONS_PER_TENANT = 5000;

  private readonly logger = new Logger(ConnectionRegistry.name);
  private readonly contextBySocketId = new Map<string, SocketContext>();
  /** Tracks active connection count per tenantId for fast lookup. */
  private readonly countByTenantId = new Map<string, number>();

  get(socketId: string): SocketContext | undefined {
    return this.contextBySocketId.get(socketId);
  }

  /**
   * Register or update a socket's context.
   * Throws WsException if the tenant has reached MAX_CONNECTIONS_PER_TENANT.
   */
  upsert(socketId: string, context: SocketContext): void {
    const existing = this.contextBySocketId.get(socketId);

    // If this socket is switching tenants (edge case), decrement the old tenant count.
    if (existing && existing.tenantId !== context.tenantId) {
      this.decrementTenant(existing.tenantId);
    }

    // Only count new sockets (not re-joins to same or different conversation).
    const isNew = !existing || existing.tenantId !== context.tenantId;
    if (isNew) {
      const current = this.countByTenantId.get(context.tenantId) ?? 0;
      if (current >= ConnectionRegistry.MAX_CONNECTIONS_PER_TENANT) {
        this.logger.warn(
          `Tenant ${context.tenantId} hit connection limit (${ConnectionRegistry.MAX_CONNECTIONS_PER_TENANT}). Rejecting socket ${socketId}.`
        );
        throw new WsException(
          `Connection limit reached for tenant. Maximum ${ConnectionRegistry.MAX_CONNECTIONS_PER_TENANT} concurrent connections allowed.`
        );
      }
      this.countByTenantId.set(context.tenantId, current + 1);
    }

    this.contextBySocketId.set(socketId, context);
  }

  remove(socketId: string): void {
    const existing = this.contextBySocketId.get(socketId);
    if (!existing) {
      return;
    }

    this.contextBySocketId.delete(socketId);
    this.decrementTenant(existing.tenantId);
  }

  /** Returns the current active connection count for a tenant. */
  countByTenant(tenantId: string): number {
    return this.countByTenantId.get(tenantId) ?? 0;
  }

  /** Returns the total number of active connections across all tenants. */
  totalCount(): number {
    let total = 0;
    for (const count of this.countByTenantId.values()) {
      total += count;
    }
    return total;
  }

  /** Returns the total active WebSocket connections across all tenants. */
  totalConnections(): number {
    let total = 0;
    for (const count of this.countByTenantId.values()) {
      total += count;
    }
    return total;
  }

  private decrementTenant(tenantId: string): void {
    const current = this.countByTenantId.get(tenantId) ?? 0;
    if (current <= 1) {
      this.countByTenantId.delete(tenantId);
    } else {
      this.countByTenantId.set(tenantId, current - 1);
    }
  }
}
