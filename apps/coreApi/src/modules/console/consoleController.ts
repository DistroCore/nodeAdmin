import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { ConversationRepository } from '../../infrastructure/database/conversationRepository';
import { TenantsService } from '../tenants/tenantsService';

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
    private readonly conversationRepository: ConversationRepository,
    private readonly tenantsService: TenantsService
  ) {}

  @Get('overview')
  async getOverview() {
    const tenants = await this.tenantsService.list();
    const activeCount = tenants.filter((t: any) => t.is_active).length;

    return {
      stats: [
        { label: 'Online connections', value: '—' },
        { label: 'Active tenants', value: String(activeCount) },
        { label: 'Total tenants', value: String(tenants.length) },
        { label: 'API status', value: 'healthy' },
      ],
      todos: [],
    };
  }

  @Get('tenants')
  async getTenants() {
    const tenants = await this.tenantsService.list();
    return {
      rows: tenants.map((t: any) => ({
        key: t.id,
        name: t.name,
        roleCount: 0,
        status: t.is_active ? 'active' : 'inactive',
      })),
    };
  }

  @Get('release-checks')
  getReleaseChecks() {
    return {
      checks: [
        { done: !!process.env.DATABASE_URL, title: 'Database (PostgreSQL) configured' },
        { done: !!process.env.REDIS_URL, title: 'Redis configured' },
        { done: !!process.env.KAFKA_BROKERS, title: 'Kafka configured' },
        { done: !!process.env.JWT_ACCESS_SECRET, title: 'JWT secrets configured' },
        { done: !!process.env.FRONTEND_ORIGINS, title: 'CORS origins configured' },
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
