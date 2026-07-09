import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationRepository } from './conversationRepository';

interface ConversationRecord {
  conversationId: string;
  tenantId: string;
  type: string;
  title: string | null;
  creatorId: string | null;
  lastMessageAt: Date | string | null;
  createdAt: Date;
  updatedAt: Date;
}

type QueryChain = Record<string, ReturnType<typeof vi.fn>>;

function createSelectChain(fields: unknown, rows: unknown[]): QueryChain {
  const chain: QueryChain = {};

  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'groupBy', 'orderBy', 'limit']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  chain.as = vi.fn().mockReturnValue(fields);
  chain.then = vi.fn((onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected),
  );

  return chain;
}

function createSelectDrizzle(rows: unknown[]) {
  const selectChains: QueryChain[] = [];
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn((fields: unknown) => {
      const chain = createSelectChain(fields, rows);
      selectChains.push(chain);
      return chain;
    }),
  };
  const drizzle = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };

  return { drizzle, selectChains, tx };
}

function createConversationRecord(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    conversationId: 'conversation-1',
    tenantId: 'tenant-1',
    type: 'group',
    title: 'Platform',
    creatorId: 'user-1',
    lastMessageAt: new Date('2026-07-09T10:00:00.000Z'),
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-08T10:00:00.000Z'),
    ...overrides,
  };
}

describe('ConversationRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses safe fallbacks when the database client is unavailable', async () => {
    const repository = new ConversationRepository(null);
    const createParams = {
      id: 'conversation-1',
      tenantId: 'tenant-1',
      type: 'group' as const,
      title: 'Platform',
      creatorId: 'user-1',
      memberUserIds: ['user-2'],
    };

    await expect(repository.create(createParams)).rejects.toThrow('Database not available');
    await expect(repository.findById('tenant-1', 'conversation-1', 'user-1')).resolves.toBeNull();
    await expect(repository.listByMember('tenant-1', 'user-1')).resolves.toEqual([]);
    await expect(repository.listMembers('tenant-1', 'conversation-1')).resolves.toEqual([]);
    await expect(repository.findDmBetweenUsers('tenant-1', 'user-1', 'user-2')).resolves.toBeNull();
    await expect(repository.listByTenant('tenant-1')).resolves.toEqual([]);
    await expect(repository.searchUsers('tenant-1', 'alice')).resolves.toEqual([]);
  });

  it('creates a conversation and its membership set in one tenant transaction', async () => {
    const createdAt = new Date('2026-07-01T10:00:00.000Z');
    const updatedAt = new Date('2026-07-01T10:00:01.000Z');
    const returning = vi.fn().mockResolvedValue([
      {
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
        type: 'group',
        title: 'Platform',
        creatorId: 'user-1',
        createdAt,
        updatedAt,
      },
    ]);
    const conversationValues = vi.fn().mockReturnValue({ returning });
    const memberValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValueOnce({ values: conversationValues }).mockReturnValueOnce({ values: memberValues }),
    };
    const drizzle = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new ConversationRepository(drizzle as never);

    const result = await repository.create({
      id: 'conversation-1',
      tenantId: 'tenant-1',
      type: 'group',
      title: 'Platform',
      creatorId: 'user-1',
      memberUserIds: ['user-2', 'user-3'],
    });

    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(tx.insert.mock.invocationCallOrder[0]);
    expect(conversationValues).toHaveBeenCalledWith({
      id: 'conversation-1',
      tenantId: 'tenant-1',
      type: 'group',
      title: 'Platform',
      creatorId: 'user-1',
    });
    expect(memberValues).toHaveBeenCalledWith([
      {
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        userId: 'user-1',
        role: 'admin',
      },
      {
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        userId: 'user-2',
        role: 'member',
      },
      {
        tenantId: 'tenant-1',
        conversationId: 'conversation-1',
        userId: 'user-3',
        role: 'member',
      },
    ]);
    expect(result).toEqual({
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      type: 'group',
      title: 'Platform',
      creatorId: 'user-1',
      lastMessageAt: null,
      createdAt,
      updatedAt,
    });
  });

  it('fails creation when the insert does not return a conversation row', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi
        .fn()
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        })
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) }),
    };
    const drizzle = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new ConversationRepository(drizzle as never);

    await expect(
      repository.create({
        id: 'conversation-missing',
        tenantId: 'tenant-1',
        type: 'dm',
        title: null,
        creatorId: 'user-1',
        memberUserIds: ['user-2'],
      }),
    ).rejects.toThrow('Failed to create conversation conversation-missing');
  });

  it('finds a member-visible conversation and normalizes a timestamp string', async () => {
    const row = createConversationRecord({ lastMessageAt: '2026-07-09T11:00:00.000Z' });
    const { drizzle, selectChains, tx } = createSelectDrizzle([row]);
    const repository = new ConversationRepository(drizzle as never);

    const result = await repository.findById('tenant-1', 'conversation-1', 'user-1');

    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(selectChains[selectChains.length - 1].limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      ...row,
      type: 'group',
      lastMessageAt: new Date('2026-07-09T11:00:00.000Z'),
    });
  });

  it('returns null when findById has no member-visible row', async () => {
    const { drizzle } = createSelectDrizzle([]);
    const repository = new ConversationRepository(drizzle as never);

    await expect(repository.findById('tenant-1', 'conversation-missing', 'user-1')).resolves.toBeNull();
  });

  it('lists member conversations, maps dates, and caps the requested limit', async () => {
    const date = new Date('2026-07-09T12:00:00.000Z');
    const rows = [
      createConversationRecord({ lastMessageAt: date }),
      createConversationRecord({ conversationId: 'conversation-2', lastMessageAt: null, type: 'dm' }),
    ];
    const { drizzle, selectChains } = createSelectDrizzle(rows);
    const repository = new ConversationRepository(drizzle as never);

    const result = await repository.listByMember('tenant-1', 'user-1', 999);

    expect(selectChains[selectChains.length - 1].limit).toHaveBeenCalledWith(200);
    expect(result[0].lastMessageAt).toBe(date);
    expect(result[1]).toMatchObject({ conversationId: 'conversation-2', type: 'dm', lastMessageAt: null });
  });

  it('lists members and normalizes unsupported roles to member', async () => {
    const joinedAt = new Date('2026-07-02T10:00:00.000Z');
    const rows = [
      {
        conversationId: 'conversation-1',
        joinedAt,
        role: 'admin',
        tenantId: 'tenant-1',
        userId: 'user-1',
      },
      {
        conversationId: 'conversation-1',
        joinedAt,
        role: 'owner',
        tenantId: 'tenant-1',
        userId: 'user-2',
      },
    ];
    const { drizzle, selectChains } = createSelectDrizzle(rows);
    const repository = new ConversationRepository(drizzle as never);

    const result = await repository.listMembers('tenant-1', 'conversation-1');

    expect(selectChains[0].orderBy).toHaveBeenCalledTimes(1);
    expect(result.map((member) => member.role)).toEqual(['admin', 'member']);
  });

  it('finds an exact two-member DM and returns null when none exists', async () => {
    const row = createConversationRecord({ type: 'dm', title: null });
    const found = createSelectDrizzle([row]);
    const foundRepository = new ConversationRepository(found.drizzle as never);

    await expect(foundRepository.findDmBetweenUsers('tenant-1', 'user-1', 'user-2')).resolves.toEqual(row);
    expect(found.tx.select).toHaveBeenCalledTimes(5);

    const missing = createSelectDrizzle([]);
    const missingRepository = new ConversationRepository(missing.drizzle as never);
    await expect(missingRepository.findDmBetweenUsers('tenant-1', 'user-1', 'user-2')).resolves.toBeNull();
  });

  it('lists tenant conversations, clamps low limits, and rejects invalid timestamps', async () => {
    const row = createConversationRecord({ lastMessageAt: 'not-a-date', type: 'channel' });
    const { drizzle, selectChains } = createSelectDrizzle([row]);
    const repository = new ConversationRepository(drizzle as never);

    const result = await repository.listByTenant('tenant-1', 0);

    expect(selectChains[selectChains.length - 1].limit).toHaveBeenCalledWith(1);
    expect(result[0]).toMatchObject({ type: 'dm', lastMessageAt: null });
  });

  it('skips blank user searches and trims non-empty queries before executing', async () => {
    const rows = [{ id: 'user-2', name: 'Alice', email: 'alice@example.com', avatar: null }];
    const { drizzle, selectChains, tx } = createSelectDrizzle(rows);
    const repository = new ConversationRepository(drizzle as never);

    await expect(repository.searchUsers('tenant-1', '   ')).resolves.toEqual([]);
    expect(drizzle.transaction).not.toHaveBeenCalled();

    await expect(repository.searchUsers('tenant-1', '  Alice  ', 100)).resolves.toEqual(rows);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(selectChains[selectChains.length - 1].limit).toHaveBeenCalledWith(50);
  });
});
