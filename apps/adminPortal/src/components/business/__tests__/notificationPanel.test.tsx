import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationPanel } from '../notificationPanel';

// Mock react-intl
vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
    locale: 'en',
  }),
}));

// Mock useApiClient
const mockGet = vi.fn();
vi.mock('@/hooks/useApiClient', () => ({
  useApiClient: () => ({ get: mockGet, post: vi.fn(), del: vi.fn(), patch: vi.fn() }),
}));

// Mock notification store — useNotificationStore() called without selector
const mockMarkAsRead = vi.fn();
const mockMarkAllAsRead = vi.fn();
vi.mock('@/stores/useNotificationStore', () => ({
  useNotificationStore: () => ({
    readIds: new Set<string>(),
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
  }),
}));

const mockNotifications = {
  items: [
    {
      id: 'notif-1',
      tenantId: 'default',
      userId: 'admin',
      action: 'auth.login',
      targetType: 'session',
      targetId: 'sess-1',
      traceId: 'trace-1',
      context: null,
      createdAt: '2026-04-01T10:00:00Z',
    },
    {
      id: 'notif-2',
      tenantId: 'default',
      userId: 'admin',
      action: 'user.update',
      targetType: 'user',
      targetId: 'user-1',
      traceId: 'trace-2',
      context: null,
      createdAt: '2026-04-01T09:00:00Z',
    },
  ],
  total: 2,
};

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NotificationPanel />
    </QueryClientProvider>,
  );
}

describe('NotificationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockNotifications);
  });

  it('1. Renders title and description', async () => {
    renderPanel();
    expect(screen.getByText('notifications.title')).toBeInTheDocument();
    expect(screen.getByText('notifications.desc')).toBeInTheDocument();
  });

  it('2. Loads and displays notification items', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/console/audit-logs?pageSize=50');
    });

    // Items should render — check for action text
    await waitFor(() => {
      expect(screen.getAllByText(/auth\.login|user\.update/).length).toBeGreaterThan(0);
    });
  });

  it('3. Shows empty state when no notifications', async () => {
    mockGet.mockResolvedValue({ items: [], total: 0 });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('notifications.empty')).toBeInTheDocument();
    });
  });

  it('4. Shows error state on fetch failure', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('notifications.loadFailed')).toBeInTheDocument();
    });
  });

  it('5. Mark all read button is present', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('notifications.markAllRead')).toBeInTheDocument();
    });
  });

  it('6. Clicking mark all read calls store', async () => {
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('notifications.markAllRead')).toBeInTheDocument();
    });

    await user.click(screen.getByText('notifications.markAllRead'));
    expect(mockMarkAllAsRead).toHaveBeenCalled();
  });
});
