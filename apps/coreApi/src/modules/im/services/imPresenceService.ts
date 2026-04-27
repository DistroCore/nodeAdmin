import { Injectable, Logger } from '@nestjs/common';
import { metrics, type ObservableGauge } from '@opentelemetry/api';
import type { ImPresenceStatus } from '@nodeadmin/shared-types';
import { ConnectionRegistry, SocketContext } from '../../../infrastructure/connectionRegistry';

type PresenceStatus = ImPresenceStatus;

interface PresenceStatusChangedEvent {
  conversationId: string;
  status: PresenceStatus;
  tenantId: string;
  userId: string;
}

@Injectable()
export class ImPresenceService {
  private readonly logger = new Logger(ImPresenceService.name);
  private readonly activeTenantIds = new Set<string>();
  private readonly connectionGauge: ObservableGauge;
  private readonly statusByStreamUser = new Map<string, PresenceStatus>();

  constructor(private readonly connectionRegistry: ConnectionRegistry) {
    this.connectionGauge = metrics.getMeter('im-presence').createObservableGauge('im.connections.by_tenant', {
      description: 'Number of active WebSocket connections per tenant',
    });

    this.connectionGauge.addCallback((observableResult) => {
      const staleTenantIds: string[] = [];

      for (const tenantId of this.activeTenantIds) {
        const connectionCount = this.connectionRegistry.countByTenant(tenantId);
        if (connectionCount <= 0) {
          staleTenantIds.push(tenantId);
          continue;
        }

        observableResult.observe(connectionCount, {
          tenantId,
        });
      }

      for (const tenantId of staleTenantIds) {
        this.activeTenantIds.delete(tenantId);
      }
    });
  }

  reportConnectionCount(tenantId: string): void {
    if (!tenantId.trim()) {
      this.logger.warn('Skipping connection metric report because tenantId is empty.');
      return;
    }

    this.activeTenantIds.add(tenantId);
  }

  createJoinedEvent(context: SocketContext): {
    conversationId: string;
    event: 'joined';
    tenantId: string;
    userId: string;
  } {
    this.reportConnectionCount(context.tenantId);

    return {
      conversationId: context.conversationId,
      event: 'joined',
      tenantId: context.tenantId,
      userId: context.userId,
    };
  }

  createLeftEvent(context: SocketContext): {
    conversationId: string;
    event: 'left';
    tenantId: string;
    userId: string;
  } {
    this.reportConnectionCount(context.tenantId);
    this.clearStatus(context.tenantId, context.conversationId, context.userId);

    return {
      conversationId: context.conversationId,
      event: 'left',
      tenantId: context.tenantId,
      userId: context.userId,
    };
  }

  setStatus(
    tenantId: string,
    conversationId: string,
    userId: string,
    status: PresenceStatus,
  ): PresenceStatusChangedEvent {
    const key = this.toStatusKey(tenantId, conversationId, userId);
    this.statusByStreamUser.set(key, status);

    return {
      conversationId,
      status,
      tenantId,
      userId,
    };
  }

  getStatus(tenantId: string, conversationId: string, userId: string): PresenceStatus {
    const key = this.toStatusKey(tenantId, conversationId, userId);
    return this.statusByStreamUser.get(key) ?? 'online';
  }

  private clearStatus(tenantId: string, conversationId: string, userId: string): void {
    const key = this.toStatusKey(tenantId, conversationId, userId);
    this.statusByStreamUser.delete(key);
  }

  private toStatusKey(tenantId: string, conversationId: string, userId: string): string {
    return `${tenantId}::${conversationId}::${userId}`;
  }
}
