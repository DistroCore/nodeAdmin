import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { AppLocale } from '@/i18n';
import { LoginPage } from '../loginPage';

interface MockLinkProps {
  children?: ReactNode;
  to: string;
}

interface MockUiState {
  setLocale: (locale: AppLocale) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  theme: 'dark' | 'light';
}

const mockSetTheme = vi.fn<(theme: 'dark' | 'light') => void>();
const mockSetLocale = vi.fn<(locale: AppLocale) => void>();
const mockUiState: MockUiState = {
  setLocale: mockSetLocale,
  setTheme: mockSetTheme,
  theme: 'light',
};

// Mock react-intl
vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
    locale: 'en',
  }),
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ children, to }: MockLinkProps) => <a href={to}>{children}</a>,
  };
});

// Mock Zustand stores
vi.mock('@/stores/useUiStore', () => ({
  useUiStore: vi.fn(<T,>(selector: (state: MockUiState) => T) => selector(mockUiState)),
}));

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({}),
    setState: vi.fn(),
  },
  setAuthFromLogin: vi.fn(),
}));

// Mock ApiClient as a class
const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock('@/lib/apiClient', () => {
  return {
    ApiClient: vi.fn().mockImplementation(function () {
      return {
        get: mockGet,
        post: mockPost,
      };
    }),
  };
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue([]);
    mockPost.mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      identity: { tenantId: 'default', userId: 'user-1' },
      tokenType: 'Bearer',
    });
  });

  it('1. Email tab is default - shows email/password fields', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    // Wait for initial mount effects to settle (e.g. tenant fetch)
    await waitFor(() => {
      expect(screen.getByLabelText('auth.email')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('auth.password')).toBeInTheDocument();
    expect(screen.queryByLabelText('auth.sms.phone')).not.toBeInTheDocument();
  });

  it('2. Clicking SMS tab shows phone and code inputs', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByText('auth.sms'));

    expect(screen.getByLabelText('auth.sms.phone')).toBeInTheDocument();
    expect(screen.getByLabelText('auth.sms.code')).toBeInTheDocument();
    expect(screen.queryByLabelText('auth.password')).not.toBeInTheDocument();
  });

  it('3. Send Code button calls POST /api/v1/auth/sms/send', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce({});

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByText('auth.sms'));

    const phoneInput = screen.getByLabelText('auth.sms.phone');
    await user.type(phoneInput, '+1234567890');

    const sendButton = screen.getByText('auth.sms.sendCode');
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/sms/send', { phone: '+1234567890' });
    });
  });

  it('4. OAuth buttons are visible (GitHub, Google)', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('auth.oauth.github')).toBeInTheDocument();
    });
    expect(screen.getByText('auth.oauth.google')).toBeInTheDocument();
  });

  it('5. Tab switching preserves state correctly', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const emailInput = screen.getByLabelText('auth.email') as HTMLInputElement;
    await user.type(emailInput, 'test@example.com');
    expect(emailInput.value).toBe('test@example.com');

    await user.click(screen.getByText('auth.sms'));
    expect(screen.queryByLabelText('auth.email')).not.toBeInTheDocument();

    await user.click(screen.getByText('auth.email'));
    const emailInputAgain = screen.getByLabelText('auth.email') as HTMLInputElement;
    expect(emailInputAgain.value).toBe('test@example.com');
  });

  it('6. Login form submits with correct payload', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce({
      accessToken: 'token',
      identity: { tenantId: 'default', userId: 'id' },
      refreshToken: 'refresh',
      tokenType: 'Bearer',
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('auth.email'), 'user@test.com');
    await user.type(screen.getByLabelText('auth.password'), 'password123');
    // Tenant field starts empty (TD-13 fix) — must type a value
    await user.type(screen.getByLabelText('auth.tenantId'), 'default');

    const loginButton = screen.getByRole('button', { name: 'auth.login' });
    await user.click(loginButton);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/login', {
        email: 'user@test.com',
        password: 'password123',
        tenantId: 'default',
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith('/overview', { replace: true });
  });
});
