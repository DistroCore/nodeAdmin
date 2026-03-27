import { Injectable, Logger } from '@nestjs/common';
import { metrics, type ObservableGauge } from '@opentelemetry/api';
import { ConnectionRegistry, SocketContext } from '../../../infrastructure/connectionRegistry';

@Injectable()
export class ImPresenceService {
  private readonly logger = new Logger(ImPresenceService.name);
  private readonly activeTenantIds = new Set<string>();
  private readonly connectionGauge: ObservableGauge;

  constructor(private readonly connectionRegistry: ConnectionRegistry) {
    this.connectionGauge = metrics
      .getMeter('im-presence')
      .createObservableGauge('im.connections.by_tenant', {
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

    return {
      conversationId: context.conversationId,
      event: 'left',
      tenantId: context.tenantId,
      userId: context.userId,
    };
  }
}
