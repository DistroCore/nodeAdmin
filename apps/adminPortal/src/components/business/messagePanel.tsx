import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { NavLink } from 'react-router-dom';
import type { ImMessageType, ImPresenceStatus } from '@nodeadmin/shared-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ImSendMessagePayload,
  ImSocketMessage,
  ImTypingEvent,
  useImSocket,
  type ImMessageDeletedEvent,
  type ImMessageEditedEvent,
  type ImPresenceEvent,
  type ImPresenceStatusEvent,
} from '@/hooks/useImSocket';
import { className } from '@/lib/className';
import { useApiClient } from '@/hooks/useApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { useSocketStore } from '@/stores/useSocketStore';
import { useUiStore } from '@/stores/useUiStore';
import { ImagePreviewOverlay } from './imagePreviewOverlay';

interface MessagePanelProps {
  conversationIdOverride?: string;
}

const maxSendAttempts = 3;
const ackTimeoutMs = 2000;
const retryDelayMs = 300;
const virtualRowHeightPx = 100; // Increased for bubble layout
const virtualOverscan = 8;
const typingExpirationMs = 3000;

interface RuntimeImConfig {
  conversationId: string;
  tenantId: string;
  userId: string;
}

interface TokenIssueResponse {
  accessToken: string;
  identity: {
    roles: string[];
    tenantId: string;
    userId: string;
  };
}

interface ConversationListResponse {
  rows: Array<{
    id: string;
    lastMessagePreview: string;
    name: string;
    unreadCount: number;
  }>;
}

type RequiredImEnvKey = 'VITE_IM_CONVERSATION_ID' | 'VITE_IM_TENANT_ID' | 'VITE_IM_USER_ID';
type TypingMap = Record<string, number>;

interface PendingImage {
  file: File;
  objectUrl: string;
}

interface UploadResponse {
  fileName: string;
  fileSizeBytes: number;
  url: string;
}

function toRequiredEnvValue(name: RequiredImEnvKey): string {
  const value = (import.meta.env[name] as string | undefined)?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in AdminPortal environment config.`);
  }

  return value;
}

function readRolesFromEnv(): string[] {
  const rolesRaw = (import.meta.env.VITE_IM_ROLES as string | undefined)?.trim();
  if (!rolesRaw) {
    return ['admin'];
  }

  const roles = rolesRaw
    .split(',')
    .map((role) => role.trim())
    .filter((role) => role.length > 0);
  return roles.length > 0 ? roles : ['admin'];
}

function renderMessageBody(message: ImSocketMessage, t: (id: { id: string }) => string, isMe: boolean): JSX.Element {
  if (message.deletedAt) {
    return <p className="text-sm italic opacity-70">{t({ id: 'im.messageDeleted' })}</p>;
  }

  if (message.messageType === 'image') {
    return (
      <div className="space-y-2">
        {message.metadata?.url ? (
          <img
            alt={message.metadata.fileName || 'image'}
            className="max-h-48 rounded-md border border-black/10 object-contain"
            src={message.metadata.url}
          />
        ) : null}
        <p className="break-all text-sm">{message.content}</p>
      </div>
    );
  }

  if (message.messageType === 'file') {
    return (
      <div className="space-y-1 text-sm">
        <p className="font-medium">{message.metadata?.fileName || t({ id: 'im.attachedFile' })}</p>
        {message.metadata?.url ? (
          <a
            className={className(
              'underline',
              isMe ? 'text-primary-foreground' : 'text-primary'
            )}
            href={message.metadata.url}
            rel="noreferrer"
            target="_blank"
          >
            {t({ id: 'im.openFile' })}
          </a>
        ) : null}
        <p className="break-all opacity-80">{message.content}</p>
      </div>
    );
  }

  if (message.messageType === 'system') {
    return <p className="text-xs italic text-muted-foreground text-center w-full my-2">{message.content}</p>;
  }

  return <p className="break-all text-sm leading-relaxed">{message.content}</p>;
}

export function MessagePanel({ conversationIdOverride }: MessagePanelProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const connectionState = useSocketStore((state) => state.connectionState);
  const setConnectionState = useSocketStore((state) => state.setConnectionState);
  const messages = useMessageStore((state) => state.messages);
  const resetMessages = useMessageStore((state) => state.resetMessages);
  const upsertMessage = useMessageStore((state) => state.upsertMessage);
  const accessToken = useAuthStore((state) => state.accessToken);
  const authTenantId = useAuthStore((state) => state.tenantId);
  const authUserId = useAuthStore((state) => state.userId);
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const setTenantId = useAuthStore((state) => state.setTenantId);
  const setUserId = useAuthStore((state) => state.setUserId);
  const canViewIm = usePermissionStore((state) => state.hasPermission('im:view'));
  const canSendMessage = usePermissionStore((state) => state.hasPermission('im:send'));

  const [sendState, setSendState] = useState<'failed' | 'idle' | 'retrying' | 'sending'>('idle');
  const [content, setContent] = useState('');
  const [messageType, setMessageType] = useState<ImMessageType>('text');
  const [assetUrl, setAssetUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [bootError, setBootError] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [typingUsers, setTypingUsers] = useState<TypingMap>({});
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [presenceMembers, setPresenceMembers] = React.useState<Set<string>>(new Set());
  const [, setPresenceStatusMap] = React.useState<Map<string, ImPresenceStatus>>(new Map());
  const [myPresenceStatus, setMyPresenceStatus] = useState<ImPresenceStatus>('online');
  const [viewportHeight, setViewportHeight] = useState(320);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const typingIdleTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const apiClient = useApiClient();

  // Dynamic viewport height via ResizeObserver
  useEffect(() => {
    const el = messageViewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const configuredRoles = useMemo(() => readRolesFromEnv(), []);

  const imConfig = useMemo<RuntimeImConfig | null>(() => {
    try {
      const resolvedConversationId =
        conversationIdOverride?.trim() || toRequiredEnvValue('VITE_IM_CONVERSATION_ID');
      return {
        conversationId: resolvedConversationId,
        tenantId: toRequiredEnvValue('VITE_IM_TENANT_ID'),
        userId: toRequiredEnvValue('VITE_IM_USER_ID'),
      };
    } catch {
      // Fallback: use auth store values from logged-in session
      const tenantId = authTenantId;
      const userId = authUserId;
      if (!tenantId || !userId) return null;
      return {
        conversationId: conversationIdOverride?.trim() || 'default',
        tenantId,
        userId,
      };
    }
  }, [conversationIdOverride, authTenantId, authUserId]);

  const conversationQuery = useQuery({
    queryFn: () => {
      const params = new URLSearchParams();
      if (imConfig?.tenantId) {
        params.set('tenantId', imConfig.tenantId);
      } else if (authTenantId) {
        params.set('tenantId', authTenantId);
      }
      const qs = params.toString();
      const url = `/api/v1/console/conversations${qs ? `?${qs}` : ''}`;
      return apiClient.get<ConversationListResponse>(url);
    },
    queryKey: ['console-conversations', imConfig?.tenantId ?? authTenantId],
  });

  useEffect(() => {
    if (!imConfig) {
      setBootError('Missing IM runtime config. Please set VITE_IM_* env vars or log in first.');
    }
  }, [imConfig]);

  const offlineQueueStorageKey = useMemo(() => {
    if (!imConfig) {
      return 'im-offline-queue:default';
    }

    return `im-offline-queue:${imConfig.tenantId}:${imConfig.conversationId}`;
  }, [imConfig]);

  const readOfflineQueue = useCallback((): ImSendMessagePayload[] => {
    try {
      const rawQueue = localStorage.getItem(offlineQueueStorageKey);
      if (!rawQueue) {
        return [];
      }

      const parsedQueue = JSON.parse(rawQueue) as ImSendMessagePayload[];
      return Array.isArray(parsedQueue) ? parsedQueue : [];
    } catch {
      return [];
    }
  }, [offlineQueueStorageKey]);

  const writeOfflineQueue = useCallback(
    (queue: ImSendMessagePayload[]) => {
      localStorage.setItem(offlineQueueStorageKey, JSON.stringify(queue));
      setOfflineQueueCount(queue.length);
    },
    [offlineQueueStorageKey]
  );

  const enqueueOfflinePayload = useCallback(
    (payload: ImSendMessagePayload) => {
      const queue = readOfflineQueue();
      queue.push(payload);
      writeOfflineQueue(queue);
    },
    [readOfflineQueue, writeOfflineQueue]
  );

  useEffect(() => {
    setOfflineQueueCount(readOfflineQueue().length);
  }, [readOfflineQueue, offlineQueueStorageKey]);

  const socketUrl = useMemo(() => {
    const envSocketUrl = (import.meta.env.VITE_CORE_API_SOCKET_URL as string | undefined)?.trim();
    if (envSocketUrl) {
      return envSocketUrl;
    }

    return `http://${window.location.hostname}:11451`;
  }, []);

  useEffect(() => {
    if (!imConfig) {
      return;
    }

    setTenantId(imConfig.tenantId);
    setUserId(imConfig.userId);

    const envAccessToken = (import.meta.env.VITE_IM_ACCESS_TOKEN as string | undefined)?.trim();
    if (envAccessToken) {
      setAccessToken(envAccessToken);
      setBootError(null);
      return;
    }

    let disposed = false;
    setConnectionState('connecting');

    const issueToken = async (): Promise<void> => {
      try {
        const payload = await apiClient.post<TokenIssueResponse>('/api/v1/auth/dev-token', {
          roles: configuredRoles,
          tenantId: imConfig.tenantId,
          userId: imConfig.userId,
        });

        if (!payload.accessToken || typeof payload.accessToken !== 'string') {
          throw new Error('Token issue response is missing accessToken.');
        }

        if (!disposed) {
          setAccessToken(payload.accessToken);
          setBootError(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to request access token.';
        if (!disposed) {
          setBootError(message);
          setConnectionState('disconnected');
        }
      }
    };

    void issueToken();

    return () => {
      disposed = true;
    };
  }, [
    apiClient,
    configuredRoles,
    imConfig,
    setAccessToken,
    setConnectionState,
    setTenantId,
    setUserId,
  ]);

  const handleConversationHistory = useCallback(
    (history: ImSocketMessage[]) => {
      resetMessages(history);
    },
    [resetMessages]
  );

  const handleMessageReceived = useCallback(
    (message: ImSocketMessage) => {
      upsertMessage(message);
    },
    [upsertMessage]
  );

  const handleTypingChanged = useCallback(
    (event: ImTypingEvent) => {
      if (
        !imConfig ||
        event.conversationId !== imConfig.conversationId ||
        event.userId === imConfig.userId
      ) {
        return;
      }

      setTypingUsers((current) => {
        if (!event.isTyping) {
          const next = { ...current };
          delete next[event.userId];
          return next;
        }

        return {
          ...current,
          [event.userId]: Date.now(),
        };
      });
    },
    [imConfig]
  );

  const handlePresenceChanged = React.useCallback((event: ImPresenceEvent) => {
    setPresenceMembers((prev) => {
      const next = new Set(prev);
      if (event.event === 'joined') {
        next.add(event.userId);
      } else if (event.event === 'left') {
        next.delete(event.userId);
        setPresenceStatusMap((prevMap) => {
          const nextMap = new Map(prevMap);
          nextMap.delete(event.userId);
          return nextMap;
        });
      }
      return next;
    });
  }, []);

  const handlePresenceStatusChanged = React.useCallback((event: ImPresenceStatusEvent) => {
    setPresenceStatusMap((prev) => {
      const next = new Map(prev);
      next.set(event.userId, event.status);
      return next;
    });
  }, []);

  const handleMessageEdited = useCallback(
    (event: ImMessageEditedEvent) => {
      upsertMessage(event.message);
    },
    [upsertMessage]
  );

  const handleMessageDeleted = useCallback(
    (event: ImMessageDeletedEvent) => {
      upsertMessage(event.message);
    },
    [upsertMessage]
  );

  const { emitDelete, emitEdit, emitSetPresenceStatus, emitTyping, emitWithAck } = useImSocket({
    accessToken,
    conversationId: imConfig?.conversationId ?? '',
    onConnectionStateChange: setConnectionState,
    onConversationHistory: handleConversationHistory,
    onMessageEdited: handleMessageEdited,
    onMessageDeleted: handleMessageDeleted,
    onMessageReceived: handleMessageReceived,
    onPresenceChanged: handlePresenceChanged,
    onPresenceStatusChanged: handlePresenceStatusChanged,
    onTypingChanged: handleTypingChanged,
    socketUrl,
  });

  useEffect(() => {
    if (!stickToBottom || !messageViewportRef.current) {
      return;
    }

    messageViewportRef.current.scrollTop = messageViewportRef.current.scrollHeight;
  }, [messages.length, stickToBottom]);

  useEffect(() => {
    const cleanupTimer = window.setInterval(() => {
      setTypingUsers((current) => {
        const now = Date.now();
        const nextEntries = Object.entries(current).filter(
          (entry) => now - entry[1] <= typingExpirationMs
        );
        return Object.fromEntries(nextEntries);
      });
    }, 1000);

    return () => {
      window.clearInterval(cleanupTimer);
    };
  }, []);

  useEffect(() => {
    if (!imConfig || connectionState !== 'connected') {
      return;
    }

    let disposed = false;
    const flushOfflineQueue = async (): Promise<void> => {
      const queue = readOfflineQueue();
      if (queue.length === 0) {
        return;
      }

      const remainingQueue: ImSendMessagePayload[] = [];
      for (const payload of queue) {
        if (disposed) {
          return;
        }

        const ack = await emitWithAck(payload, ackTimeoutMs);
        if (!ack || !ack.accepted) {
          remainingQueue.push(payload);
        }
      }

      writeOfflineQueue(remainingQueue);
    };

    void flushOfflineQueue();

    return () => {
      disposed = true;
    };
  }, [connectionState, emitWithAck, imConfig, readOfflineQueue, writeOfflineQueue]);

  const extractImageFile = useCallback(
    (dataTransfer: DataTransfer): File | null => {
      const items = dataTransfer.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) return file;
        }
      }
      if (dataTransfer.files && dataTransfer.files.length > 0) {
        const file = dataTransfer.files[0];
        if (file.type.startsWith('image/')) return file;
      }
      return null;
    },
    []
  );

  const handleImageCaptured = useCallback((file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setPendingImage({ file, objectUrl });
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      if (!canSendMessage || !imConfig) return;
      const file = extractImageFile(event.clipboardData);
      if (file) {
        event.preventDefault();
        handleImageCaptured(file);
      }
    },
    [canSendMessage, imConfig, extractImageFile, handleImageCaptured]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canSendMessage || !imConfig) return;
      setDragOver(false);
      const file = extractImageFile(event.dataTransfer);
      if (file) {
        handleImageCaptured(file);
      }
    },
    [canSendMessage, imConfig, extractImageFile, handleImageCaptured]
  );

  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
  }, []);

  const cancelPendingImage = useCallback(() => {
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage.objectUrl);
    }
    setPendingImage(null);
  }, [pendingImage]);

  const stopTyping = useCallback(() => {
    if (!imConfig) {
      return;
    }

    emitTyping({
      conversationId: imConfig.conversationId,
      isTyping: false,
    });

    if (typingIdleTimerRef.current !== null) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
  }, [emitTyping, imConfig]);

  const uploadAndSendImage = useCallback(async () => {
    if (!pendingImage || !imConfig || !canSendMessage) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingImage.file);

      const result = await apiClient.post<UploadResponse>(
        '/api/v1/im/upload',
        formData
      );

      const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload: ImSendMessagePayload = {
        content: pendingImage.file.name,
        conversationId: imConfig.conversationId,
        messageId: `msg-${nonce}`,
        messageType: 'image',
        metadata: {
          fileName: result.fileName,
          fileSizeBytes: result.fileSizeBytes,
          url: result.url,
        },
        traceId: `trace-${nonce}`,
      };

      if (connectionState === 'connected') {
        setSendState('sending');
        const ack = await emitWithAck(payload, ackTimeoutMs);
        if (ack && ack.accepted) {
          setSendState('idle');
          setBootError(null);
          stopTyping();
        } else {
          enqueueOfflinePayload(payload);
          setSendState('failed');
          setBootError('Image send failed. Added to offline queue for retry.');
        }
      } else {
        enqueueOfflinePayload(payload);
        setBootError('Socket is offline. Image queued for automatic sync.');
        setSendState('idle');
      }

      URL.revokeObjectURL(pendingImage.objectUrl);
      setPendingImage(null);
    } catch (err) {
      setBootError(
        err instanceof Error ? err.message : 'Image upload failed.'
      );
      setSendState('failed');
    } finally {
      setUploading(false);
    }
  }, [
    pendingImage,
    imConfig,
    canSendMessage,
    apiClient,
    connectionState,
    emitWithAck,
    enqueueOfflinePayload,
    stopTyping,
  ]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  const wait = (ms: number): Promise<void> => {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  };

  const buildPayload = (): ImSendMessagePayload | null => {
    if (!imConfig) {
      return null;
    }

    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return null;
    }

    if ((messageType === 'image' || messageType === 'file') && assetUrl.trim().length === 0) {
      setSendState('failed');
      setBootError('Image or file message requires a URL.');
      return null;
    }

    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload: ImSendMessagePayload = {
      content: normalizedContent,
      conversationId: imConfig.conversationId,
      messageId: `msg-${nonce}`,
      messageType,
      traceId: `trace-${nonce}`,
    };

    if (messageType === 'image' || messageType === 'file') {
      payload.metadata = {
        fileName: fileName.trim() || undefined,
        url: assetUrl.trim(),
      };
    }

    return payload;
  };

  const sendMessage = async (): Promise<void> => {
    if (!imConfig || !canSendMessage || sendState === 'sending' || sendState === 'retrying') {
      return;
    }

    const payload = buildPayload();
    if (!payload) {
      return;
    }

    if (connectionState !== 'connected') {
      enqueueOfflinePayload(payload);
      setContent('');
      setBootError('Socket is offline. Message queued for automatic sync.');
      setSendState('idle');
      return;
    }

    setSendState('sending');

    for (let attempt = 1; attempt <= maxSendAttempts; attempt += 1) {
      const ack = await emitWithAck(payload, ackTimeoutMs);
      if (ack && ack.accepted) {
        setContent('');
        setSendState('idle');
        setBootError(null);
        stopTyping();
        return;
      }

      if (attempt < maxSendAttempts) {
        setSendState('retrying');
        await wait(retryDelayMs * attempt);
      }
    }

    enqueueOfflinePayload(payload);
    setSendState('failed');
    setBootError('Message send failed. Added to offline queue for retry.');
  };

  const connectionLabel =
    connectionState === 'connected'
      ? t({ id: 'im.connected' })
      : connectionState === 'reconnecting'
        ? t({ id: 'im.reconnecting' })
        : connectionState;

  const sendLabel =
    sendState === 'retrying'
      ? 'sending retry...'
      : sendState === 'failed'
        ? 'send failed'
        : undefined;
  const typingUsersLabel = Object.keys(typingUsers).join(', ');

  const totalCount = messages.length;
  const firstVisibleIndex = Math.max(
    0,
    Math.floor(scrollTop / virtualRowHeightPx) - virtualOverscan
  );
  const visibleCount =
    Math.ceil((viewportHeight || 320) / virtualRowHeightPx) + virtualOverscan * 2;
  const lastVisibleIndex = Math.min(totalCount, firstVisibleIndex + visibleCount);
  const virtualItems = messages.slice(firstVisibleIndex, lastVisibleIndex);
  const topSpacerHeight = firstVisibleIndex * virtualRowHeightPx;
  const bottomSpacerHeight = (totalCount - lastVisibleIndex) * virtualRowHeightPx;

  const conversationPanelOpen = useUiStore((s) => s.imConversationPanelOpen);
  const setConversationPanelOpen = useUiStore((s) => s.setImConversationPanelOpen);
  const toggleConversationPanel = useUiStore((s) => s.toggleImConversationPanel);

  if (!canViewIm) {
    return (
      <section className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {t({ id: 'permission.imDenied' })}
      </section>
    );
  }

  return (
    <section className="flex h-full w-full overflow-hidden rounded-md border border-border bg-card md:gap-4 md:p-4">
      {/* Mobile backdrop */}
      {conversationPanelOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setConversationPanelOpen(false)}
        />
      ) : null}

      {/* Conversation list — desktop: collapsible, mobile: slide-over */}
      <aside
        className={className(
          'shrink-0 rounded-md border border-border bg-background p-3 transition-all duration-200 overflow-hidden',
          // Mobile: fixed overlay
          'fixed inset-y-0 left-0 z-40 w-72 md:relative md:z-0 md:shadow-none',
          conversationPanelOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          // Desktop: collapsible width
          'md:translate-x-0',
          conversationPanelOpen ? 'md:w-72' : 'md:w-0 md:p-0 md:border-0'
        )}
      >
        <h3 className="mb-2 text-sm font-semibold">{t({ id: 'im.conversations' })}</h3>
        {conversationQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">{t({ id: 'im.loadingConversations' })}</p>
        ) : null}
        {conversationQuery.isError ? (
          <p className="text-xs text-destructive">{t({ id: 'im.loadConversationsFailed' })}</p>
        ) : null}
        <ul className="space-y-2">
          {(conversationQuery.data?.rows ?? []).map((conversation) => (
            <li key={conversation.id}>
              <NavLink
                className={({ isActive }) =>
                  [
                    'block rounded-md border border-border px-3 py-2 text-xs',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-card-foreground',
                  ].join(' ')
                }
                to={`/im/${conversation.id}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold">{conversation.name}</span>
                  {conversation.unreadCount > 0 ? <Badge>{conversation.unreadCount}</Badge> : null}
                </div>
                <p className="truncate text-[11px] opacity-80">{conversation.lastMessagePreview}</p>
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4 min-h-0 bg-background/50">
        <header className="flex shrink-0 items-center justify-between px-3 py-2 border-b bg-card md:rounded-t-lg">
          <div className="flex items-center gap-2">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent md:hidden"
              onClick={toggleConversationPanel}
              type="button"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold md:text-base">{t({ id: 'im.conversation' })}</h2>
              <div className="text-[10px] text-muted-foreground md:text-xs">
                {t({ id: 'im.online' }, { count: presenceMembers.size })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {offlineQueueCount > 0 ? (
              <Badge variant="secondary" className="text-[10px]">
                {t({ id: 'im.offlineQueue' }, { count: offlineQueueCount })}
              </Badge>
            ) : null}
            <Badge variant={connectionState === 'connected' ? 'default' : 'secondary'} className="text-[10px]">
              {connectionLabel}
            </Badge>
            {connectionState === 'connected' ? (
              <select
                className="rounded border border-border bg-transparent px-1 py-0.5 text-[10px] outline-none"
                value={myPresenceStatus}
                onChange={(e) => {
                  const next = e.target.value as ImPresenceStatus;
                  setMyPresenceStatus(next);
                  emitSetPresenceStatus(next);
                }}
              >
                <option value="online">{t({ id: 'im.statusOnline' })}</option>
                <option value="away">{t({ id: 'im.statusAway' })}</option>
                <option value="dnd">{t({ id: 'im.statusDnd' })}</option>
              </select>
            ) : null}
          </div>
        </header>

        <div
          className={className(
            'min-h-0 flex-1 overflow-y-auto p-3 transition-colors space-y-4',
            dragOver && 'ring-2 ring-primary/50 bg-primary/5'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onScroll={(event) => {
            const node = event.currentTarget;
            const remainingDistance = node.scrollHeight - (node.scrollTop + node.clientHeight);
            setStickToBottom(remainingDistance < virtualRowHeightPx * 1.5);
            setScrollTop(node.scrollTop);
          }}
          ref={messageViewportRef}
        >
          <div style={{ height: topSpacerHeight }} />
          <ul className="flex flex-col gap-4">
            {virtualItems.map((message) => {
              const isMe = message.userId === imConfig?.userId;
              const isSystem = message.messageType === 'system';

              if (isSystem) {
                return (
                  <li key={message.messageId} className="flex justify-center">
                    <span className="rounded-full bg-muted px-3 py-1 text-[10px] text-muted-foreground italic">
                      {message.content}
                    </span>
                  </li>
                );
              }

              return (
                <li
                  className={className(
                    'flex flex-col max-w-[85%] md:max-w-[75%]',
                    isMe ? 'ml-auto items-end' : 'mr-auto items-start'
                  )}
                  key={message.messageId}
                >
                  <div className="mb-1 flex items-center gap-2 px-1">
                    {!isMe && <span className="text-[10px] font-bold opacity-70">{message.userId}</span>}
                    <span className="text-[10px] opacity-50">{message.createdAt}</span>
                  </div>
                  
                  <div
                    className={className(
                      'relative group rounded-2xl px-4 py-2 shadow-sm text-sm',
                      isMe 
                        ? 'bg-primary text-primary-foreground rounded-tr-none' 
                        : 'bg-card border border-border text-card-foreground rounded-tl-none'
                    )}
                  >
                    {editingMessageId === message.messageId ? (
                      <div className="flex flex-col gap-2 min-w-[200px]">
                        <textarea
                          autoFocus
                          className="w-full bg-transparent border-none resize-none focus:outline-none text-sm"
                          rows={2}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (editContent.trim()) {
                                emitEdit({
                                  conversationId: message.conversationId,
                                  content: editContent.trim(),
                                  messageId: message.messageId,
                                });
                              }
                              setEditingMessageId(null);
                            }
                            if (e.key === 'Escape') {
                              setEditingMessageId(null);
                            }
                          }}
                          value={editContent}
                        />
                        <div className="flex justify-end gap-2 border-t border-white/20 pt-2">
                          <button 
                            className="text-[10px] opacity-80 hover:opacity-100" 
                            onClick={() => setEditingMessageId(null)}
                          >
                            {t({ id: 'common.cancel' })}
                          </button>
                        </div>
                      </div>
                    ) : (
                      renderMessageBody(message, t, isMe)
                    )}

                    {/* Actions on hover */}
                    {!message.deletedAt && isMe && canSendMessage && (
                      <div className={className(
                        "absolute top-0 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100",
                        isMe ? "-left-12 pr-2" : "-right-12 pl-2"
                      )}>
                        <button
                          className="rounded-full bg-muted p-1.5 text-muted-foreground hover:bg-accent"
                          onClick={() => {
                            setEditingMessageId(message.messageId);
                            setEditContent(message.content);
                          }}
                          title={t({ id: 'im.editMessage' })}
                          type="button"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          className="rounded-full bg-muted p-1.5 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (window.confirm(t({ id: 'im.deleteConfirm' }))) {
                              emitDelete({
                                conversationId: message.conversationId,
                                messageId: message.messageId,
                              });
                            }
                          }}
                          title={t({ id: 'im.deleteMessage' })}
                          type="button"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {message.editedAt && !message.deletedAt && (
                    <span className="mt-1 text-[10px] opacity-40 italic">{t({ id: 'im.edited' })}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <div style={{ height: bottomSpacerHeight }} />
        </div>

        {/* Typing and Send Label */}
        {(typingUsersLabel || sendLabel || bootError) && (
          <div className="px-4 py-1 text-[10px] animate-pulse">
            {bootError && <span className="text-destructive mr-2">{bootError}</span>}
            {sendLabel && <span className="text-muted-foreground mr-2">{sendLabel}</span>}
            {typingUsersLabel && (
              <span className="text-primary italic">
                {t({ id: 'im.typing' }, { users: typingUsersLabel })}
              </span>
            )}
          </div>
        )}

        {/* Input Area */}
        <div className="p-3 border-t bg-card md:rounded-b-lg">
          <div className="flex flex-col gap-2">
            {/* Options for mobile - more compact */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-[10px] outline-none"
                onChange={(event) => setMessageType(event.target.value as ImMessageType)}
                value={messageType}
              >
                <option value="text">{t({ id: 'im.type.text' })}</option>
                <option value="image">{t({ id: 'im.type.image' })}</option>
                <option value="file">{t({ id: 'im.type.file' })}</option>
                <option value="system">{t({ id: 'im.type.system' })}</option>
              </select>
              
              <Button
                disabled={!canSendMessage || uploading}
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-[10px] px-2"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t({ id: 'im.attachImage' })}
              </Button>
            </div>

            {(messageType === 'image' || messageType === 'file') && (
              <div className="grid grid-cols-1 gap-2 mb-2 md:grid-cols-2">
                <Input
                  className="h-8 text-xs"
                  onChange={(event) => setAssetUrl(event.target.value)}
                  placeholder={t({ id: 'im.assetUrlPlaceholder' })}
                  value={assetUrl}
                />
                <Input
                  className="h-8 text-xs"
                  onChange={(event) => setFileName(event.target.value)}
                  placeholder={t({ id: 'im.fileNamePlaceholder' })}
                  value={fileName}
                />
              </div>
            )}

            <div className="flex gap-2">
              <Input
                className="flex-1 h-11 md:h-10 text-sm rounded-2xl px-4"
                onBlur={stopTyping}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setContent(nextValue);
                  if (!canSendMessage || !imConfig) return;
                  emitTyping({ conversationId: imConfig.conversationId, isTyping: true });
                  if (typingIdleTimerRef.current !== null) window.clearTimeout(typingIdleTimerRef.current);
                  typingIdleTimerRef.current = window.setTimeout(() => {
                    emitTyping({ conversationId: imConfig.conversationId, isTyping: false });
                  }, 1200);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                onPaste={handlePaste}
                placeholder={t({ id: 'im.inputPlaceholder' })}
                value={content}
              />
              <Button
                disabled={!canSendMessage || sendState === 'sending' || sendState === 'retrying'}
                onClick={() => void sendMessage()}
                className="h-11 md:h-10 rounded-2xl px-6"
                variant="default"
              >
                {t({ id: 'im.send' })}
              </Button>
            </div>
          </div>
        </div>

        {pendingImage && (
          <ImagePreviewOverlay
            fileName={pendingImage.file.name}
            objectUrl={pendingImage.objectUrl}
            onCancel={cancelPendingImage}
            onConfirm={() => void uploadAndSendImage()}
            uploading={uploading}
          />
        )}

        <input
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleImageCaptured(file);
            event.target.value = '';
          }}
          ref={fileInputRef}
          style={{ display: 'none' }}
          type="file"
        />

        {!canSendMessage && (
          <p className="text-[10px] text-muted-foreground px-4 pb-2">{t({ id: 'im.readonly' })}</p>
        )}
      </div>
    </section>
  );
}
