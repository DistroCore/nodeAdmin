import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationPanel } from '../notificationPanel';
import type { AuditLogItem } from '@nodeadmin/shared-types';

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
    readBefore: null,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    isRead: () => false,
  }),
}));

function makeItem(i: number): AuditLogItem {
  return {
    id: `notif-${i}`,
    tenantId: 'default',
    userId: 'admin',
    action: 'user.update',
    targetType: 'user',
    targetId: `user-${i}`,
    traceId: `trace-${i}`,
    context: null,
    createdAt: '2026-04-01T10:00:00Z',
  };
}

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

// Parse the `page` query param out of the audit-logs URL the panel requests.
function pageOf(url: string): number {
  return Number(new URLSearchParams(url.split('?')[1] ?? '').get('page') ?? '1');
}

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel() {
  const qc = createQueryClient();
  const result = render(
    <QueryClientProvider client={qc}>
      <NotificationPanel />
    </QueryClientProvider>,
  );
  return { ...result, qc };
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
      expect(mockGet).toHaveBeenCalledWith('/api/v1/console/audit-logs?page=1&pageSize=20');
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

  // ─── Infinite scroll ────────────────────────────────────────────────

  it('7. Shows "load more" when the first page is full and total exceeds it', async () => {
    const firstPage = { items: Array.from({ length: 20 }, (_, i) => makeItem(i)), total: 40 };
    mockGet.mockResolvedValue(firstPage);
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('audit.loadMore')).toBeInTheDocument();
    });
  });

  it('8. Clicking "load more" requests page 2 and appends its items', async () => {
    const firstPage = { items: Array.from({ length: 20 }, (_, i) => makeItem(i)), total: 40 };
    const secondPage = { items: Array.from({ length: 20 }, (_, i) => makeItem(20 + i)), total: 40 };
    mockGet.mockImplementation((url: string) => Promise.resolve(pageOf(url) >= 2 ? secondPage : firstPage));

    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('audit.loadMore')).toBeInTheDocument();
    });
    // page-2 row is not present before loading more (targetId renders inside "(user-39)")
    expect(screen.queryByText(/\(user-39\)/)).not.toBeInTheDocument();

    await user.click(screen.getByText('audit.loadMore'));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/console/audit-logs?page=2&pageSize=20');
    });
    // appended, not replaced: both a page-1 row and a page-2 row are present
    await waitFor(() => {
      expect(screen.getByText(/\(user-39\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/\(user-0\)/)).toBeInTheDocument();
  });

  it('9. Hides "load more" on the last (short) page', async () => {
    // Default mock returns 2 items with total 2 → a single short page → no pager.
    renderPanel();

    await waitFor(() => {
      expect(screen.getAllByText(/auth\.login|user\.update/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('audit.loadMore')).not.toBeInTheDocument();
  });

  it('10. Shows loading label while fetching the next page', async () => {
    const firstPage = { items: Array.from({ length: 20 }, (_, i) => makeItem(i)), total: 40 };
    let resolveSecond: ((v: unknown) => void) | undefined;
    mockGet.mockImplementation((url: string) => {
      if (pageOf(url) >= 2) {
        return new Promise((resolve) => {
          resolveSecond = resolve;
        });
      }
      return Promise.resolve(firstPage);
    });

    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('audit.loadMore')).toBeInTheDocument();
    });

    await user.click(screen.getByText('audit.loadMore'));

    // While the page-2 request is in flight, the button shows the loading label.
    await waitFor(() => {
      expect(screen.getByText('common.loading')).toBeInTheDocument();
    });

    // Resolve to avoid a dangling pending promise.
    resolveSecond?.({ items: Array.from({ length: 20 }, (_, i) => makeItem(20 + i)), total: 40 });
  });

  // ─── New-entry banner (head poll, no list-wide refetch) ─────────────
  //
  // The head poll is driven deterministically via refetchQueries(['notifications-head'])
  // — equivalent to one refetchInterval tick — to avoid React Query's notify-batching
  // deadlock under fake timers. The 30s interval itself never fires during these tests.

  it('11. Surfaces a "new notifications" banner when the head poll sees a higher total', async () => {
    let currentTotal = 2;
    let currentItems: AuditLogItem[] = mockNotifications.items as AuditLogItem[];
    mockGet.mockImplementation(() => Promise.resolve({ items: currentItems, total: currentTotal }));

    const { qc } = renderPanel();
    await waitFor(() => {
      expect(screen.getAllByText(/auth\.login|user\.update/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('notifications.newCount')).not.toBeInTheDocument();

    // Two new entries arrive; the next head poll observes the higher total.
    currentTotal = 4;
    currentItems = [makeItem(100), makeItem(101), ...(mockNotifications.items as AuditLogItem[])];
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['notifications-head'] });
    });

    await waitFor(() => {
      expect(screen.getByText('notifications.newCount')).toBeInTheDocument();
    });
  });

  it('12. Clicking the banner refreshes the list to the top and clears the banner', async () => {
    let currentTotal = 2;
    let currentItems: AuditLogItem[] = mockNotifications.items as AuditLogItem[];
    mockGet.mockImplementation(() => Promise.resolve({ items: currentItems, total: currentTotal }));

    const { qc } = renderPanel();
    await waitFor(() => {
      expect(screen.getAllByText(/auth\.login|user\.update/).length).toBeGreaterThan(0);
    });

    currentTotal = 5;
    currentItems = [makeItem(200), ...(mockNotifications.items as AuditLogItem[])];
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['notifications-head'] });
    });
    await waitFor(() => {
      expect(screen.getByText('notifications.newCount')).toBeInTheDocument();
    });

    const page1Calls = () => mockGet.mock.calls.filter((c) => String(c[0]).includes('page=1')).length;
    const before = page1Calls();

    const user = userEvent.setup();
    await user.click(screen.getByText('notifications.newCount'));

    // Clicking resets the infinite list → a fresh page-1 fetch (now matching the head
    // total), after which the banner clears.
    await waitFor(() => {
      expect(page1Calls()).toBeGreaterThan(before);
    });
    await waitFor(() => {
      expect(screen.queryByText('notifications.newCount')).not.toBeInTheDocument();
    });
  });
});
