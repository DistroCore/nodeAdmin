import { useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ImMessage, ImMessageType, MessageMetadata } from '@nodeadmin/shared-types';
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

interface UseImSocketOptions {
  accessToken: string | null;
  conversationId: string;
  onConnectionStateChange: (connectionState: SocketConnectionState) => void;
  onConversationHistory: (history: ImSocketMessage[]) => void;
  onMessageReceived: (message: ImSocketMessage) => void;
  onTypingChanged?: (event: ImTypingEvent) => void;
  onPresenceChanged?: (event: ImPresenceEvent) => void;
  socketUrl: string;
}

export function useImSocket(options: UseImSocketOptions): {
  emitTyping: (payload: { conversationId: string; isTyping: boolean }) => void;
  emitWithAck: (
    payload: ImSendMessagePayload,
    timeoutMs: number
  ) => Promise<ImSendMessageAck | null>;
} {
  const {
    accessToken,
    conversationId,
    onConnectionStateChange,
    onConversationHistory,
    onMessageReceived,
    onTypingChanged,
    onPresenceChanged,
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
      reconnectionAttempts: 5,
      reconnectionDelay: 500,
      transports: ['websocket'],
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
    if (onTypingChanged) {
      socket.on('typingChanged', onTypingChanged);
    }
    if (onPresenceChanged) {
      socket.on('presenceChanged', onPresenceChanged);
    }

    return () => {
      if (onTypingChanged) {
        socket.off('typingChanged', onTypingChanged);
      }
      if (onPresenceChanged) {
        socket.off('presenceChanged', onPresenceChanged);
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    accessToken,
    conversationId,
    onConnectionStateChange,
    onConversationHistory,
    onMessageReceived,
    onTypingChanged,
    socketUrl,
    onPresenceChanged,
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
    []
  );

  return {
    emitTyping,
    emitWithAck,
  };
}
