import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthIdentity } from '../../auth/authIdentity';
import { ImConversationService } from './imConversationService';

function createMockConnectionRegistry() {
  return {
    get: vi.fn(),
    remove: vi.fn(),
    upsert: vi.fn(),
  };
}

function createMockMessageRepository() {
  return {
    getLatest: vi.fn(),
  };
}

function createMockConversationRepository() {
  return {
    create: vi.fn(),
    listMembers: vi.fn(),
  };
}

describe('ImConversationService', () => {
  let service: ImConversationService;
  let connectionRegistry: ReturnType<typeof createMockConnectionRegistry>;
  let conversationRepository: ReturnType<typeof createMockConversationRepository>;
  let messageRepository: ReturnType<typeof createMockMessageRepository>;
  let identity: AuthIdentity;

  beforeEach(() => {
    connectionRegistry = createMockConnectionRegistry();
    conversationRepository = createMockConversationRepository();
    messageRepository = createMockMessageRepository();
    service = new ImConversationService(
      connectionRegistry as never,
      conversationRepository as never,
      messageRepository as never,
    );
    identity = {
      jti: 'jti-1',
      roles: ['tenant:user'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    };
  });

  it('lists history and stores socket context when joining a conversation', async () => {
    const history = [
      {
        content: 'hello',
        conversationId: 'conversation-1',
        createdAt: '2026-03-30T12:00:00.000Z',
        deletedAt: null,
        editedAt: null,
        messageId: 'message-1',
        messageType: 'text' as const,
        metadata: null,
        sequenceId: 7,
        tenantId: 'tenant-1',
        traceId: 'trace-1',
        userId: 'user-1',
      },
    ];
    messageRepository.getLatest.mockResolvedValue(history);

    const result = await service.joinConversation('socket-1', 'conversation-1', identity);

    expect(connectionRegistry.upsert).toHaveBeenCalledWith('socket-1', {
      conversationId: 'conversation-1',
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
    expect(messageRepository.getLatest).toHaveBeenCalledWith(identity.tenantId, 'conversation-1', 50);
    expect(result).toEqual({
      context: {
        conversationId: 'conversation-1',
        tenantId: identity.tenantId,
        userId: identity.userId,
      },
      history,
      roomKey: 'tenant-1::conversation-1',
    });
  });

  it('finds a connection context through the registry', () => {
    const context = {
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    };
    connectionRegistry.get.mockReturnValue(context);

    expect(service.getContext('socket-1')).toEqual(context);
    expect(connectionRegistry.get).toHaveBeenCalledWith('socket-1');
  });

  it('removes a connection and generates deterministic room keys', () => {
    service.removeConnection('socket-1');

    expect(connectionRegistry.remove).toHaveBeenCalledWith('socket-1');
    expect(service.toRoomKey('tenant-2', 'conversation-9')).toBe('tenant-2::conversation-9');
  });
});
