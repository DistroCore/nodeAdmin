import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditLogPanel } from '../auditLogPanel';
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

const mockAuditItems: AuditLogItem[] = [
  {
    id: 'log-1',
    tenantId: 'default',
    userId: 'admin@nodeadmin.dev',
    action: 'user.create',
    targetType: 'user',
    targetId: 'user-1',
    traceId: 'trace-1',
    context: null,
    createdAt: '2026-04-01T10:00:00Z',
  },
  {
    id: 'log-2',
    tenantId: 'default',
    userId: 'admin@nodeadmin.dev',
    action: 'auth.login',
    targetType: null,
    targetId: null,
    traceId: 'trace-2',
    context: null,
    createdAt: '2026-04-01T09:00:00Z',
  },
];

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <AuditLogPanel />
    </QueryClientProvider>,
  );
}

describe('AuditLogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      items: mockAuditItems,
      total: 2,
      page: 1,
      pageSize: 20,
    });
  });

  it('1. Renders title and description', () => {
    renderPanel();
    expect(screen.getByText('audit.title')).toBeInTheDocument();
    expect(screen.getByText('audit.desc')).toBeInTheDocument();
  });

  it('2. Fetches audit logs from API', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/api/v1/console/audit-logs'));
    });
  });

  it('3. Shows error state when fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('audit.loadFailed')).toBeInTheDocument();
    });
  });

  it('4. Shows empty state when no logs exist', async () => {
    mockGet.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('audit.empty')).toBeInTheDocument();
    });
  });

  it('5. Search input is present', async () => {
    const user = userEvent.setup();
    renderPanel();

    const searchInput = screen.getByPlaceholderText('audit.search');
    expect(searchInput).toBeInTheDocument();
    await user.type(searchInput, 'admin');
    expect(searchInput).toHaveValue('admin');
  });

  it('6. Action filter select is present', () => {
    renderPanel();
    // The Select component should be rendered with the placeholder
    expect(screen.getByText('audit.allActions')).toBeInTheDocument();
  });

  it('7. Date filter inputs are present', () => {
    renderPanel();
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);
  });

  it('8. Displays loading skeleton while fetching', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderPanel();

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

// ─── infinite scroll (useInfiniteQuery) ──────────────────────────
const PAGE_SIZE = 20;

function makeItems(count: number, offset = 0): AuditLogItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `log-${offset + i}`,
    tenantId: 'default',
    userId: `user-${offset + i}@nodeadmin.dev`,
    action: 'user.create',
    targetType: 'user',
    targetId: `user-${offset + i}`,
    traceId: `trace-${offset + i}`,
    context: null,
    createdAt: '2026-04-01T10:00:00Z',
  }));
}

// Builds a mock that slices `total` items into PAGE_SIZE pages, keyed off the
// `page` query param embedded in the request URL (mirrors the real server).
function pageResponder(total: number) {
  return (url: string) => {
    const page = Number(new URLSearchParams(url.split('?')[1]).get('page') ?? '1');
    const start = (page - 1) * PAGE_SIZE;
    const items = makeItems(Math.max(0, Math.min(PAGE_SIZE, total - start)), start);
    return Promise.resolve({ items, total, page, pageSize: PAGE_SIZE });
  };
}

function getLoadMoreButton(): HTMLButtonElement | null {
  // The load-more control is a <button> labelled with audit.loadMore. (The error
  // retry button shares that label, but these tests never hit the error branch.)
  const buttons = screen.queryAllByRole('button', { name: 'audit.loadMore' });
  return (buttons[0] as HTMLButtonElement) ?? null;
}

describe('AuditLogPanel — infinite scroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('9. Shows "load more" when the first full page implies more pages (total > pageSize)', async () => {
    mockGet.mockImplementation(pageResponder(45)); // 45 > 20 → page 2 exists
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('user-0@nodeadmin.dev')).toBeInTheDocument();
    });
    // First page rendered all 20 rows, and the pager offers more.
    expect(screen.getByText('user-19@nodeadmin.dev')).toBeInTheDocument();
    expect(getLoadMoreButton()).not.toBeNull();
  });

  it('10. Clicking "load more" requests page=2 and appends the next page', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation(pageResponder(45));
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('user-0@nodeadmin.dev')).toBeInTheDocument();
    });
    // Page 2 not loaded yet.
    expect(screen.queryByText('user-20@nodeadmin.dev')).not.toBeInTheDocument();

    await user.click(getLoadMoreButton()!);

    // Accumulated: page-2 rows appended while page-1 rows remain.
    await waitFor(() => {
      expect(screen.getByText('user-20@nodeadmin.dev')).toBeInTheDocument();
    });
    expect(screen.getByText('user-0@nodeadmin.dev')).toBeInTheDocument();
    expect(screen.getByText('user-39@nodeadmin.dev')).toBeInTheDocument();
    // The second request targeted page=2 (pagination advanced, not reset).
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('page=2'));
  });

  it('11. Hides "load more" on the last page (short final page, even if total disagrees)', async () => {
    // 25 items: page 1 = 20 rows, page 2 = 5 rows (< PAGE_SIZE) → stop.
    mockGet.mockImplementation(pageResponder(25));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('user-0@nodeadmin.dev')).toBeInTheDocument();
    });
    expect(getLoadMoreButton()).not.toBeNull();

    await user.click(getLoadMoreButton()!);

    // After the short page-2 (5 rows), getNextPageParam returns undefined → button gone.
    await waitFor(() => {
      expect(screen.getByText('user-24@nodeadmin.dev')).toBeInTheDocument();
    });
    expect(getLoadMoreButton()).toBeNull();
  });

  it('11b. Hides "load more" when a single page already covers total (total <= pageSize)', async () => {
    mockGet.mockImplementation(pageResponder(8)); // one page of 8, no page 2
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('user-0@nodeadmin.dev')).toBeInTheDocument();
    });
    expect(getLoadMoreButton()).toBeNull();
  });

  it('12. Disables the "load more" button while the next page is in flight', async () => {
    const user = userEvent.setup();
    let resolvePage2: ((value: unknown) => void) | undefined;

    mockGet.mockImplementation((url: string) => {
      const page = Number(new URLSearchParams(url.split('?')[1]).get('page') ?? '1');
      if (page === 1) {
        return Promise.resolve({ items: makeItems(PAGE_SIZE), total: 45, page: 1, pageSize: PAGE_SIZE });
      }
      // Hold page 2 open so we can observe the in-flight (disabled) state.
      return new Promise((resolve) => {
        resolvePage2 = resolve;
      });
    });
    renderPanel();

    await waitFor(() => {
      expect(getLoadMoreButton()).not.toBeNull();
    });

    await user.click(getLoadMoreButton()!);

    // While isFetchingNextPage is true the Timeline passes isLoadingMore → button disabled.
    await waitFor(() => {
      expect(getLoadMoreButton()).toBeDisabled();
    });

    // Resolve to avoid leaking the pending promise.
    resolvePage2?.({ items: makeItems(PAGE_SIZE, PAGE_SIZE), total: 45, page: 2, pageSize: PAGE_SIZE });
    await waitFor(() => {
      expect(getLoadMoreButton()).not.toBeDisabled();
    });
  });

  it('13. Changing the action filter refetches from page 1 (queryKey reset)', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation(pageResponder(45));
    renderPanel();

    // Wait for the first page to render (button only appears once data lands).
    await waitFor(() => {
      expect(screen.getByText('user-0@nodeadmin.dev')).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenLastCalledWith(expect.stringContaining('page=1'));

    // Advance to page 2 first, so we can prove the filter change resets to page 1.
    await user.click(getLoadMoreButton()!);
    await waitFor(() => {
      expect(screen.getByText('user-20@nodeadmin.dev')).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('page=2'));

    // Change the action filter → new queryKey → fresh fetch from page 1 with the filter applied.
    const select = document.querySelector('select') as HTMLSelectElement;
    await user.selectOptions(select, 'user.create');

    await waitFor(() => {
      const lastUrl = mockGet.mock.calls.at(-1)?.[0] as string;
      expect(lastUrl).toContain('page=1');
      expect(lastUrl).toContain('action=user.create');
    });
  });
});
