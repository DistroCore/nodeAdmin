import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { NavLink } from 'react-router-dom';
import type { ImMessageType, ImPresenceStatus } from '@nodeadmin/shared-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  ImSendMessagePayload,
  ImSocketMessage,
  ImTypingEvent,
  useImSocket,
  type ImMessageDeletedEvent,
  type ImMessageEditedEvent,
  type ImPresenceEvent,
} from '@/hooks/useImSocket';
import { className } from '@/lib/className';
import { useApiClient } from '@/hooks/useApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { useSocketStore } from '@/stores/useSocketStore';
import { useUiStore } from '@/stores/useUiStore';
import { ImagePreviewOverlay } from './imagePreviewOverlay';

// --- Sub-components ---

interface MessageBodyProps {
  message: ImSocketMessage;
  isMe: boolean;
}

function MessageBody({ message, isMe }: MessageBodyProps): JSX.Element {
  const { formatMessage: t } = useIntl();

  if (message.deletedAt) {
    return <p className="text-sm italic opacity-70">{t({ id: 'im.messageDeleted' })}</p>;
  }

  switch (message.messageType) {
    case 'image':
      return (
        <div className="space-y-2">
          {message.metadata?.url ? (
            <div className="relative group/img overflow-hidden rounded-md border border-black/10 bg-muted/20 min-h-24 flex items-center justify-center">
              <img
                alt={message.metadata.fileName || 'image'}
                className="max-h-60 max-w-full object-contain transition-transform group-hover/img:scale-105"
                src={message.metadata.url}
                loading="lazy"
              />
            </div>
          ) : null}
          {message.content && <p className="break-all text-sm">{message.content}</p>}
        </div>
      );
    case 'file':
      return (
        <div className="flex items-center gap-3 p-1 rounded-lg">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isMe ? 'bg-white/20' : 'bg-primary/10'}`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">
              {message.metadata?.fileName || t({ id: 'im.attachedFile' })}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {message.metadata?.url && (
                <a
                  className={className(
                    'text-[0.625rem] font-bold uppercase tracking-wider hover:underline',
                    isMe ? 'text-white' : 'text-primary'
                  )}
                  href={message.metadata.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t({ id: 'im.openFile' })}
                </a>
              )}
              {message.metadata?.fileSizeBytes && (
                <span className="text-[0.625rem] opacity-60">
                  {(message.metadata.fileSizeBytes / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </div>
          </div>
        </div>
      );
    case 'system':
      return (
        <div className="flex justify-center w-full my-1">
          <span className="rounded-full bg-muted/50 px-3 py-1 text-[0.625rem] text-muted-foreground italic">
            {message.content}
          </span>
        </div>
      );
    default:
      return (
        <p className="break-all text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
      );
  }
}

// --- Main Component ---

interface MessagePanelProps {
  conversationIdOverride?: string;
}

const maxSendAttempts = 3;
const ackTimeoutMs = 2000;
const retryDelayMs = 300;
const virtualRowHeightPx = 100;
const virtualOverscan = 10;
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
    updatedAt: string;
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
  const [myPresenceStatus, setMyPresenceStatus] = useState<ImPresenceStatus>('online');
  const [viewportHeight, setViewportHeight] = useState(320);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const typingIdleTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastTypingEmitRef = useRef<number>(0);
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
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!imConfig) {
      setBootError(t({ id: 'im.bootError.missingConfig' }));
    }
  }, [imConfig, t]);

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
          throw new Error(t({ id: 'im.bootError.tokenMissing' }));
        }

        if (!disposed) {
          setAccessToken(payload.accessToken);
          setBootError(null);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t({ id: 'im.bootError.tokenFailed' });
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
    t,
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
      // Auto scroll if sticking
      if (stickToBottom && messageViewportRef.current) {
        setTimeout(() => {
          if (messageViewportRef.current) {
            messageViewportRef.current.scrollTop = messageViewportRef.current.scrollHeight;
          }
        }, 50);
      }
    },
    [upsertMessage, stickToBottom]
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
      }
      return next;
    });
  }, []);

  const handlePresenceStatusChanged = React.useCallback((): void => {
    // presence status updates are handled via socket events
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
        if (nextEntries.length === Object.keys(current).length) return current;
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

  const extractImageFile = useCallback((dataTransfer: DataTransfer): File | null => {
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
  }, []);

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

  const TYPING_THROTTLE_MS = 500;

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!canSendMessage || !imConfig) return;

      const now = Date.now();
      if (isTyping && now - lastTypingEmitRef.current < TYPING_THROTTLE_MS) {
        return;
      }

      emitTyping({ conversationId: imConfig.conversationId, isTyping });
      if (isTyping) {
        lastTypingEmitRef.current = now;
      }
    },
    [canSendMessage, imConfig, emitTyping]
  );

  const stopTyping = useCallback(() => {
    if (!imConfig) {
      return;
    }

    handleTyping(false);

    if (typingIdleTimerRef.current !== null) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
  }, [handleTyping, imConfig]);

  const uploadAndSendImage = useCallback(async () => {
    if (!pendingImage || !imConfig || !canSendMessage) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingImage.file);

      const result = await apiClient.post<UploadResponse>('/api/v1/im/upload', formData);

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
          setBootError(t({ id: 'im.bootError.imageSendFailed' }));
        }
      } else {
        enqueueOfflinePayload(payload);
        setBootError(t({ id: 'im.bootError.imageOffline' }));
        setSendState('idle');
      }

      URL.revokeObjectURL(pendingImage.objectUrl);
      setPendingImage(null);
    } catch (err) {
      setBootError(
        err instanceof Error ? err.message : t({ id: 'im.bootError.imageUploadFailed' })
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
    t,
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
      setBootError(t({ id: 'im.bootError.assetUrlRequired' }));
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
      setBootError(t({ id: 'im.bootError.messageOffline' }));
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
    setBootError(t({ id: 'im.bootError.messageFailed' }));
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

  const typingUserIds = Object.keys(typingUsers);
  const typingUsersLabel = typingUserIds.length > 0 ? typingUserIds.join(', ') : undefined;

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

      {/* Conversation list */}
      <aside
        className={className(
          'shrink-0 border-r border-border bg-muted/30 dark:bg-muted/10 transition-all duration-200 overflow-hidden',
          'fixed inset-y-0 left-0 z-40 w-72 md:relative md:z-0 md:shadow-none',
          conversationPanelOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          'md:translate-x-0',
          conversationPanelOpen ? 'md:w-72' : 'md:w-0 md:p-0 md:border-0'
        )}
      >
        <div className="flex items-center justify-between mb-4 px-4 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {t({ id: 'im.conversations' })}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-muted"
            onClick={() => conversationQuery.refetch()}
          >
            <svg
              className={`h-3.5 w-3.5 ${conversationQuery.isFetching ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </Button>
        </div>

        {conversationQuery.isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded bg-muted/50" />
            ))}
          </div>
        ) : null}

        <ul className="space-y-1 overflow-y-auto max-h-[calc(100%-5rem)]">
          {(conversationQuery.data?.rows ?? []).map((conversation) => (
            <li key={conversation.id}>
              <NavLink
                className={({ isActive }) =>
                  className(
                    'block border-l-4 py-3 px-4 transition-all hover:bg-muted/80',
                    isActive
                      ? 'bg-background border-primary text-primary shadow-sm font-bold'
                      : 'bg-transparent border-transparent text-muted-foreground font-medium'
                  )
                }
                to={`/im/${conversation.id}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{conversation.name}</span>
                  {conversation.unreadCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="h-5 min-w-5 justify-center px-1 text-[0.625rem] animate-in zoom-in"
                    >
                      {conversation.unreadCount}
                    </Badge>
                  )}
                </div>
                <p
                  className={className(
                    'truncate text-[0.6875rem] opacity-70',
                    conversation.lastMessagePreview ? 'italic' : 'opacity-40'
                  )}
                >
                  {conversation.lastMessagePreview || t({ id: 'im.noMessages' })}
                </p>
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4 min-h-0 bg-background/50">
        <header className="flex shrink-0 items-center justify-between px-4 py-3 border-b bg-card md:rounded-t-lg shadow-sm">
          <div className="flex items-center gap-3">
            <button
              aria-label={t({ id: 'im.toggleConversations' })}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border hover:bg-accent md:hidden transition-colors"
              onClick={toggleConversationPanel}
              type="button"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                <svg
                  className="text-primary h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold md:text-base leading-none mb-1">
                  {t({ id: 'im.conversation' })}
                </h2>
                <div className="flex items-center gap-1.5 text-[0.625rem] md:text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-muted-foreground font-medium">
                    {t({ id: 'im.online' }, { count: presenceMembers.size })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {connectionState === 'connected' ? (
              <div className="hidden sm:flex items-center gap-2 mr-2">
                <Badge
                  variant="outline"
                  className="text-[0.625rem] capitalize font-medium px-2 py-0.5 border-green-500/30 text-green-600 bg-green-50/50 dark:bg-green-950/20"
                >
                  {myPresenceStatus}
                </Badge>
              </div>
            ) : null}

            <Badge
              variant={
                connectionState === 'connected'
                  ? 'default'
                  : connectionState === 'reconnecting'
                    ? 'secondary'
                    : 'destructive'
              }
              className={className(
                'text-[0.625rem] px-2 py-0.5 font-bold uppercase tracking-tighter',
                connectionState === 'reconnecting' && 'animate-pulse'
              )}
            >
              {connectionLabel}
            </Badge>

            <select
              aria-label={t({ id: 'im.presenceStatus' })}
              className="hidden md:block rounded-lg border border-border bg-background px-2 py-1 text-[0.625rem] font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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
          </div>
        </header>

        <div
          className={className(
            'min-h-0 flex-1 overflow-y-auto p-4 transition-colors relative scroll-smooth',
            dragOver && 'ring-2 ring-primary/50 bg-primary/5'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onScroll={(event) => {
            const node = event.currentTarget;
            const remainingDistance = node.scrollHeight - (node.scrollTop + node.clientHeight);
            setStickToBottom(remainingDistance < virtualRowHeightPx * 2);
            setScrollTop(node.scrollTop);
          }}
          ref={messageViewportRef}
        >
          <div style={{ height: topSpacerHeight }} />
          <ul className="flex flex-col gap-5">
            {virtualItems.map((message) => {
              const isMe = message.userId === imConfig?.userId;
              const isSystem = message.messageType === 'system';

              if (isSystem) {
                return <MessageBody key={message.messageId} message={message} isMe={false} />;
              }

              return (
                <li
                  className={className(
                    'flex flex-col max-w-[90%] md:max-w-[80%]',
                    isMe ? 'ml-auto items-end' : 'mr-auto items-start'
                  )}
                  key={message.messageId}
                >
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    {!isMe && (
                      <span className="text-[0.625rem] font-bold text-primary">
                        {message.userId}
                      </span>
                    )}
                    <span className="text-[0.625rem] text-muted-foreground opacity-70">
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isMe && (
                      <div className="flex h-3 w-3 items-center justify-center">
                        <svg
                          className="h-2.5 w-2.5 text-primary"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="3"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div
                    className={className(
                      'relative group rounded-2xl px-4 py-2.5 shadow-sm text-sm border transition-shadow hover:shadow-md',
                      isMe
                        ? 'bg-primary text-primary-foreground border-primary rounded-tr-none'
                        : 'bg-card border-border text-card-foreground rounded-tl-none'
                    )}
                  >
                    {editingMessageId === message.messageId ? (
                      <div className="flex flex-col gap-3 min-w-52">
                        <textarea
                          autoFocus
                          className="w-full bg-transparent border-none resize-none focus:outline-none text-sm font-medium leading-relaxed"
                          rows={3}
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
                        <div className="flex justify-end gap-2 border-t border-white/10 dark:border-white/5 pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[0.625rem] font-bold uppercase tracking-widest text-inherit hover:bg-white/10"
                            onClick={() => setEditingMessageId(null)}
                          >
                            {t({ id: 'common.cancel' })}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 text-[0.625rem] font-bold uppercase tracking-widest"
                            onClick={() => {
                              if (editContent.trim()) {
                                emitEdit({
                                  conversationId: message.conversationId,
                                  content: editContent.trim(),
                                  messageId: message.messageId,
                                });
                              }
                              setEditingMessageId(null);
                            }}
                          >
                            {t({ id: 'common.save' })}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <MessageBody message={message} isMe={isMe} />
                    )}

                    {/* Actions on hover */}
                    {!message.deletedAt && isMe && canSendMessage && (
                      <div
                        className={className(
                          'absolute top-0 flex gap-1 opacity-0 transition-all group-hover:opacity-100 scale-90 group-hover:scale-100',
                          isMe ? '-left-14 pr-2' : '-right-14 pl-2'
                        )}
                      >
                        <button
                          aria-label={t({ id: 'im.editMessage' })}
                          className="rounded-lg bg-card border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground shadow-sm transition-colors"
                          onClick={() => {
                            setEditingMessageId(message.messageId);
                            setEditContent(message.content);
                          }}
                          title={t({ id: 'im.editMessage' })}
                          type="button"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          aria-label={t({ id: 'im.deleteMessage' })}
                          className="rounded-lg bg-card border border-border p-1.5 text-destructive hover:bg-destructive/10 shadow-sm transition-colors"
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
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {message.editedAt && !message.deletedAt && (
                    <span className="mt-1 text-[0.5625rem] font-bold uppercase tracking-widest opacity-40 italic">
                      {t({ id: 'im.edited' })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div style={{ height: bottomSpacerHeight }} />

          {/* Scroll to bottom button */}
          {!stickToBottom && messages.length > 5 && (
            <Button
              className="fixed bottom-32 right-8 h-10 w-10 rounded-full shadow-lg border border-border animate-bounce"
              onClick={() => {
                setStickToBottom(true);
                if (messageViewportRef.current) {
                  messageViewportRef.current.scrollTop = messageViewportRef.current.scrollHeight;
                }
              }}
              size="icon"
              variant="secondary"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 14l-7 7-7-7"
                />
              </svg>
            </Button>
          )}
        </div>

        {/* Typing and Status Footer */}
        {(typingUsersLabel || sendLabel || bootError || offlineQueueCount > 0) && (
          <div className="px-5 py-1.5 flex items-center justify-between bg-muted/20 border-y border-border/50">
            <div className="flex items-center gap-3">
              {typingUsersLabel && (
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0.4s]" />
                  </div>
                  <span className="text-[0.625rem] font-bold text-primary uppercase tracking-wider">
                    {t({ id: 'im.typing' }, { users: typingUsersLabel })}
                  </span>
                </div>
              )}
              {sendLabel && (
                <span className="text-[0.625rem] font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                  {sendLabel}
                </span>
              )}
              {bootError && (
                <span className="text-[0.625rem] font-bold text-destructive uppercase tracking-widest">
                  {bootError}
                </span>
              )}
            </div>

            {offlineQueueCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span className="text-[0.625rem] font-bold text-amber-600 uppercase tracking-widest">
                  {t({ id: 'im.offlineQueue' }, { count: offlineQueueCount })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 border-t bg-card md:rounded-b-xl shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <div className="relative">
                <select
                  aria-label={t({ id: 'im.messageType' })}
                  className="h-8 appearance-none rounded-lg border border-border bg-background pl-2 pr-8 text-[0.625rem] font-bold uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                  onChange={(event) => setMessageType(event.target.value as ImMessageType)}
                  value={messageType}
                >
                  <option value="text">{t({ id: 'im.type.text' })}</option>
                  <option value="image">{t({ id: 'im.type.image' })}</option>
                  <option value="file">{t({ id: 'im.type.file' })}</option>
                  <option value="system">{t({ id: 'im.type.system' })}</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              <div className="h-4 w-px bg-border mx-1" />

              <Button
                disabled={!canSendMessage || uploading}
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                variant="ghost"
                className="h-8 gap-2 text-[0.625rem] font-bold uppercase tracking-widest px-3 hover:bg-primary/5 hover:text-primary transition-all"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t({ id: 'im.attachImage' })}
              </Button>
            </div>

            {(messageType === 'image' || messageType === 'file') && (
              <div className="grid grid-cols-1 gap-3 animate-in fade-in slide-in-from-top-1 md:grid-cols-2">
                <Input
                  className="h-10 text-xs font-medium bg-muted/20 border-dashed"
                  onChange={(event) => setAssetUrl(event.target.value)}
                  placeholder={t({ id: 'im.assetUrlPlaceholder' })}
                  value={assetUrl}
                />
                <Input
                  className="h-10 text-xs font-medium bg-muted/20 border-dashed"
                  onChange={(event) => setFileName(event.target.value)}
                  placeholder={t({ id: 'im.fileNamePlaceholder' })}
                  value={fileName}
                />
              </div>
            )}

            <div className="flex gap-2">
              <Input
                className="flex-1 h-12 text-sm rounded-xl px-4 border-border bg-background shadow-inner transition-all focus:ring-4 focus:ring-primary/10"
                onBlur={stopTyping}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setContent(nextValue);
                  if (!canSendMessage || !imConfig) return;

                  handleTyping(true);

                  if (typingIdleTimerRef.current !== null) {
                    window.clearTimeout(typingIdleTimerRef.current);
                  }
                  typingIdleTimerRef.current = window.setTimeout(() => {
                    handleTyping(false);
                  }, 1500);
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
                disabled={
                  !canSendMessage ||
                  sendState === 'sending' ||
                  sendState === 'retrying' ||
                  !content.trim()
                }
                onClick={() => void sendMessage()}
                className="h-12 rounded-xl px-6 font-bold uppercase tracking-widest shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] active:translate-y-[1px]"
                variant="default"
              >
                {sendState === 'sending' ? <Spinner className="h-4 w-4" /> : t({ id: 'im.send' })}
              </Button>
            </div>
          </div>
        </div>

        {pendingImage && (
          <div className="absolute bottom-24 left-4 right-4 z-20 animate-in slide-in-from-bottom-2 duration-300">
            <ImagePreviewOverlay
              fileName={pendingImage.file.name}
              objectUrl={pendingImage.objectUrl}
              onCancel={cancelPendingImage}
              onConfirm={() => void uploadAndSendImage()}
              uploading={uploading}
            />
          </div>
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
          <div className="bg-muted/30 px-4 py-1.5 flex items-center gap-2">
            <svg
              className="h-3 w-3 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <p className="text-[0.625rem] font-bold uppercase tracking-widest text-muted-foreground">
              {t({ id: 'im.readonly' })}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
