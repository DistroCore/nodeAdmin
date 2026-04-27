import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImMessage } from '@nodeadmin/shared-types';
import { io } from 'socket.io-client';
import {
  useImSocket,
  type ImMessageDeletedEvent,
  type ImMessageEditedEvent,
  type ImPresenceEvent,
  type ImPresenceStatusEvent,
  type ImReadReceiptEvent,
  type ImSendMessageAck,
  type ImSendMessagePayload,
  type ImTypingEvent,
} from '../useImSocket';

type UseImSocketOptions = Parameters<typeof useImSocket>[0];

interface MockSocketInstance {
  disconnect: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  io: {
    on: ReturnType<typeof vi.fn>;
  };
  off: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}

// Mock socket.io-client
vi.mock('socket.io-client', () => {
  const mSocket = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    io: {
      on: vi.fn(),
    },
  };
  return {
    io: vi.fn(() => mSocket),
  };
});

describe('useImSocket', () => {
  const mockOptions: UseImSocketOptions = {
    accessToken: 'test-token',
    conversationId: 'conv-1',
    socketUrl: 'http://localhost:11451',
    onConnectionStateChange: vi.fn(),
    onConversationHistory: vi.fn(),
    onMessageReceived: vi.fn(),
    onMessageEdited: vi.fn(),
    onMessageDeleted: vi.fn(),
    onReadReceiptUpdated: vi.fn(),
    onTypingChanged: vi.fn(),
    onPresenceChanged: vi.fn(),
    onPresenceStatusChanged: vi.fn(),
  };

  const mockMessage: ImMessage = {
    content: 'hello',
    conversationId: 'conv-1',
    createdAt: '2026-04-10T00:00:00.000Z',
    deletedAt: null,
    editedAt: null,
    messageId: 'msg-1',
    messageType: 'text',
    metadata: null,
    sequenceId: 1,
    tenantId: 'tenant-1',
    traceId: 'trace-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('should initialize and handle events', () => {
    renderHook(() => useImSocket(mockOptions));
    const mSocket = vi.mocked(io).mock.results[0]?.value as unknown as MockSocketInstance;

    const findHandler = <T>(evt: string, emitter: { on: ReturnType<typeof vi.fn> } = mSocket): T => {
      const match = emitter.on.mock.calls.find(([eventName]) => eventName === evt);
      if (!match) {
        throw new Error(`Missing handler for event: ${evt}`);
      }

      return match[1] as T;
    };

    // Trigger events
    findHandler<(event: ImMessageEditedEvent) => void>('messageEdited')({ message: mockMessage });
    expect(mockOptions.onMessageEdited).toHaveBeenCalled();

    findHandler<(event: ImMessageDeletedEvent) => void>('messageDeleted')({ message: mockMessage });
    expect(mockOptions.onMessageDeleted).toHaveBeenCalled();

    findHandler<(event: ImReadReceiptEvent) => void>('readReceiptUpdated')({
      conversationId: 'conv-1',
      lastReadMessageId: 'msg-1',
      userId: 'user-2',
    });
    expect(mockOptions.onReadReceiptUpdated).toHaveBeenCalled();

    findHandler<(event: ImTypingEvent) => void>('typingChanged')({
      conversationId: 'conv-1',
      isTyping: true,
      tenantId: 'tenant-1',
      userId: 'user-2',
    });
    expect(mockOptions.onTypingChanged).toHaveBeenCalled();

    findHandler<(event: ImPresenceEvent) => void>('presenceChanged')({
      conversationId: 'conv-1',
      event: 'joined',
      tenantId: 'tenant-1',
      userId: 'user-2',
    });
    expect(mockOptions.onPresenceChanged).toHaveBeenCalled();

    findHandler<(event: ImPresenceStatusEvent) => void>('presenceStatusChanged')({
      conversationId: 'conv-1',
      status: 'online',
      tenantId: 'tenant-1',
      userId: 'user-2',
    });
    expect(mockOptions.onPresenceStatusChanged).toHaveBeenCalled();
  });

  it('should handle emit helpers', async () => {
    const { result } = renderHook(() => useImSocket(mockOptions));
    const mSocket = vi.mocked(io).mock.results[0]?.value as unknown as MockSocketInstance;

    result.current.emitDelete({ conversationId: 'c1', messageId: 'm1' });
    expect(mSocket.emit).toHaveBeenCalledWith('deleteMessage', expect.anything());

    result.current.emitEdit({ conversationId: 'c1', messageId: 'm1', content: 'new' });
    expect(mSocket.emit).toHaveBeenCalledWith('editMessage', expect.anything());

    result.current.emitMarkAsRead({ conversationId: 'c1', lastReadMessageId: 'm1' });
    expect(mSocket.emit).toHaveBeenCalledWith('markAsRead', expect.anything());

    result.current.emitSetPresenceStatus('online');
    expect(mSocket.emit).toHaveBeenCalledWith('setPresenceStatus', { status: 'online' });
  });

  it('should handle emitWithAck success and timeout', async () => {
    const { result } = renderHook(() => useImSocket(mockOptions));
    const mSocket = vi.mocked(io).mock.results[0]?.value as unknown as MockSocketInstance;
    const payload: ImSendMessagePayload = {
      content: 'hi',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      traceId: 'trace-1',
    };

    // Success case
    const promise1 = result.current.emitWithAck(payload, 1000);
    const sendMessageCall = mSocket.emit.mock.calls.find(([eventName]) => eventName === 'sendMessage');
    const callback = sendMessageCall?.[2] as ((ack: ImSendMessageAck) => void) | undefined;
    expect(callback).toBeDefined();
    callback?.({ accepted: true, duplicate: false, messageId: 'msg-1', sequenceId: 1 });
    expect(await promise1).toEqual({
      accepted: true,
      duplicate: false,
      messageId: 'msg-1',
      sequenceId: 1,
    });

    // Timeout case
    const promise2 = result.current.emitWithAck(payload, 1000);
    act(() => {
      vi.advanceTimersByTime(1001);
    });
    expect(await promise2).toBeNull();
  });
});
