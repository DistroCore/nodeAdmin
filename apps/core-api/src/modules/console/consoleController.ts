import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { ConversationRepository } from '../../infrastructure/database/conversationRepository';

const eventLoopLagHistogram = monitorEventLoopDelay({
  resolution: 20,
});
eventLoopLagHistogram.enable();

interface ConversationListResponse {
  conversationId: string;
  title: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

@Controller()
export class MetricsController {
  @Get('metrics')
  getMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const eventLoopLagMsRaw = eventLoopLagHistogram.mean / 1_000_000;
    const eventLoopLagMs = Number.isFinite(eventLoopLagMsRaw)
      ? Number(eventLoopLagMsRaw.toFixed(3))
      : 0;

    return {
      cpu: {
        system: cpuUsage.system,
        user: cpuUsage.user,
      },
      memory: {
        external: memUsage.external,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        rss: memUsage.rss,
      },
      eventLoopLagMs,
      uptime: process.uptime(),
    };
  }
}

@Controller('console')
export class ConsoleController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly conversationRepository: ConversationRepository
  ) {}

  @Get('overview')
  getOverview() {
    return {
      stats: [
        { label: 'Online connections', value: '1,284' },
        { label: 'Active tenants', value: '37' },
        { label: 'Messages per minute', value: '42,900' },
        { label: 'Release success rate', value: '99.92%' },
      ],
      todos: [],
    };
  }

  @Get('tenants')
  getTenants() {
    return {
      rows: [
        {
          key: 'tenant-cn-001',
          name: 'East Region Business Unit',
          roleCount: 12,
          status: 'active',
        },
        {
          key: 'tenant-cn-002',
          name: 'South Region Business Unit',
          roleCount: 9,
          status: 'active',
        },
        { key: 'tenant-cn-003', name: 'Overseas Business Unit', roleCount: 7, status: 'review' },
      ],
    };
  }

  @Get('release-checks')
  getReleaseChecks() {
    return {
      checks: [
        { done: true, title: 'CoreApi build passes' },
        { done: true, title: 'AdminPortal build passes' },
        { done: true, title: 'Outbox + Kafka integration verified' },
        { done: false, title: 'Phase 2: 10k concurrent load test passes' },
        { done: false, title: 'Phase 2: Cross-tenant penetration test passes' },
      ],
    };
  }

  @Get('conversations')
  async getConversations(
    @Query('tenantId') tenantId = 'tenant-demo'
  ): Promise<ConversationListResponse[]> {
    const rows = await this.conversationRepository.listByTenant(tenantId, 50);

    return rows.map((row) => ({
      conversationId: row.conversationId,
      title: row.title,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      unreadCount: 0, // TODO: implement unread count in Phase 2
    }));
  }

  @Get('permissions')
  getPermissions(@Query('roles') rolesRaw?: string) {
    const roles =
      typeof rolesRaw === 'string'
        ? rolesRaw
            .split(',')
            .map((role) => role.trim())
            .filter(Boolean)
        : [];
    const isAdmin = roles.includes('tenant:admin');

    return {
      permissions: {
        'im:send': isAdmin || roles.includes('im:operator'),
        'im:view': isAdmin || roles.includes('im:operator') || roles.includes('tenant:viewer'),
        'overview:view': true,
        'release:view': isAdmin || roles.includes('release:viewer'),
        'settings:view': isAdmin,
        'tenant:view': isAdmin || roles.includes('tenant:viewer'),
      },
      roles,
    };
  }

  @Get('audit-logs')
  async getAuditLogs(
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
    @Query('tenantId') tenantId?: string
  ): Promise<{ rows: Awaited<ReturnType<AuditLogService['listByTenant']>> }> {
    if (!tenantId || tenantId.trim().length === 0) {
      throw new BadRequestException('tenantId query parameter is required.');
    }

    const parsedLimit = Number(limitRaw);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

    const parsedOffset = Number(offsetRaw);
    const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

    return {
      rows: await this.auditLogService.listByTenant(tenantId, Math.min(limit, 200), offset),
    };
  }
}
