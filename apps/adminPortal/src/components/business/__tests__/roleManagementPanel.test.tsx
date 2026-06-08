import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoleManagementPanel } from '../roleManagementPanel';
import type { RoleItem } from '@nodeadmin/shared-types';

vi.mock('@/stores/usePermissionStore', () => ({
  usePermissionStore: (selector: (state: { hasPermission: (permission: string) => boolean }) => unknown) =>
    selector({ hasPermission: () => true }),
}));

// Mock react-intl
vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
    locale: 'en',
  }),
}));

// Mock react-router-dom
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Mock toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
    toast: vi.fn(),
  }),
}));

// Mock useApiClient
const mockGet = vi.fn();
const mockDel = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();

vi.mock('@/hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: mockGet,
    del: mockDel,
    post: mockPost,
    patch: mockPatch,
  }),
}));

const mockRoles: RoleItem[] = [
  {
    id: 'role-1',
    name: 'Admin',
    description: 'Administrator role',
    is_system: true,
    permissions: [
      { id: 'perm-1', code: 'admin', name: 'Admin' },
      { id: 'perm-2', code: 'users:view', name: 'View Users' },
    ],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'role-2',
    name: 'Viewer',
    description: 'Read-only role',
    is_system: false,
    permissions: [{ id: 'perm-3', code: 'viewer', name: 'Viewer' }],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = createQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function paginated(items: RoleItem[], total = items.length) {
  return { items, total, page: 1, pageSize: 10 };
}

describe('RoleManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The roles list endpoint returns { items, total, page, pageSize }, NOT a bare array.
    // Mocking the real contract guards against the panel regressing to `Array.isArray(data)` unwrapping.
    mockGet.mockResolvedValue(paginated(mockRoles));
    mockDel.mockResolvedValue(undefined);
  });

  it('1. Renders role list with column headers', async () => {
    renderWithProviders(<RoleManagementPanel />);

    expect(screen.getByText('roles.title')).toBeInTheDocument();
    expect(screen.getByText('roles.desc')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Viewer')).toBeInTheDocument();
    });
  });

  it('2. Shows system badge for system roles', async () => {
    renderWithProviders(<RoleManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    // Admin is system role → "roles.yes"
    expect(screen.getByText('roles.yes')).toBeInTheDocument();
    // Viewer is not system → "roles.no"
    expect(screen.getByText('roles.no')).toBeInTheDocument();
  });

  it('3. Disables edit/delete for system roles', async () => {
    renderWithProviders(<RoleManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    const buttons = screen.getAllByText('roles.edit');
    // First edit button is for Admin (system role), should be disabled
    expect(buttons[0]).toBeDisabled();

    const deleteButtons = screen.getAllByText('roles.delete');
    expect(deleteButtons[0]).toBeDisabled();
  });

  it('4. Enables edit/delete for non-system roles', async () => {
    renderWithProviders(<RoleManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('Viewer')).toBeInTheDocument();
    });

    const buttons = screen.getAllByText('roles.edit');
    // Second edit button is for Viewer, should be enabled
    expect(buttons[1]).not.toBeDisabled();

    const deleteButtons = screen.getAllByText('roles.delete');
    expect(deleteButtons[1]).not.toBeDisabled();
  });

  it('5. Search is delegated to the server (sent in the request, page reset to 1)', async () => {
    const user = userEvent.setup();
    // Server returns only the matching role for a "Viewer" query.
    mockGet.mockImplementation((url: string) =>
      Promise.resolve(url.includes('search=Viewer') ? paginated([mockRoles[1]]) : paginated(mockRoles)),
    );
    renderWithProviders(<RoleManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('roles.search');
    await user.type(searchInput, 'Viewer');

    // The query string carries the search term and resets to the first page (page=1, 1-based).
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('search=Viewer'));
    });
    const lastUrl = mockGet.mock.calls[mockGet.mock.calls.length - 1][0] as string;
    expect(lastUrl).toContain('page=1');

    // The server-filtered result is what renders — no client-side filtering remains.
    await waitFor(() => {
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
      expect(screen.getByText('Viewer')).toBeInTheDocument();
    });
  });

  it('6. Clicking delete opens confirm dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('Viewer')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('roles.delete');
    await user.click(deleteButtons[1]);

    await waitFor(() => {
      expect(screen.getByText('roles.deleteTitle')).toBeInTheDocument();
      expect(screen.getByText('roles.deleteConfirm')).toBeInTheDocument();
    });
  });

  it('7. Confirming delete calls API and shows success toast', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('Viewer')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('roles.delete');
    await user.click(deleteButtons[1]);

    await waitFor(() => {
      expect(screen.getByText('roles.deleteTitle')).toBeInTheDocument();
    });

    const confirmButton = screen.getByText('common.confirm');
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith('/api/v1/roles/role-2');
      expect(mockToastSuccess).toHaveBeenCalledWith('roles.deleteSuccess');
    });
  });

  it('8. Shows loading state while fetching roles', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<RoleManagementPanel />);

    // DataTable shows skeleton rows with animate-pulse, not text
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('9. Shows error state when roles fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    renderWithProviders(<RoleManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('roles.loadFailed')).toBeInTheDocument();
    });

    expect(screen.getByText('common.retry')).toBeInTheDocument();
  });

  it('10. Paginates server-side: page/pageSize sent, Next advances the requested page', async () => {
    const pageOne: RoleItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `role-${i}`,
      name: `Role ${i}`,
      description: `desc ${i}`,
      is_system: false,
      permissions: [],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    }));
    // total = 12 → 2 pages; the server already returns just this page's slice.
    mockGet.mockResolvedValue({ items: pageOne, total: 12, page: 1, pageSize: 10 });
    const user = userEvent.setup();
    renderWithProviders(<RoleManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('Role 0')).toBeInTheDocument();
    });

    // First request asks the server for page 1 (1-based) with the configured pageSize.
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('page=1'));
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('pageSize=10'));
    // Rows are exactly what the server returned — no client-side slicing.
    expect(screen.getByText('Role 9')).toBeInTheDocument();
    // Pager controls appear because total (12) exceeds one page.
    expect(screen.getByText('common.next')).toBeInTheDocument();
    expect(screen.getByText('common.previous')).toBeInTheDocument();

    // Clicking Next requests the second page from the server (page=2).
    await user.click(screen.getByText('common.next'));
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('page=2'));
    });
  });

  it('11. Renders rows from a { items, total } response (contract regression guard)', async () => {
    // Reproduces the BLOCKER: panel must read response.items, not treat the response as an array.
    mockGet.mockResolvedValue({ items: mockRoles, total: mockRoles.length, page: 1, pageSize: 10 });
    renderWithProviders(<RoleManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Viewer')).toBeInTheDocument();
    });
    // Not the empty state.
    expect(screen.queryByText('roles.empty')).not.toBeInTheDocument();
  });
});
