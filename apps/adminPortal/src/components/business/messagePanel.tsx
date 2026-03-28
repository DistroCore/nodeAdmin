import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { NavLink } from 'react-router-dom';
import type { ImMessageType } from '@nodeadmin/shared-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ImSendMessagePayload,
  ImSocketMessage,
  ImTypingEvent,
  useImSocket,
  type ImPresenceEvent,
} from '@/hooks/useImSocket';
import { className } from '@/lib/className';
import { useApiClient } from '@/hooks/useApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { useSocketStore } from '@/stores/useSocketStore';
import { useUiStore } from '@/stores/useUiStore';

interface MessagePanelProps {
  conversationIdOverride?: string;
}

const maxSendAttempts = 3;
const ackTimeoutMs = 2000;
const retryDelayMs = 300;
const virtualRowHeightPx = 92;
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

function renderMessageBody(message: ImSocketMessage): JSX.Element {
  if (message.messageType === 'image') {
    return (
      <div className="space-y-2">
        {message.metadata?.url ? (
          <img
            alt={message.metadata.fileName || 'image'}
            className="max-h-48 rounded-md border border-border object-contain"
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
        <p className="font-medium">{message.metadata?.fileName || 'Attached file'}</p>
        {message.metadata?.url ? (
          <a
            className="text-primary underline"
            href={message.metadata.url}
            rel="noreferrer"
            target="_blank"
          >
            Open file
          </a>
        ) : null}
        <p className="break-all text-muted-foreground">{message.content}</p>
      </div>
    );
  }

  if (message.messageType === 'system') {
    return <p className="text-sm italic text-muted-foreground">{message.content}</p>;
  }

  return <p className="break-all text-sm">{message.content}</p>;
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
  const [viewportHeight, setViewportHeight] = useState(320);

  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const typingIdleTimerRef = useRef<number | null>(null);
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
      }
      return next;
    });
  }, []);

  const { emitTyping, emitWithAck } = useImSocket({
    accessToken,
    conversationId: imConfig?.conversationId ?? '',
    onConnectionStateChange: setConnectionState,
    onConversationHistory: handleConversationHistory,
    onMessageReceived: handleMessageReceived,
    onPresenceChanged: handlePresenceChanged,
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

      <div className="flex min-w-0 flex-1 flex-col gap-4 min-h-0">
        <header className="flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent"
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
              <h2 className="text-base font-semibold">{t({ id: 'im.conversation' })}</h2>
              <div className="text-sm text-gray-500">
                {t({ id: 'im.online' }, { count: presenceMembers.size })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {offlineQueueCount > 0 ? (
              <Badge variant="secondary">
                {t({ id: 'im.offlineQueue' }, { count: offlineQueueCount })}
              </Badge>
            ) : null}
            <Badge variant={connectionState === 'connected' ? 'default' : 'secondary'}>
              {connectionLabel}
            </Badge>
          </div>
        </header>

        {bootError ? <p className="text-xs text-red-600">{bootError}</p> : null}
        {sendLabel ? <p className="text-xs text-muted-foreground">{sendLabel}</p> : null}
        {typingUsersLabel ? (
          <p className="text-xs text-muted-foreground">
            {t({ id: 'im.typing' }, { users: typingUsersLabel })}
          </p>
        ) : null}

        <div
          className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted p-3"
          onScroll={(event) => {
            const node = event.currentTarget;
            const remainingDistance = node.scrollHeight - (node.scrollTop + node.clientHeight);
            setStickToBottom(remainingDistance < virtualRowHeightPx * 1.5);
            setScrollTop(node.scrollTop);
          }}
          ref={messageViewportRef}
        >
          <div style={{ height: topSpacerHeight }} />
          <ul className="flex flex-col gap-2">
            {virtualItems.map((message) => (
              <li
                className="rounded-md bg-card p-2"
                key={message.messageId}
                style={{ minHeight: virtualRowHeightPx - 8 }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{message.userId}</p>
                  <Badge variant={message.messageType === 'system' ? 'secondary' : 'default'}>
                    {message.messageType}
                  </Badge>
                </div>
                {renderMessageBody(message)}
                <p className="mt-2 text-xs text-muted-foreground">{message.createdAt}</p>
              </li>
            ))}
          </ul>
          <div style={{ height: bottomSpacerHeight }} />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs">
            {t({ id: 'im.messageType' })}
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => setMessageType(event.target.value as ImMessageType)}
              value={messageType}
            >
              <option value="text">text</option>
              <option value="image">image</option>
              <option value="file">file</option>
              <option value="system">system</option>
            </select>
          </label>
          {(messageType === 'image' || messageType === 'file') && (
            <>
              <label className="text-xs">
                {t({ id: 'im.assetUrl' })}
                <Input
                  className="mt-1"
                  onChange={(event) => setAssetUrl(event.target.value)}
                  placeholder={t({ id: 'im.assetUrlPlaceholder' })}
                  value={assetUrl}
                />
              </label>
              <label className="text-xs">
                {t({ id: 'im.fileName' })}
                <Input
                  className="mt-1"
                  onChange={(event) => setFileName(event.target.value)}
                  placeholder={t({ id: 'im.fileNamePlaceholder' })}
                  value={fileName}
                />
              </label>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            className="flex-1"
            onBlur={() => {
              stopTyping();
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              setContent(nextValue);

              if (!canSendMessage || !imConfig) {
                return;
              }

              emitTyping({
                conversationId: imConfig.conversationId,
                isTyping: true,
              });

              if (typingIdleTimerRef.current !== null) {
                window.clearTimeout(typingIdleTimerRef.current);
              }

              typingIdleTimerRef.current = window.setTimeout(() => {
                emitTyping({
                  conversationId: imConfig.conversationId,
                  isTyping: false,
                });
              }, 1200);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={t({ id: 'im.inputPlaceholder' })}
            value={content}
          />
          <Button
            disabled={!canSendMessage || sendState === 'sending' || sendState === 'retrying'}
            onClick={() => {
              void sendMessage();
            }}
            type="button"
            variant="default"
          >
            {t({ id: 'im.send' })}
          </Button>
        </div>

        {!canSendMessage ? (
          <p className="text-xs text-muted-foreground">{t({ id: 'im.readonly' })}</p>
        ) : null}
      </div>
    </section>
  );
}
