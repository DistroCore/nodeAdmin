import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WsException } from '@nestjs/websockets';
import { setupTestEnv } from '../../../__tests__/helpers';

setupTestEnv();

import { runtimeConfig } from '../../../app/runtimeConfig';
import { AuthIdentity } from '../../auth/authIdentity';
import { ImMessageService } from './imMessageService';

function createMockMessageRepository() {
  return {
    append: vi.fn(),
    getLatest: vi.fn(),
    softDelete: vi.fn(),
    updateContent: vi.fn(),
    upsertReadReceipt: vi.fn(),
  };
}

function createIdentity(): AuthIdentity {
  return {
    jti: 'jti-1',
    roles: ['tenant:user'],
    tenantId: 'tenant-1',
    userId: 'user-1',
  };
}

function createContext() {
  return {
    conversationId: 'conversation-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
  };
}

function createPayload(messageId: string) {
  return {
    content: 'hello world',
    conversationId: 'conversation-1',
    messageId,
    traceId: `trace-${messageId}`,
  };
}

function createPersistedMessage(
  sequenceId: number,
  messageId: string
): {
  content: string;
  conversationId: string;
  createdAt: string;
  deletedAt: null;
  editedAt: null;
  messageId: string;
  messageType: 'text';
  metadata: null;
  sequenceId: number;
  tenantId: string;
  traceId: string;
  userId: string;
} {
  return {
    content: 'hello world',
    conversationId: 'conversation-1',
    createdAt: '2026-03-30T12:00:00.000Z',
    deletedAt: null,
    editedAt: null,
    messageId,
    messageType: 'text',
    metadata: null,
    sequenceId,
    tenantId: 'tenant-1',
    traceId: `trace-${messageId}`,
    userId: 'user-1',
  };
}

function createStoredMessage(
  overrides?: Partial<ReturnType<typeof createPersistedMessage>>
): ReturnType<typeof createPersistedMessage> {
  return {
    ...createPersistedMessage(1, 'message-1'),
    ...overrides,
  };
}

describe('ImMessageService', () => {
  let service: ImMessageService;
  let messageRepository: ReturnType<typeof createMockMessageRepository>;

  beforeEach(() => {
    messageRepository = createMockMessageRepository();
    messageRepository.getLatest.mockResolvedValue([]);
    messageRepository.append.mockImplementation(async (message) => ({
      duplicate: false,
      message: createPersistedMessage(
        Number(message.messageId.split('-').at(-1) ?? '1'),
        message.messageId
      ),
    }));
    service = new ImMessageService(messageRepository as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await flushQueue(service);
  });

  it('returns duplicate metadata immediately for repeated messageId on the same stream', async () => {
    const identity = createIdentity();
    const context = createContext();

    const first = await service.appendMessage(context, createPayload('message-1'), identity);
    const duplicate = await service.appendMessage(context, createPayload('message-1'), identity);

    expect(first.duplicate).toBe(false);
    expect(first.message.sequenceId).toBe(1);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.message.messageId).toBe('message-1');
    expect(duplicate.message.sequenceId).toBe(1);
    expect(messageRepository.getLatest).toHaveBeenCalledTimes(1);
    expect(messageRepository.append).not.toHaveBeenCalled();

    await flushQueue(service);

    expect(messageRepository.append).toHaveBeenCalledTimes(1);
  });

  it('enforces websocket message rate limits per tenant and user', async () => {
    const originalLimit = runtimeConfig.rateLimit.wsMessagesPerSecond;
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);

    runtimeConfig.rateLimit.wsMessagesPerSecond = 1;

    try {
      const identity = createIdentity();
      const context = createContext();

      await service.appendMessage(context, createPayload('message-1'), identity);

      await expect(
        service.appendMessage(context, createPayload('message-2'), identity)
      ).rejects.toThrow(WsException);

      expect(messageRepository.append).not.toHaveBeenCalled();
    } finally {
      runtimeConfig.rateLimit.wsMessagesPerSecond = originalLimit;
      dateNowSpy.mockRestore();
    }
  });

  it('persists queued messages in a batch when the flush pipeline runs', async () => {
    const identity = createIdentity();
    const context = createContext();

    const results = await Promise.all([
      service.appendMessage(context, createPayload('message-1'), identity),
      service.appendMessage(context, createPayload('message-2'), identity),
      service.appendMessage(context, createPayload('message-3'), identity),
    ]);

    expect(results.map((result) => result.message.sequenceId)).toEqual([1, 2, 3]);
    expect(messageRepository.append).not.toHaveBeenCalled();

    await flushQueue(service);

    expect(messageRepository.append).toHaveBeenCalledTimes(3);
    expect(messageRepository.append.mock.calls.map(([message]) => message.messageId)).toEqual([
      'message-1',
      'message-2',
      'message-3',
    ]);
  });

  it('rejects append requests when the socket context does not match the authenticated identity', async () => {
    const identity = createIdentity();

    await expect(
      service.appendMessage(
        { ...createContext(), conversationId: 'conversation-2' },
        createPayload('message-1'),
        identity
      )
    ).rejects.toThrow('Socket context mismatch');
  });

  it('rejects append requests when sanitized content is empty', async () => {
    const identity = createIdentity();
    const context = createContext();

    await expect(
      service.appendMessage(
        context,
        {
          ...createPayload('message-1'),
          content: '<script>alert(1)</script>   ',
        },
        identity
      )
    ).rejects.toThrow('Message content is empty after sanitization.');
  });

  it('seeds the sequence cache from repository history before assigning the next message sequence', async () => {
    const identity = createIdentity();
    const context = createContext();

    messageRepository.getLatest.mockResolvedValue([createStoredMessage({ sequenceId: 41 })]);

    const result = await service.appendMessage(context, createPayload('message-42'), identity);

    expect(result.message.sequenceId).toBe(42);
    expect(messageRepository.getLatest).toHaveBeenCalledWith('tenant-1', 'conversation-1', 1);
  });

  it('drops the optimistic duplicate cache entry when persistence fails after all retries', async () => {
    const identity = createIdentity();
    const context = createContext();
    const originalMaxQueueLength = (
      ImMessageService as unknown as { maxPersistQueueLength: number }
    ).maxPersistQueueLength;

    messageRepository.append.mockRejectedValue(new Error('db unavailable'));
    (
      service as unknown as {
        delay: (ms: number) => Promise<void>;
      }
    ).delay = vi.fn().mockResolvedValue(undefined);
    (ImMessageService as unknown as { maxPersistQueueLength: number }).maxPersistQueueLength = 0;

    try {
      await expect(
        service.appendMessage(context, createPayload('message-9'), identity)
      ).rejects.toThrow('Message persistence is temporarily unavailable.');

      await expect(
        service.appendMessage(context, createPayload('message-9'), identity)
      ).rejects.toThrow('Message persistence is temporarily unavailable.');

      expect(messageRepository.append).toHaveBeenCalledTimes(6);
    } finally {
      (ImMessageService as unknown as { maxPersistQueueLength: number }).maxPersistQueueLength =
        originalMaxQueueLength;
    }
  });

  it('sanitizes edited message content before delegating the update', async () => {
    const identity = createIdentity();
    const context = createContext();
    const updated = createStoredMessage({
      content: 'updated',
      editedAt: '2026-04-08T00:00:00.000Z',
      messageId: 'message-1',
    });

    messageRepository.updateContent.mockResolvedValue(updated);

    await expect(
      service.editMessage(context, 'message-1', '<b>updated</b>', identity)
    ).resolves.toEqual(updated);

    expect(messageRepository.updateContent).toHaveBeenCalledWith(
      'tenant-1',
      'message-1',
      'updated'
    );
  });

  it('rejects editing when the sanitized content is empty or the updated row belongs to another user', async () => {
    const identity = createIdentity();
    const context = createContext();

    await expect(
      service.editMessage(context, 'message-1', '   <script>bad</script>  ', identity)
    ).rejects.toThrow('Edited message content is empty after sanitization.');

    messageRepository.updateContent.mockResolvedValue(
      createStoredMessage({
        messageId: 'message-1',
        userId: 'user-2',
      })
    );

    await expect(service.editMessage(context, 'message-1', 'updated', identity)).rejects.toThrow(
      'You can only edit your own messages.'
    );
  });

  it('rejects delete requests when the message is missing or owned by another user', async () => {
    const identity = createIdentity();
    const context = createContext();

    messageRepository.getLatest.mockResolvedValue([]);
    await expect(service.deleteMessage(context, 'message-1', identity)).rejects.toThrow(
      'Message not found.'
    );

    messageRepository.getLatest.mockResolvedValue([
      createStoredMessage({
        messageId: 'message-1',
        userId: 'user-2',
      }),
    ]);

    await expect(service.deleteMessage(context, 'message-1', identity)).rejects.toThrow(
      'You can only delete your own messages.'
    );
  });

  it('soft deletes a message after ownership is verified', async () => {
    const identity = createIdentity();
    const context = createContext();
    const deleted = createStoredMessage({
      deletedAt: '2026-04-08T00:00:00.000Z',
      messageId: 'message-1',
    });

    messageRepository.getLatest.mockResolvedValue([
      createStoredMessage({ messageId: 'message-1' }),
    ]);
    messageRepository.softDelete.mockResolvedValue(deleted);

    await expect(service.deleteMessage(context, 'message-1', identity)).resolves.toEqual(deleted);
    expect(messageRepository.softDelete).toHaveBeenCalledWith('tenant-1', 'message-1');
  });

  it('records read receipts using the resolved message sequence and rejects unknown message IDs', async () => {
    const identity = createIdentity();
    const context = createContext();

    messageRepository.getLatest.mockResolvedValue([]);
    await expect(service.markAsRead(context, 'message-1', identity)).rejects.toThrow(
      'Referenced message not found.'
    );

    messageRepository.getLatest.mockResolvedValue([
      createStoredMessage({
        messageId: 'message-7',
        sequenceId: 7,
      }),
    ]);

    await expect(service.markAsRead(context, 'message-7', identity)).resolves.toEqual({
      conversationId: 'conversation-1',
      lastReadMessageId: 'message-7',
      userId: 'user-1',
    });
    expect(messageRepository.upsertReadReceipt).toHaveBeenCalledWith(
      'tenant-1',
      'conversation-1',
      'user-1',
      7
    );
  });
});

async function flushQueue(service: ImMessageService): Promise<void> {
  await (
    service as unknown as {
      flushQueue: (forceDrain?: boolean) => Promise<void>;
    }
  ).flushQueue(true);
}
