import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { count, desc, eq, gte, ne } from 'drizzle-orm';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { ConnectionRegistry } from '../../infrastructure/connectionRegistry';
import { ConversationRepository } from '../../infrastructure/database/conversationRepository';
import { DatabaseService } from '../../infrastructure/database/databaseService';
import { backlogTasks, conversations, messages, roles } from '../../infrastructure/database/schema';
import { TenantsService, type TenantRecord } from '../tenants/tenantsService';
import { CurrentUser } from '../auth/currentUser.decorator';
import type { AuthIdentity } from '../auth/authIdentity';

const eventLoopLagHistogram = monitorEventLoopDelay({
  resolution: 20,
});
eventLoopLagHistogram.enable();

interface ConversationListResponse {
  id: string;
  name: string;
  title: string | null;
  type: 'dm' | 'group';
  lastMessagePreview: string;
  unreadCount: number;
}

interface RecentMessageResponse {
  content: string;
  conversationId: string;
  createdAt: Date;
  id: string;
  userId: string;
}

interface RecentMessagesPage {
  items: RecentMessageResponse[];
  total: number;
}

interface OverviewTodoInput {
  activeTenantCount: number | null;
  onlineUserCount: number;
  todayMessages: number | null;
  totalConversations: number | null;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

@ApiTags('metrics')
@Controller()
export class MetricsController {
  @Get('metrics')
  @ApiOperation({ summary: 'Get system metrics (CPU, memory, event loop)' })
  getMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const eventLoopLagMsRaw = eventLoopLagHistogram.mean / 1_000_000;
    const eventLoopLagMs = Number.isFinite(eventLoopLagMsRaw) ? Number(eventLoopLagMsRaw.toFixed(3)) : 0;

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

@ApiTags('console')
@ApiBearerAuth()
@Controller('console')
export class ConsoleController {
  private readonly logger = new Logger(ConsoleController.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly connectionRegistry: ConnectionRegistry,
    private readonly conversationRepository: ConversationRepository,
    private readonly databaseService: DatabaseService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get dashboard overview stats' })
  async getOverview() {
    let activeCount: number | null = null;
    try {
      const tenants = await this.tenantsService.list();
      activeCount = tenants.filter((tenant) => tenant.is_active).length;
    } catch (error) {
      this.logger.warn(`Failed to load active tenant count for overview: ${this.formatError(error)}`);
    }

    const onlineUsers = this.connectionRegistry.totalUniqueUsers();
    const [totalConversations, todayMessages] = await Promise.all([
      this.countAllConversations(),
      this.countTodayMessages(),
    ]);
    const todos = await this.buildOverviewTodos({
      activeTenantCount: activeCount,
      onlineUserCount: onlineUsers,
      todayMessages,
      totalConversations,
    });

    return {
      stats: [
        { label: 'overview.stat.onlineUsers', value: String(onlineUsers) },
        {
          label: 'overview.stat.totalConversations',
          value: this.formatMetricValue(totalConversations),
        },
        { label: 'overview.stat.todayMessages', value: this.formatMetricValue(todayMessages) },
        { label: 'overview.stat.activeTenants', value: this.formatMetricValue(activeCount) },
        { label: 'overview.stat.uptime', value: formatUptime(process.uptime()) },
      ],
      todos,
    };
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List tenants with role counts' })
  async getTenants() {
    const tenants = await this.tenantsService.list();

    const tenantsWithRoles = await Promise.all(
      tenants.map(async (tenant) => {
        const roleCount = await this.countRolesForTenant(tenant.id);
        return {
          key: tenant.id,
          name: tenant.name,
          roleCount,
          status: tenant.is_active ? 'active' : 'inactive',
        };
      }),
    );

    return { rows: tenantsWithRoles };
  }

  @Get('release-checks')
  @ApiOperation({ summary: 'Get infrastructure release readiness checks' })
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
  @ApiOperation({ summary: 'List recent conversations' })
  async getConversations(
    @CurrentUser() identity: AuthIdentity,
    @Query('tenantId') tenantId?: string,
  ): Promise<{ rows: ConversationListResponse[] }> {
    const effectiveTenantId = tenantId ?? identity.tenantId;
    const rows = await this.conversationRepository.listByMember(effectiveTenantId, identity.userId, 50);

    return {
      rows: rows.map((row) => ({
        id: row.conversationId,
        name: row.title ?? row.conversationId,
        title: row.title,
        type: row.type,
        lastMessagePreview: row.lastMessageAt?.toISOString() ?? '',
        unreadCount: 0,
      })),
    };
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Get permission map for given roles' })
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
        'users:view': isAdmin || roles.includes('viewer'),
        'users:manage': isAdmin,
        'roles:view': isAdmin || roles.includes('viewer'),
        'roles:manage': isAdmin,
        'audit:view': isAdmin || roles.includes('viewer'),
        'menus:view': isAdmin,
        'menus:manage': isAdmin,
        'tenants:view': isAdmin || roles.includes('viewer'),
        'release:view': isAdmin || roles.includes('release:viewer'),
        'settings:view': isAdmin,
        'modernizer:view': isAdmin,
        'backlog:view': isAdmin || roles.includes('viewer'),
        'backlog:manage': isAdmin,
      },
      roles,
    };
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Query audit logs with filtering and pagination' })
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
    const pageSize = Number.isInteger(parsedPageSize) && parsedPageSize > 0 ? Math.min(parsedPageSize, 100) : 20;

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

  @Get('recent-messages')
  @ApiOperation({ summary: 'Get globally recent messages for dashboard' })
  async getRecentMessages(
    @CurrentUser() identity: AuthIdentity,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    const page = this.normalizePage(pageRaw);
    const pageSize = this.normalizePageSize(pageSizeRaw, 10);
    const { items, total } = await this.listRecentMessages(identity.tenantId, page, pageSize);

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  private async countAllConversations(): Promise<number | null> {
    if (!this.databaseService.drizzle) {
      return null;
    }

    try {
      const result = await this.databaseService.drizzle.select({ total: count() }).from(conversations);

      return Number(result[0]?.total ?? 0);
    } catch (error) {
      this.logger.warn(`Failed to count conversations for overview statistics: ${this.formatError(error)}`);
      return null;
    }
  }

  private async countTodayMessages(): Promise<number | null> {
    if (!this.databaseService.drizzle) {
      return null;
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    try {
      const result = await this.databaseService.drizzle
        .select({ total: count() })
        .from(messages)
        .where(gte(messages.createdAt, startOfToday));

      return Number(result[0]?.total ?? 0);
    } catch (error) {
      this.logger.warn(`Failed to count today's messages for overview statistics: ${this.formatError(error)}`);
      return null;
    }
  }

  private async countRolesForTenant(tenantId: TenantRecord['id']): Promise<number> {
    if (!this.databaseService.drizzle) {
      return 0;
    }

    try {
      const result = await this.databaseService.drizzle
        .select({ total: count() })
        .from(roles)
        .where(eq(roles.tenantId, tenantId));

      return Number(result[0]?.total ?? 0);
    } catch {
      return 0;
    }
  }

  private async listRecentMessages(
    tenantId: AuthIdentity['tenantId'],
    page: number,
    pageSize: number,
  ): Promise<RecentMessagesPage> {
    if (!this.databaseService.drizzle) {
      return { items: [], total: 0 };
    }

    try {
      const [items, totalResult] = await Promise.all([
        this.databaseService.drizzle
          .select({
            content: messages.content,
            conversationId: messages.conversationId,
            createdAt: messages.createdAt,
            id: messages.messageId,
            userId: messages.userId,
          })
          .from(messages)
          .where(eq(messages.tenantId, tenantId))
          .orderBy(desc(messages.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        this.databaseService.drizzle.select({ total: count() }).from(messages).where(eq(messages.tenantId, tenantId)),
      ]);

      return {
        items,
        total: Number(totalResult[0]?.total ?? 0),
      };
    } catch (error) {
      this.logger.warn(`Failed to list recent messages for tenant ${tenantId}: ${this.formatError(error)}`);
      return { items: [], total: 0 };
    }
  }

  private async buildOverviewTodos(input: OverviewTodoInput): Promise<string[]> {
    const todos = [...(await this.listBacklogTodos()), ...this.buildOperationalTodos(input)];

    return [...new Set(todos)].slice(0, 5);
  }

  private async listBacklogTodos(): Promise<string[]> {
    if (!this.databaseService.drizzle) {
      return [];
    }

    try {
      const rows = await this.databaseService.drizzle
        .select({
          title: backlogTasks.title,
        })
        .from(backlogTasks)
        .where(ne(backlogTasks.status, 'done'))
        .orderBy(desc(backlogTasks.createdAt))
        .limit(3);

      return rows.map((row) => `Backlog: ${row.title}`);
    } catch (error) {
      this.logger.warn(`Failed to load backlog todos for overview: ${this.formatError(error)}`);
      return [];
    }
  }

  private buildOperationalTodos(input: OverviewTodoInput): string[] {
    const todos: string[] = [];

    const missingChecks = this.getReleaseChecks()
      .checks.filter((check) => !check.done)
      .map((check) => `Release readiness: ${check.title}`);
    todos.push(...missingChecks);

    if (input.activeTenantCount === null) {
      todos.push('Investigate tenant service availability for overview metrics');
    } else if (input.activeTenantCount === 0) {
      todos.push('No active tenants are enabled right now');
    }

    if (input.totalConversations === null) {
      todos.push('Investigate conversation statistics query failures');
    } else if (input.totalConversations === 0) {
      todos.push('No conversations have been created yet');
    }

    if (input.todayMessages === null) {
      todos.push("Investigate today's message statistics query failures");
    } else if (input.todayMessages === 0) {
      todos.push('No messages have been sent today');
    }

    if (input.onlineUserCount === 0) {
      todos.push('No online users are currently connected');
    }

    return todos;
  }

  private formatMetricValue(value: number | null): string {
    return value === null ? 'N/A' : String(value);
  }

  private normalizePage(rawValue?: string): number {
    const page = Number(rawValue);
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  private normalizePageSize(rawValue?: string, defaultValue = 20): number {
    const pageSize = Number(rawValue);
    if (!Number.isInteger(pageSize) || pageSize <= 0) {
      return defaultValue;
    }

    return Math.min(pageSize, 100);
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
