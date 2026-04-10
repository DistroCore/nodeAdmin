import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantControlPanel } from '../tenantControlPanel';

const mockGet = vi.fn();
const mockDel = vi.fn();
const mockSuccess = vi.fn();
const mockError = vi.fn();

vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
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

vi.mock('../tenantFormDialog', () => ({
  TenantFormDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="tenant-form">TenantFormDialog</div> : null,
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
      <TenantControlPanel />
    </QueryClientProvider>,
  );
}

describe('TenantControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue([
      {
        config_json: null,
        created_at: '2026-04-02T00:00:00.000Z',
        id: 'tenant-1',
        is_active: 1,
        logo: null,
        name: 'Default Tenant',
        slug: 'default',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
    ]);
    mockDel.mockResolvedValue({ success: true });
  });

  it('loads and renders tenant rows', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/tenants');
    });

    expect(await screen.findByText('Default Tenant')).toBeInTheDocument();
    expect(screen.getByText('tenant.active')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Fetch failed'));
    renderPanel();

    expect(await screen.findByText('tenant.loadFailed')).toBeInTheDocument();
  });

  it('opens create dialog', async () => {
    const user = userEvent.setup();
    renderPanel();

    const createButtons = screen.getAllByRole('button', { name: 'tenant.create' });
    await user.click(createButtons[0]);

    expect(screen.getByTestId('tenant-form')).toBeInTheDocument();
  });

  it('opens edit dialog', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText('Default Tenant');
    const editButton = screen.getByRole('button', { name: 'tenant.edit' });
    await user.click(editButton);

    expect(screen.getByTestId('tenant-form')).toBeInTheDocument();
  });

  it('deletes a tenant after confirmation', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText('Default Tenant');
    await user.click(screen.getByRole('button', { name: 'tenant.delete' }));
    await user.click(screen.getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith('/api/v1/tenants/tenant-1');
    });

    expect(mockSuccess).toHaveBeenCalledWith('tenant.deleteSuccess');
  });

  it('shows error toast when deletion fails', async () => {
    const user = userEvent.setup();
    mockDel.mockRejectedValue(new Error('Delete failed'));
    renderPanel();

    await screen.findByText('Default Tenant');
    await user.click(screen.getByRole('button', { name: 'tenant.delete' }));
    await user.click(screen.getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => {
      expect(mockError).toHaveBeenCalledWith('tenant.deleteFailed');
    });
  });
});
