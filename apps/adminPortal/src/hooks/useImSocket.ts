import { useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ImMessage, ImMessageType, ImPresenceStatus, MessageMetadata } from '@nodeadmin/shared-types';
import { SocketConnectionState } from '@/stores/useSocketStore';

export type ImSocketMessage = ImMessage;

export interface ImSendMessagePayload {
  content: string;
  conversationId: string;
  messageId: string;
  messageType?: ImMessageType;
  metadata?: MessageMetadata;
  traceId: string;
}

export interface ImSendMessageAck {
  accepted: boolean;
  duplicate: boolean;
  messageId: string;
  sequenceId: number;
}

export interface ImTypingEvent {
  conversationId: string;
  isTyping: boolean;
  tenantId: string;
  userId: string;
}

export interface ImPresenceEvent {
  conversationId: string;
  event: 'joined' | 'left';
  tenantId: string;
  userId: string;
}

export interface ImMessageEditedEvent {
  message: ImSocketMessage;
}

export interface ImMessageDeletedEvent {
  message: ImSocketMessage;
}

export interface ImReadReceiptEvent {
  conversationId: string;
  lastReadMessageId: string;
  userId: string;
}

export interface ImPresenceStatusEvent {
  conversationId: string;
  status: ImPresenceStatus;
  tenantId: string;
  userId: string;
}

interface UseImSocketOptions {
  accessToken: string | null;
  conversationId: string;
  onConnectionStateChange: (connectionState: SocketConnectionState) => void;
  onConversationHistory: (history: ImSocketMessage[]) => void;
  onMessageEdited?: (event: ImMessageEditedEvent) => void;
  onMessageDeleted?: (event: ImMessageDeletedEvent) => void;
  onMessageReceived: (message: ImSocketMessage) => void;
  onReadReceiptUpdated?: (event: ImReadReceiptEvent) => void;
  onTypingChanged?: (event: ImTypingEvent) => void;
  onPresenceChanged?: (event: ImPresenceEvent) => void;
  onPresenceStatusChanged?: (event: ImPresenceStatusEvent) => void;
  socketUrl: string;
}

export function useImSocket(options: UseImSocketOptions): {
  emitDelete: (payload: { conversationId: string; messageId: string }) => void;
  emitEdit: (payload: { conversationId: string; messageId: string; content: string }) => void;
  emitMarkAsRead: (payload: { conversationId: string; lastReadMessageId: string }) => void;
  emitSetPresenceStatus: (status: ImPresenceStatus) => void;
  emitTyping: (payload: { conversationId: string; isTyping: boolean }) => void;
  emitWithAck: (payload: ImSendMessagePayload, timeoutMs: number) => Promise<ImSendMessageAck | null>;
} {
  const {
    accessToken,
    conversationId,
    onConnectionStateChange,
    onConversationHistory,
    onMessageEdited,
    onMessageDeleted,
    onMessageReceived,
    onReadReceiptUpdated,
    onTypingChanged,
    onPresenceChanged,
    onPresenceStatusChanged,
    socketUrl,
  } = options;
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    onConnectionStateChange('connecting');

    const socket = io(socketUrl, {
      auth: {
        token: accessToken,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000,
      transports: ['polling', 'websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      onConnectionStateChange('connected');
      socket.emit('joinConversation', {
        conversationId,
      });
    });

    socket.on('disconnect', () => {
      onConnectionStateChange('disconnected');
    });

    socket.on('connect_error', () => {
      onConnectionStateChange('reconnecting');
    });

    socket.io.on('reconnect_attempt', () => {
      onConnectionStateChange('reconnecting');
    });

    socket.io.on('reconnect_failed', () => {
      onConnectionStateChange('disconnected');
    });

    socket.on('conversationHistory', onConversationHistory);
    socket.on('messageReceived', onMessageReceived);
    if (onMessageEdited) {
      socket.on('messageEdited', onMessageEdited);
    }
    if (onMessageDeleted) {
      socket.on('messageDeleted', onMessageDeleted);
    }
    if (onReadReceiptUpdated) {
      socket.on('readReceiptUpdated', onReadReceiptUpdated);
    }
    if (onTypingChanged) {
      socket.on('typingChanged', onTypingChanged);
    }
    if (onPresenceChanged) {
      socket.on('presenceChanged', onPresenceChanged);
    }
    if (onPresenceStatusChanged) {
      socket.on('presenceStatusChanged', onPresenceStatusChanged);
    }

    return () => {
      if (onMessageEdited) {
        socket.off('messageEdited', onMessageEdited);
      }
      if (onMessageDeleted) {
        socket.off('messageDeleted', onMessageDeleted);
      }
      if (onReadReceiptUpdated) {
        socket.off('readReceiptUpdated', onReadReceiptUpdated);
      }
      if (onTypingChanged) {
        socket.off('typingChanged', onTypingChanged);
      }
      if (onPresenceChanged) {
        socket.off('presenceChanged', onPresenceChanged);
      }
      if (onPresenceStatusChanged) {
        socket.off('presenceStatusChanged', onPresenceStatusChanged);
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    accessToken,
    conversationId,
    onConnectionStateChange,
    onConversationHistory,
    onMessageDeleted,
    onMessageEdited,
    onMessageReceived,
    onPresenceChanged,
    onPresenceStatusChanged,
    onReadReceiptUpdated,
    onTypingChanged,
    socketUrl,
  ]);

  const emitTyping = useCallback((payload: { conversationId: string; isTyping: boolean }) => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    socket.emit('typing', payload);
  }, []);

  const emitWithAck = useCallback(
    (payload: ImSendMessagePayload, timeoutMs: number): Promise<ImSendMessageAck | null> => {
      const socket = socketRef.current;
      if (!socket) {
        return Promise.resolve(null);
      }

      return new Promise((resolve) => {
        let settled = false;
        const timeoutHandle = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        }, timeoutMs);

        socket.emit('sendMessage', payload, (ack: ImSendMessageAck) => {
          if (settled) {
            return;
          }

          settled = true;
          window.clearTimeout(timeoutHandle);
          resolve(ack);
        });
      });
    },
    [],
  );

  const emitEdit = useCallback((payload: { conversationId: string; messageId: string; content: string }) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('editMessage', payload);
  }, []);

  const emitDelete = useCallback((payload: { conversationId: string; messageId: string }) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('deleteMessage', payload);
  }, []);

  const emitMarkAsRead = useCallback((payload: { conversationId: string; lastReadMessageId: string }) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('markAsRead', payload);
  }, []);

  const emitSetPresenceStatus = useCallback((status: ImPresenceStatus) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('setPresenceStatus', { status });
  }, []);

  return {
    emitDelete,
    emitEdit,
    emitMarkAsRead,
    emitSetPresenceStatus,
    emitTyping,
    emitWithAck,
  };
}
