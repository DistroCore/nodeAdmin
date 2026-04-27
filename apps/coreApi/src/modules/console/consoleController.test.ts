import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MetricsController, ConsoleController } from './consoleController';

function createMockAuditLogService() {
  return {
    listByFilter: vi.fn(),
  };
}

function createMockConnectionRegistry() {
  return {
    totalCount: vi.fn(),
    totalUniqueUsers: vi.fn(),
  };
}

function createMockConversationRepository() {
  return {
    listByMember: vi.fn(),
  };
}

function createMockDatabaseService() {
  return {
    drizzle: null,
  };
}

function createMockTenantsService() {
  return {
    list: vi.fn(),
  };
}

describe('MetricsController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns CPU, memory, event loop, and uptime metrics', () => {
    vi.spyOn(process, 'cpuUsage').mockReturnValue({ system: 200, user: 100 });
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      arrayBuffers: 0,
      external: 30,
      heapTotal: 20,
      heapUsed: 10,
      rss: 40,
    });
    vi.spyOn(process, 'uptime').mockReturnValue(123);

    const controller = new MetricsController();
    const result = controller.getMetrics();

    expect(result.cpu).toEqual({ system: 200, user: 100 });
    expect(result.memory).toEqual({
      external: 30,
      heapTotal: 20,
      heapUsed: 10,
      rss: 40,
    });
    expect(result.uptime).toBe(123);
    expect(typeof result.eventLoopLagMs).toBe('number');
  });
});

describe('ConsoleController', () => {
  let controller: ConsoleController;
  let auditLogService: ReturnType<typeof createMockAuditLogService>;
  let connectionRegistry: ReturnType<typeof createMockConnectionRegistry>;
  let conversationRepository: ReturnType<typeof createMockConversationRepository>;
  let databaseService: ReturnType<typeof createMockDatabaseService>;
  let tenantsService: ReturnType<typeof createMockTenantsService>;

  beforeEach(() => {
    auditLogService = createMockAuditLogService();
    connectionRegistry = createMockConnectionRegistry();
    conversationRepository = createMockConversationRepository();
    databaseService = createMockDatabaseService();
    tenantsService = createMockTenantsService();

    controller = new ConsoleController(
      auditLogService as never,
      connectionRegistry as never,
      conversationRepository as never,
      databaseService as never,
      tenantsService as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns overview statistics', async () => {
    tenantsService.list.mockResolvedValue([
      { id: 'tenant-1', is_active: true },
      { id: 'tenant-2', is_active: false },
    ]);
    connectionRegistry.totalUniqueUsers.mockReturnValue(3);
    vi.spyOn(controller as never, 'countAllConversations').mockResolvedValue(10);
    vi.spyOn(controller as never, 'countTodayMessages').mockResolvedValue(25);
    vi.spyOn(controller as never, 'buildOverviewTodos').mockResolvedValue(['Follow up high-priority backlog tasks']);
    vi.spyOn(process, 'uptime').mockReturnValue(7500);

    const result = await controller.getOverview();

    expect(result).toEqual({
      stats: [
        { label: 'overview.stat.onlineUsers', value: '3' },
        { label: 'overview.stat.totalConversations', value: '10' },
        { label: 'overview.stat.todayMessages', value: '25' },
        { label: 'overview.stat.activeTenants', value: '1' },
        { label: 'overview.stat.uptime', value: expect.any(String) },
      ],
      todos: ['Follow up high-priority backlog tasks'],
    });
  });

  it('keeps overview responsive when tenant loading fails and surfaces an actionable todo', async () => {
    tenantsService.list.mockRejectedValue(new Error('tenants unavailable'));
    connectionRegistry.totalUniqueUsers.mockReturnValue(0);
    vi.spyOn(controller as never, 'countAllConversations').mockResolvedValue(7);
    vi.spyOn(controller as never, 'countTodayMessages').mockResolvedValue(0);
    vi.spyOn(controller as never, 'buildOverviewTodos').mockResolvedValue([
      'Investigate tenant service availability for overview metrics',
    ]);
    vi.spyOn(process, 'uptime').mockReturnValue(120);

    const result = await controller.getOverview();

    expect(result).toEqual({
      stats: [
        { label: 'overview.stat.onlineUsers', value: '0' },
        { label: 'overview.stat.totalConversations', value: '7' },
        { label: 'overview.stat.todayMessages', value: '0' },
        { label: 'overview.stat.activeTenants', value: 'N/A' },
        { label: 'overview.stat.uptime', value: expect.any(String) },
      ],
      todos: ['Investigate tenant service availability for overview metrics'],
    });
  });

  it('returns tenants with per-tenant role counts', async () => {
    tenantsService.list.mockResolvedValue([
      { id: 'tenant-1', is_active: true, name: 'Tenant One' },
      { id: 'tenant-2', is_active: false, name: 'Tenant Two' },
    ]);
    vi.spyOn(controller as never, 'countRolesForTenant')
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);

    const result = await controller.getTenants();

    expect(result).toEqual({
      rows: [
        { key: 'tenant-1', name: 'Tenant One', roleCount: 3, status: 'active' },
        { key: 'tenant-2', name: 'Tenant Two', roleCount: 0, status: 'inactive' },
      ],
    });
  });

  it('returns release readiness checks from environment configuration', () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      FRONTEND_ORIGINS: process.env.FRONTEND_ORIGINS,
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
      KAFKA_BROKERS: process.env.KAFKA_BROKERS,
      REDIS_URL: process.env.REDIS_URL,
    };

    process.env.DATABASE_URL = 'postgres://db';
    process.env.REDIS_URL = '';
    process.env.KAFKA_BROKERS = 'kafka:9092';
    process.env.JWT_ACCESS_SECRET = 'secret';
    process.env.FRONTEND_ORIGINS = 'http://localhost:3000';

    try {
      expect(controller.getReleaseChecks()).toEqual({
        checks: [
          { done: true, title: 'Database (PostgreSQL) configured' },
          { done: false, title: 'Redis configured' },
          { done: true, title: 'Kafka configured' },
          { done: true, title: 'JWT secrets configured' },
          { done: true, title: 'CORS origins configured' },
        ],
      });
    } finally {
      process.env.DATABASE_URL = previousEnv.DATABASE_URL;
      process.env.REDIS_URL = previousEnv.REDIS_URL;
      process.env.KAFKA_BROKERS = previousEnv.KAFKA_BROKERS;
      process.env.JWT_ACCESS_SECRET = previousEnv.JWT_ACCESS_SECRET;
      process.env.FRONTEND_ORIGINS = previousEnv.FRONTEND_ORIGINS;
    }
  });

  it('returns recent conversations for the authenticated tenant when query tenantId is omitted', async () => {
    conversationRepository.listByMember.mockResolvedValue([
      {
        conversationId: 'conversation-1',
        createdAt: new Date('2026-03-30T09:00:00.000Z'),
        creatorId: 'user-1',
        lastMessageAt: new Date('2026-03-30T10:00:00.000Z'),
        tenantId: 'tenant-9',
        title: 'General',
        type: 'group',
        updatedAt: new Date('2026-03-30T10:00:00.000Z'),
      },
    ]);

    const result = await controller.getConversations({
      jti: 'jti-1',
      roles: ['viewer'],
      tenantId: 'tenant-9',
      userId: 'user-1',
    });

    expect(conversationRepository.listByMember).toHaveBeenCalledWith('tenant-9', 'user-1', 50);
    expect(result).toEqual({
      rows: [
        {
          id: 'conversation-1',
          lastMessagePreview: '2026-03-30T10:00:00.000Z',
          name: 'General',
          title: 'General',
          type: 'group',
          unreadCount: 0,
        },
      ],
    });
  });

  it('allows an explicit tenantId query for conversations', async () => {
    conversationRepository.listByMember.mockResolvedValue([]);

    await controller.getConversations(
      {
        jti: 'jti-1',
        roles: ['admin'],
        tenantId: 'tenant-auth',
        userId: 'user-1',
      },
      'tenant-query',
    );

    expect(conversationRepository.listByMember).toHaveBeenCalledWith('tenant-query', 'user-1', 50);
  });

  it('returns the permission map for parsed role input', () => {
    expect(controller.getPermissions('viewer, im:operator')).toEqual({
      permissions: {
        'im:send': true,
        'im:view': true,
        'overview:view': true,
        'users:view': true,
        'users:manage': false,
        'roles:view': true,
        'roles:manage': false,
        'audit:view': true,
        'menus:view': false,
        'menus:manage': false,
        'tenants:view': true,
        'release:view': false,
        'settings:view': false,
        'modernizer:view': false,
        'backlog:view': true,
        'backlog:manage': false,
      },
      roles: ['viewer', 'im:operator'],
    });
  });

  it('returns filtered audit logs with normalized pagination', async () => {
    auditLogService.listByFilter.mockResolvedValue({
      items: [{ id: 'log-1', action: 'auth.login' }],
      total: 1,
    });

    const result = await controller.getAuditLogs(
      {
        jti: 'jti-1',
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      },
      '2',
      '150',
      'user-9',
      'auth.login',
      'user',
      '2026-03-01',
      '2026-03-31',
    );

    expect(auditLogService.listByFilter).toHaveBeenCalledWith(
      {
        action: 'auth.login',
        endDate: '2026-03-31',
        startDate: '2026-03-01',
        targetType: 'user',
        tenantId: 'tenant-1',
        userId: 'user-9',
      },
      2,
      100,
    );
    expect(result).toEqual({
      items: [{ id: 'log-1', action: 'auth.login' }],
      page: 2,
      pageSize: 100,
      total: 1,
    });
  });

  it('returns paginated recent messages for the current tenant', async () => {
    vi.spyOn(controller as never, 'listRecentMessages').mockResolvedValue({
      items: [
        {
          content: 'hello',
          conversationId: 'conversation-1',
          createdAt: new Date('2026-04-01T10:00:00.000Z'),
          id: 'message-1',
          userId: 'user-1',
        },
      ],
      total: 25,
    });

    const result = await controller.getRecentMessages(
      {
        jti: 'jti-1',
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      },
      '2',
      '200',
    );

    expect((controller as never).listRecentMessages).toHaveBeenCalledWith('tenant-1', 2, 100);

    expect(result).toEqual({
      items: [
        {
          content: 'hello',
          conversationId: 'conversation-1',
          createdAt: new Date('2026-04-01T10:00:00.000Z'),
          id: 'message-1',
          userId: 'user-1',
        },
      ],
      page: 2,
      pageSize: 100,
      total: 25,
    });
  });
});
