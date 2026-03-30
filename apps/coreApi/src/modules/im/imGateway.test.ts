import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WsException } from '@nestjs/websockets';
import { setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

import { AuthIdentity } from '../auth/authIdentity';
import { SocketContext } from '../../infrastructure/connectionRegistry';
import { StoredMessage } from '../../infrastructure/inMemoryMessageStore';
import { ImGateway } from './imGateway';

interface MockSocketTarget {
  emit: ReturnType<typeof vi.fn>;
}

interface MockSocketClient {
  data: {
    identity?: AuthIdentity;
  };
  emit: ReturnType<typeof vi.fn>;
  id: string;
  join: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
}

interface MockServer {
  close: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
}

function createMockConversationService() {
  return {
    getContext: vi.fn(),
    joinConversation: vi.fn(),
    removeConnection: vi.fn(),
    toRoomKey: vi.fn(),
  };
}

function createMockMessageService() {
  return {
    appendMessage: vi.fn(),
    deleteMessage: vi.fn(),
    editMessage: vi.fn(),
    markAsRead: vi.fn(),
  };
}

function createMockPresenceService() {
  return {
    createJoinedEvent: vi.fn(),
    createLeftEvent: vi.fn(),
  };
}

function createMockAuditLogService() {
  return {
    record: vi.fn().mockResolvedValue(undefined),
  };
}

function createServer(): { roomTarget: MockSocketTarget; server: MockServer } {
  const roomTarget = {
    emit: vi.fn(),
  };

  const server: MockServer = {
    close: vi.fn().mockResolvedValue(undefined),
    to: vi.fn().mockReturnValue(roomTarget),
  };

  return { roomTarget, server };
}

function createClient(identity?: AuthIdentity): {
  client: MockSocketClient;
  roomTarget: MockSocketTarget;
} {
  const roomTarget = {
    emit: vi.fn(),
  };

  const client: MockSocketClient = {
    data: {
      identity,
    },
    emit: vi.fn(),
    id: 'socket-1',
    join: vi.fn(),
    to: vi.fn().mockReturnValue(roomTarget),
  };

  return { client, roomTarget };
}

function createMessage(overrides?: Partial<StoredMessage>): StoredMessage {
  return {
    content: 'hello world',
    conversationId: 'conversation-1',
    createdAt: '2026-03-30T12:00:00.000Z',
    deletedAt: null,
    editedAt: null,
    messageId: 'message-1',
    messageType: 'text',
    metadata: null,
    sequenceId: 11,
    tenantId: 'tenant-1',
    traceId: 'trace-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('ImGateway', () => {
  let gateway: ImGateway;
  let conversationService: ReturnType<typeof createMockConversationService>;
  let messageService: ReturnType<typeof createMockMessageService>;
  let presenceService: ReturnType<typeof createMockPresenceService>;
  let auditLogService: ReturnType<typeof createMockAuditLogService>;
  let server: MockServer;
  let serverRoomTarget: MockSocketTarget;
  let identity: AuthIdentity;
  let context: SocketContext;

  beforeEach(() => {
    conversationService = createMockConversationService();
    messageService = createMockMessageService();
    presenceService = createMockPresenceService();
    auditLogService = createMockAuditLogService();

    gateway = new ImGateway(
      conversationService as never,
      messageService as never,
      presenceService as never,
      auditLogService as never
    );

    ({ roomTarget: serverRoomTarget, server } = createServer());
    (
      gateway as unknown as {
        server: MockServer;
      }
    ).server = server;

    identity = {
      jti: 'jti-1',
      roles: ['tenant:admin'],
      tenantId: 'tenant-1',
      userId: 'user-1',
    };
    context = {
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    };
  });

  it('joins a conversation, emits history, and broadcasts joined presence', async () => {
    const { client } = createClient(identity);
    const history = [createMessage()];
    const joinedEvent = {
      conversationId: context.conversationId,
      event: 'joined' as const,
      tenantId: context.tenantId,
      userId: context.userId,
    };

    conversationService.joinConversation.mockResolvedValue({
      context,
      history,
      roomKey: 'tenant-1::conversation-1',
    });
    presenceService.createJoinedEvent.mockReturnValue(joinedEvent);

    const result = await gateway.joinConversation(client as never, {
      conversationId: context.conversationId,
    });

    expect(conversationService.joinConversation).toHaveBeenCalledWith(
      client.id,
      context.conversationId,
      identity
    );
    expect(client.join).toHaveBeenCalledWith('tenant-1::conversation-1');
    expect(client.emit).toHaveBeenCalledWith('conversationHistory', history);
    expect(server.to).toHaveBeenCalledWith('tenant-1::conversation-1');
    expect(serverRoomTarget.emit).toHaveBeenCalledWith('presenceChanged', joinedEvent);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'im.join_conversation',
        targetId: context.conversationId,
        tenantId: identity.tenantId,
        userId: identity.userId,
      })
    );
    expect(result).toEqual({ ok: true, roomKey: 'tenant-1::conversation-1' });
  });

  it('sends a message and emits delivery to the room and current socket', async () => {
    const { client, roomTarget } = createClient(identity);
    const appendedMessage = createMessage({ messageId: 'message-2', sequenceId: 12 });

    conversationService.getContext.mockReturnValue(context);
    conversationService.toRoomKey.mockReturnValue('tenant-1::conversation-1');
    messageService.appendMessage.mockResolvedValue({
      duplicate: false,
      message: appendedMessage,
    });

    const result = await gateway.sendMessage(client as never, {
      content: 'hello',
      conversationId: context.conversationId,
      messageId: appendedMessage.messageId,
      traceId: appendedMessage.traceId,
    });

    expect(messageService.appendMessage).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        content: 'hello',
        conversationId: context.conversationId,
        messageId: appendedMessage.messageId,
      }),
      identity
    );
    expect(client.to).toHaveBeenCalledWith('tenant-1::conversation-1');
    expect(roomTarget.emit).toHaveBeenCalledWith('messageReceived', appendedMessage);
    expect(client.emit).toHaveBeenCalledWith('messageReceived', appendedMessage);
    expect(result).toEqual({
      accepted: true,
      duplicate: false,
      messageId: appendedMessage.messageId,
      sequenceId: appendedMessage.sequenceId,
    });
  });

  it('broadcasts typing state to the conversation room', () => {
    const { client, roomTarget } = createClient(identity);

    conversationService.getContext.mockReturnValue(context);
    conversationService.toRoomKey.mockReturnValue('tenant-1::conversation-1');

    const result = gateway.typing(client as never, {
      conversationId: context.conversationId,
      isTyping: true,
    });

    expect(client.to).toHaveBeenCalledWith('tenant-1::conversation-1');
    expect(roomTarget.emit).toHaveBeenCalledWith('typingChanged', {
      conversationId: context.conversationId,
      isTyping: true,
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
    expect(result).toEqual({ ok: true });
  });

  it('removes the connection and broadcasts leave presence on disconnect', () => {
    const { client } = createClient(identity);
    const leftEvent = {
      conversationId: context.conversationId,
      event: 'left' as const,
      tenantId: context.tenantId,
      userId: context.userId,
    };

    conversationService.getContext.mockReturnValue(context);
    conversationService.toRoomKey.mockReturnValue('tenant-1::conversation-1');
    presenceService.createLeftEvent.mockReturnValue(leftEvent);

    gateway.handleDisconnect(client as never);

    expect(conversationService.removeConnection).toHaveBeenCalledWith(client.id);
    expect(server.to).toHaveBeenCalledWith('tenant-1::conversation-1');
    expect(serverRoomTarget.emit).toHaveBeenCalledWith('presenceChanged', leftEvent);
  });

  it('rejects sendMessage when the socket has no active conversation context', async () => {
    const { client } = createClient(identity);

    conversationService.getContext.mockReturnValue(undefined);

    await expect(
      gateway.sendMessage(client as never, {
        content: 'hello',
        conversationId: context.conversationId,
        messageId: 'message-3',
        traceId: 'trace-3',
      })
    ).rejects.toThrow(WsException);
  });
});
