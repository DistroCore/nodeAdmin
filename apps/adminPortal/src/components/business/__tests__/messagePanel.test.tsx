import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagePanel } from '../messagePanel';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockEmitDelete = vi.fn();
const mockEmitEdit = vi.fn();
const mockEmitSetPresenceStatus = vi.fn();
const mockEmitTyping = vi.fn();
const mockEmitWithAck = vi.fn();
const mockResetMessages = vi.fn();
const mockUpsertMessage = vi.fn();
const mockSetAccessToken = vi.fn();
const mockSetTenantId = vi.fn();
const mockSetUserId = vi.fn();
const mockSetConnectionState = vi.fn();
const mockSetConversationPanelOpen = vi.fn();
const mockToggleConversationPanel = vi.fn();
const mockNavigate = vi.fn();

const permissionFlags = {
  canSend: true,
  canView: true,
};

vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
  }),
}));

vi.mock('react-router-dom', () => ({
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: mockGet,
    post: mockPost,
  }),
}));

vi.mock('@/hooks/useImSocket', () => ({
  useImSocket: () => ({
    emitDelete: mockEmitDelete,
    emitEdit: mockEmitEdit,
    emitSetPresenceStatus: mockEmitSetPresenceStatus,
    emitTyping: mockEmitTyping,
    emitWithAck: mockEmitWithAck,
  }),
}));

vi.mock('@/stores/usePermissionStore', () => ({
  usePermissionStore: (selector: (state: { hasPermission: (permission: string) => boolean }) => unknown) =>
    selector({
      hasPermission: (permission: string) => {
        if (permission === 'im:view') {
          return permissionFlags.canView;
        }

        if (permission === 'im:send') {
          return permissionFlags.canSend;
        }

        return false;
      },
    }),
}));

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: (
    selector: (state: {
      accessToken: string | null;
      tenantId: string | null;
      userId: string | null;
      setAccessToken: (token: string | null) => void;
      setTenantId: (tenantId: string) => void;
      setUserId: (userId: string) => void;
    }) => unknown,
  ) =>
    selector({
      accessToken: 'existing-access-token',
      tenantId: 'tenant-1',
      userId: 'user-1',
      setAccessToken: mockSetAccessToken,
      setTenantId: mockSetTenantId,
      setUserId: mockSetUserId,
    }),
}));

vi.mock('@/stores/useMessageStore', () => ({
  useMessageStore: (
    selector: (state: {
      messages: Array<{
        content: string;
        conversationId: string;
        createdAt: string;
        deletedAt: string | null;
        editedAt: string | null;
        messageId: string;
        messageType: 'text';
        metadata: null;
        sequenceId: number;
        tenantId: string;
        traceId: string;
        userId: string;
      }>;
      resetMessages: typeof mockResetMessages;
      upsertMessage: typeof mockUpsertMessage;
    }) => unknown,
  ) =>
    selector({
      messages: [],
      resetMessages: mockResetMessages,
      upsertMessage: mockUpsertMessage,
    }),
}));

vi.mock('@/stores/useSocketStore', () => ({
  useSocketStore: (
    selector: (state: {
      connectionState: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
      setConnectionState: typeof mockSetConnectionState;
    }) => unknown,
  ) =>
    selector({
      connectionState: 'connected',
      setConnectionState: mockSetConnectionState,
    }),
}));

vi.mock('@/stores/useUiStore', () => ({
  useUiStore: (
    selector: (state: {
      imConversationPanelOpen: boolean;
      setImConversationPanelOpen: typeof mockSetConversationPanelOpen;
      toggleImConversationPanel: typeof mockToggleConversationPanel;
    }) => unknown,
  ) =>
    selector({
      imConversationPanelOpen: true,
      setImConversationPanelOpen: mockSetConversationPanelOpen,
      toggleImConversationPanel: mockToggleConversationPanel,
    }),
}));

vi.mock('../imagePreviewOverlay', () => ({
  ImagePreviewOverlay: () => null,
}));

class ResizeObserverMock {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MessagePanel />
    </QueryClientProvider>,
  );
}

describe('MessagePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionFlags.canView = true;
    permissionFlags.canSend = true;
    mockGet.mockResolvedValue({
      rows: [
        {
          id: 'conversation-1',
          type: 'group',
          title: 'General',
          lastMessagePreview: 'Latest message',
          name: 'General',
          unreadCount: 2,
          updatedAt: '2026-04-11T00:00:00.000Z',
        },
      ],
    });
    mockPost.mockResolvedValue({
      accessToken: 'issued-access-token',
      identity: {
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      },
    });
    localStorage.clear();
  });

  it('renders an access denied state when IM viewing is forbidden', () => {
    permissionFlags.canView = false;

    renderPanel();

    expect(screen.getByText('permission.imDenied')).toBeInTheDocument();
  });

  it('loads conversations and requests a dev token for the active tenant', async () => {
    // Must pass conversationIdOverride since BUG-1 fix: imConfig is null without a conversation
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MessagePanel conversationIdOverride="conv-1" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/console/conversations?tenantId=tenant-1');
      expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/dev-token', {
        roles: ['admin'],
        tenantId: 'tenant-1',
        userId: 'user-1',
      });
    });

    expect(await screen.findByText('General')).toBeInTheDocument();
    expect(screen.getByText('Latest message')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
