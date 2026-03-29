import { Controller, Get, Query } from '@nestjs/common';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { ConnectionRegistry } from '../../infrastructure/connectionRegistry';
import { ConversationRepository } from '../../infrastructure/database/conversationRepository';
import { DatabaseService } from '../../infrastructure/database/databaseService';
import { TenantsService } from '../tenants/tenantsService';
import { CurrentUser } from '../auth/currentUser.decorator';
import type { AuthIdentity } from '../auth/authIdentity';

const eventLoopLagHistogram = monitorEventLoopDelay({
  resolution: 20,
});
eventLoopLagHistogram.enable();

interface ConversationListResponse {
  id: string;
  name: string;
  lastMessagePreview: string;
  unreadCount: number;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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
    private readonly connectionRegistry: ConnectionRegistry,
    private readonly conversationRepository: ConversationRepository,
    private readonly databaseService: DatabaseService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('overview')
  async getOverview() {
    const tenants = await this.tenantsService.list();
    const activeCount = tenants.filter((t: any) => t.is_active).length;
    const onlineConnections = this.connectionRegistry.totalCount();

    let totalUsers = 0;
    try {
      if (this.databaseService.drizzle) {
        const result = await this.databaseService.drizzle.execute(
          { sql: 'SELECT COUNT(*)::int AS count FROM users' } as any,
        );
        totalUsers = Number(result.rows?.[0]?.count ?? 0);
      }
    } catch {
      // DB not available — keep 0
    }

    return {
      stats: [
        { label: 'overview.stat.totalUsers', value: String(totalUsers) },
        { label: 'overview.stat.activeTenants', value: String(activeCount) },
        { label: 'overview.stat.totalTenants', value: String(tenants.length) },
        { label: 'overview.stat.onlineConnections', value: String(onlineConnections) },
        { label: 'overview.stat.uptime', value: formatUptime(process.uptime()) },
      ],
      todos: [],
    };
  }

  @Get('tenants')
  async getTenants() {
    const tenants = await this.tenantsService.list();

    const tenantsWithRoles = await Promise.all(
      tenants.map(async (t: any) => {
        let roleCount = 0;
        try {
          if (this.databaseService.drizzle) {
            const result = await this.databaseService.drizzle.execute(
              { sql: 'SELECT COUNT(*)::int AS count FROM roles WHERE tenant_id = $1', bindings: [t.id] } as any,
            );
            roleCount = Number(result.rows?.[0]?.count ?? 0);
          }
        } catch {
          // DB not available
        }

        return {
          key: t.id,
          name: t.name,
          roleCount,
          status: t.is_active ? 'active' : 'inactive',
        };
      }),
    );

    return { rows: tenantsWithRoles };
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
    @Query('tenantId') tenantId = 'default',
  ): Promise<{ rows: ConversationListResponse[] }> {
    const rows = await this.conversationRepository.listByTenant(tenantId, 50);

    return {
      rows: rows.map((row) => ({
        id: row.conversationId,
        name: row.title,
        lastMessagePreview: row.lastMessageAt?.toISOString() ?? '',
        unreadCount: 0, // TODO: implement unread count in Phase 2
      })),
    };
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
    const isAdmin = roles.includes('admin') || roles.includes('super-admin');

    return {
      permissions: {
        'im:send': isAdmin || roles.includes('im:operator'),
        'im:view': isAdmin || roles.includes('im:operator') || roles.includes('viewer'),
        'overview:view': true,
        'release:view': isAdmin || roles.includes('release:viewer'),
        'settings:view': isAdmin,
        'tenant:view': isAdmin || roles.includes('viewer'),
      },
      roles,
    };
  }

  @Get('audit-logs')
  async getAuditLogs(
    @CurrentUser() identity: AuthIdentity,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const parsedPage = Number(pageRaw);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const parsedPageSize = Number(pageSizeRaw);
    const pageSize = Number.isInteger(parsedPageSize) && parsedPageSize > 0
      ? Math.min(parsedPageSize, 100)
      : 20;

    const { items, total } = await this.auditLogService.listByFilter(
      {
        tenantId: identity.tenantId,
        userId: userId || undefined,
        action: action || undefined,
        targetType: targetType || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
      page,
      pageSize,
    );

    return {
      items,
      page,
      pageSize,
      total,
    };
  }
}
