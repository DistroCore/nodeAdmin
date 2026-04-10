import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePanel } from '../profilePanel';

interface MockAuthState {
  tenantId: string;
  userId: string;
  userName: string;
  userRoles: string[];
}

const mockAuthState: MockAuthState = {
  tenantId: 'tenant-456',
  userId: 'user-123',
  userName: 'Test User',
  userRoles: ['admin'],
};

const mockGet = vi.fn();
const mockPost = vi.fn();
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
    post: mockPost,
    del: mockDel,
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    error: mockError,
    success: mockSuccess,
  }),
}));

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: <T,>(selector: (state: MockAuthState) => T) => selector(mockAuthState),
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
      <ProfilePanel />
    </QueryClientProvider>,
  );
}

describe('ProfilePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      accounts: [{ provider: 'github', providerId: 'gh-1', createdAt: '2026-04-02T00:00:00Z' }],
    });
    mockPost.mockResolvedValue({ success: true });
    mockDel.mockResolvedValue({ success: true });

    // Stub window.confirm
    window.confirm = vi.fn(() => true);
  });

  it('renders user information correctly', () => {
    renderPanel();
    expect(screen.getByText('profile.info')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('user-123')).toBeInTheDocument();
    expect(screen.getByText('tenant-456')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('handles password change successfully', async () => {
    const user = userEvent.setup();
    renderPanel();

    const currentInput = screen.getByPlaceholderText('profile.currentPassword');
    const newInput = screen.getByPlaceholderText('profile.newPassword');
    const confirmInput = screen.getByPlaceholderText('auth.confirmPassword');
    const updateButton = screen.getByText('profile.updatePassword');

    await user.type(currentInput, 'old-pass');
    await user.type(newInput, 'new-pass');
    await user.type(confirmInput, 'new-pass');
    await user.click(updateButton);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/change-password', {
        currentPassword: 'old-pass',
        newPassword: 'new-pass',
      });
    });

    expect(mockSuccess).toHaveBeenCalledWith('profile.passwordChangeSuccess');
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    renderPanel();

    const currentInput = screen.getByPlaceholderText('profile.currentPassword');
    const newInput = screen.getByPlaceholderText('profile.newPassword');
    const confirmInput = screen.getByPlaceholderText('auth.confirmPassword');
    const updateButton = screen.getByText('profile.updatePassword');

    await user.type(currentInput, 'old-pass');
    await user.type(newInput, 'new-pass');
    await user.type(confirmInput, 'mismatch');
    await user.click(updateButton);

    expect(mockError).toHaveBeenCalledWith('auth.passwordMismatch');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('loads and displays linked accounts', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/oauth-accounts');
    });

    expect(await screen.findByText('profile.provider.github')).toBeInTheDocument();
    expect(screen.getByText('profile.linked')).toBeInTheDocument();
    expect(screen.getByText('profile.notLinked')).toBeInTheDocument(); // Google not linked
  });

  it('handles account unlinking', async () => {
    const user = userEvent.setup();
    renderPanel();

    const unlinkButton = await screen.findByText('profile.unlink');
    await user.click(unlinkButton);

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockDel).toHaveBeenCalledWith('/api/v1/auth/oauth-accounts/github');
    });
    expect(mockSuccess).toHaveBeenCalled();
  });
});
