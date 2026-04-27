import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserManagementPanel } from '../userManagementPanel';

const mockGet = vi.fn();
const mockDel = vi.fn();
const mockSuccess = vi.fn();
const mockError = vi.fn();

vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }, values?: Record<string, unknown>) =>
      values ? `${id}:${JSON.stringify(values)}` : id,
  }),
}));

vi.mock('@/hooks/useApiClient', () => ({
  useApiClient: () => ({
    del: mockDel,
    get: mockGet,
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    error: mockError,
    success: mockSuccess,
  }),
}));

vi.mock('../userFormDialog', () => ({
  UserFormDialog: ({ open }: { open: boolean }) => (open ? <div>UserFormDialog</div> : null),
}));

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
      <UserManagementPanel />
    </QueryClientProvider>,
  );
}

describe('UserManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      items: [
        {
          avatar: null,
          created_at: '2026-04-02T00:00:00.000Z',
          email: 'alice@example.com',
          id: 'user-1',
          is_active: 1,
          name: 'Alice',
          phone: null,
          roles: [{ id: 'role-1', name: 'Admin' }],
          tenant_id: 'tenant-1',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    });
    mockDel.mockResolvedValue({ success: true });
  });

  it('loads and renders user rows', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/users?pageSize=10&page=1&search=');
    });

    expect(await screen.findByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('users.active')).toBeInTheDocument();
  });

  it('deletes a user after confirmation', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText('alice@example.com');
    await user.click(screen.getByRole('button', { name: 'users.delete' }));
    await user.click(screen.getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith('/api/v1/users/user-1');
    });

    expect(mockSuccess).toHaveBeenCalledWith('users.deleteSuccess');
  });
});
