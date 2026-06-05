import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoleManagementPanel } from '../roleManagementPanel';
import type { RoleItem } from '@nodeadmin/shared-types';

// Grant manage permission so create/edit/delete controls render (gated by hasPermission).
vi.mock('@/stores/usePermissionStore', () => ({
  usePermissionStore: (selector: (state: { hasPermission: () => boolean }) => unknown) =>
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
    is_system: 1,
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
    is_system: 0,
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

describe('RoleManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockRoles);
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

  it('5. Search filters roles by name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleManagementPanel />);

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('roles.search');
    await user.type(searchInput, 'Viewer');

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
});
