import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuManagementPanel } from '../menuManagementPanel';

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
    get: mockGet,
    del: mockDel,
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    error: mockError,
    success: mockSuccess,
  }),
}));

vi.mock('@/app/layout/navIcon', () => ({
  NavIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

vi.mock('../menuFormDialog', () => ({
  MenuFormDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="menu-form">MenuFormDialog</div> : null),
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
      <MenuManagementPanel />
    </QueryClientProvider>,
  );
}

const mockMenus = [
  {
    id: '1',
    name: 'Dashboard',
    path: '/dashboard',
    icon: 'bar',
    sort_order: 1,
    is_visible: true,
    parent_id: null,
  },
  {
    id: '2',
    name: 'Users',
    path: '/users',
    icon: 'users',
    sort_order: 2,
    is_visible: true,
    parent_id: null,
  },
  {
    id: '3',
    name: 'Settings',
    path: '/settings',
    icon: 'gear',
    sort_order: 1,
    is_visible: true,
    parent_id: '2',
  },
];

describe('MenuManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockMenus);
    mockDel.mockResolvedValue({ success: true });
  });

  it('loads and renders menu tree', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/menus');
    });

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^icon-/)).toHaveLength(3);
  });

  it('shows error state when loading fails', async () => {
    mockGet.mockRejectedValue(new Error('Fetch failed'));
    renderPanel();

    expect(await screen.findByText('menus.loadFailed')).toBeInTheDocument();
  });

  it('opens create dialog on button click', async () => {
    const user = userEvent.setup();
    renderPanel();

    const createButtons = screen.getAllByRole('button', { name: 'menus.create' });
    await user.click(createButtons[0]);

    expect(screen.getByTestId('menu-form')).toBeInTheDocument();
  });

  it('opens edit dialog for a menu item', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText('Dashboard');
    const editButtons = screen.getAllByRole('button', { name: 'menus.edit' });
    await user.click(editButtons[0]);

    expect(screen.getByTestId('menu-form')).toBeInTheDocument();
  });

  it('handles menu deletion', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText('Dashboard');
    const deleteButtons = screen.getAllByRole('button', { name: 'menus.delete' });
    await user.click(deleteButtons[0]);

    // Confirm dialog
    const confirmButton = screen.getByRole('button', { name: 'common.confirm' });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith('/api/v1/menus/1');
    });
    expect(mockSuccess).toHaveBeenCalledWith('menus.deleteSuccess');
  });
});
