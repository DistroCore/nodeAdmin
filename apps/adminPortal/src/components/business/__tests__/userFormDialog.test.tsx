import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserFormDialog } from '../userFormDialog';
import type { RoleItem } from '@nodeadmin/shared-types';

// Mock react-intl — return the message id verbatim
vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
    locale: 'en',
  }),
}));

// Mock useApiClient
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDel = vi.fn();

vi.mock('@/hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    del: mockDel,
  }),
}));

// Mock useAuthStore
vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: vi.fn((selector) => selector({ tenantId: 'tenant-1', accessToken: 'test-token' })),
}));

// Mock toast
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), toast: vi.fn() }),
}));

// Server returns the canonical paginated contract: { items, total, page, pageSize }.
const mockRolesResponse = {
  items: [
    {
      id: 'role-1',
      name: 'Admin',
      description: 'Administrator role',
      is_system: 1,
      permissions: [],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'role-2',
      name: 'Viewer',
      description: 'Read-only role',
      is_system: 0,
      permissions: [],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ] satisfies RoleItem[],
  total: 2,
  page: 1,
  pageSize: 100,
};

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

describe('UserFormDialog — roles loading', () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockRolesResponse);
  });

  it('renders a role checkbox per item when the API returns a { items, total } page', async () => {
    renderWithProviders(<UserFormDialog onClose={onClose} onSaved={onSaved} open />);

    // Each role name renders, proving the panel unwrapped `.items` (regression guard:
    // the old Array.isArray(data) check would yield [] for an object response).
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Viewer')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);

    // The empty-state fallback must NOT appear when roles are present.
    expect(screen.queryByText('users.noRoles')).not.toBeInTheDocument();

    // The request carries pageSize=100 (DTO max) so role options are not capped at the default.
    expect(mockGet).toHaveBeenCalledWith('/api/v1/roles?pageSize=100&tenantId=tenant-1');
  });

  it('shows the error message and refetches when the retry button is clicked', async () => {
    const user = userEvent.setup();
    mockGet.mockRejectedValueOnce(new Error('Network error'));

    renderWithProviders(<UserFormDialog onClose={onClose} onSaved={onSaved} open />);

    await waitFor(() => {
      expect(screen.getByText('users.loadRolesFailed')).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Retry refetches; the second call resolves (beforeEach default) and roles render.
    await user.click(screen.getByText('common.retry'));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });
    expect(screen.queryByText('users.loadRolesFailed')).not.toBeInTheDocument();
  });
});
