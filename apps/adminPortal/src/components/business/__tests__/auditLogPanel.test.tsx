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
