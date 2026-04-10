import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoleFormDialog } from '../roleFormDialog';
import type { RoleItem } from '@nodeadmin/shared-types';

// Mock react-intl
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

const mockPermissions = {
  items: [
    {
      id: 'perm-1',
      code: 'users:view',
      name: 'View Users',
      description: 'View users',
      module: 'Users',
    },
    {
      id: 'perm-2',
      code: 'users:edit',
      name: 'Edit Users',
      description: 'Edit users',
      module: 'Users',
    },
    {
      id: 'perm-3',
      code: 'roles:view',
      name: 'View Roles',
      description: 'View roles',
      module: 'Roles',
    },
  ],
  total: 3,
};

const mockRole: RoleItem = {
  id: 'role-1',
  name: 'Admin',
  description: 'Admin role',
  is_system: 0,
  permissions: [{ id: 'perm-1', code: 'users:view', name: 'View Users' }],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
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

describe('RoleFormDialog', () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockPermissions);
    mockPost.mockResolvedValue({ id: 'role-new' });
    mockPatch.mockResolvedValue({ id: 'role-1' });
  });

  it('1. Renders create dialog with empty fields', async () => {
    renderWithProviders(<RoleFormDialog open={true} onClose={onClose} onSaved={onSaved} />);

    expect(screen.getByText('roles.create')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('roles.fieldName')).toHaveValue('');
      expect(screen.getByLabelText('roles.fieldDescription')).toHaveValue('');
    });
  });

  it('2. Renders edit dialog with pre-filled fields', async () => {
    renderWithProviders(<RoleFormDialog open={true} onClose={onClose} onSaved={onSaved} role={mockRole} />);

    expect(screen.getByText('roles.edit')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('roles.fieldName')).toHaveValue('Admin');
      expect(screen.getByLabelText('roles.fieldDescription')).toHaveValue('Admin role');
    });
  });

  it('3. Does not render when open is false', () => {
    renderWithProviders(<RoleFormDialog open={false} onClose={onClose} onSaved={onSaved} />);

    expect(screen.queryByText('roles.create')).not.toBeInTheDocument();
  });

  it('4. Loads and displays permissions grouped by module', async () => {
    renderWithProviders(<RoleFormDialog open={true} onClose={onClose} onSaved={onSaved} />);

    await waitFor(() => {
      expect(screen.getByText('View Users')).toBeInTheDocument();
      expect(screen.getByText('Edit Users')).toBeInTheDocument();
      expect(screen.getByText('View Roles')).toBeInTheDocument();
    });

    // Module headers (rendered as-is from data)
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Roles')).toBeInTheDocument();
  });

  it('5. Toggles individual permission checkbox', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleFormDialog open={true} onClose={onClose} onSaved={onSaved} />);

    await waitFor(() => {
      expect(screen.getByText('View Users')).toBeInTheDocument();
    });

    // Click to check
    await user.click(screen.getByText('View Users'));

    // The checkbox should now be checked
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
  });

  it('6. Submits create form with correct payload', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleFormDialog open={true} onClose={onClose} onSaved={onSaved} />);

    await waitFor(() => {
      expect(screen.getByText('View Users')).toBeInTheDocument();
    });

    // Use fireEvent to set values directly (avoids Dialog focus-trap interference)
    const nameInput = document.querySelector('#role-name') as HTMLInputElement;
    const descInput = document.querySelector('#role-description') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    expect(descInput).toBeTruthy();
    fireEvent.change(nameInput, { target: { value: 'NewRole' } });
    fireEvent.change(descInput, { target: { value: 'A new role' } });

    // Select a permission via checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);

    const saveButton = screen.getByText('common.save');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/roles', {
      name: 'NewRole',
      description: 'A new role',
      permissionIds: ['perm-1'],
      tenantId: 'tenant-1',
    });
  });

  it('7. Submits edit form with PATCH', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleFormDialog open={true} onClose={onClose} onSaved={onSaved} role={mockRole} />);

    await waitFor(() => {
      expect(screen.getByText('View Users')).toBeInTheDocument();
    });

    // Clear and type new name
    const nameInput = screen.getByLabelText('roles.fieldName');
    await user.clear(nameInput);
    await user.type(nameInput, 'UpdatedRole');

    const saveButton = screen.getByText('common.save');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        '/api/v1/roles/role-1?tenantId=tenant-1',
        expect.objectContaining({
          name: 'UpdatedRole',
          tenantId: 'tenant-1',
        }),
      );
    });
  });

  it('8. Cancel button calls onClose', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleFormDialog open={true} onClose={onClose} onSaved={onSaved} />);

    await waitFor(() => {
      expect(screen.getByText('common.cancel')).toBeInTheDocument();
    });

    await user.click(screen.getByText('common.cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('9. Shows loading state while permissions are loading', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<RoleFormDialog open={true} onClose={onClose} onSaved={onSaved} />);

    expect(screen.getByText('roles.loadingPermissions')).toBeInTheDocument();
  });

  it('10. On save success calls onSaved and onClose', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoleFormDialog open={true} onClose={onClose} onSaved={onSaved} />);

    await waitFor(() => {
      expect(screen.getByText('View Users')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('roles.fieldName'), 'Test');
    await user.type(screen.getByLabelText('roles.fieldDescription'), 'Desc');

    const saveButton = screen.getByText('common.save');
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
