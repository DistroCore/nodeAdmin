import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppLocale } from '@/i18n';
import { SettingsPanel } from '../settingsPanel';

interface MockUiState {
  imConversationPanelOpen: boolean;
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  sidebarCollapsed: boolean;
  theme: 'dark' | 'light';
  toggleImConversationPanel: () => void;
  toggleSidebar: () => void;
}

interface MockAuthState {
  tenantId: string;
  userId: string;
  userName: string;
  userRoles: string[];
}

const mockSetTheme = vi.fn<(theme: 'dark' | 'light') => void>();
const mockSetLocale = vi.fn<(locale: AppLocale) => void>();
const mockToggleSidebar = vi.fn<() => void>();
const mockToggleImPanel = vi.fn<() => void>();
const mockUiState: MockUiState = {
  imConversationPanelOpen: true,
  locale: 'en',
  setLocale: mockSetLocale,
  setTheme: mockSetTheme,
  sidebarCollapsed: false,
  theme: 'light',
  toggleImConversationPanel: mockToggleImPanel,
  toggleSidebar: mockToggleSidebar,
};
const mockAuthState: MockAuthState = {
  tenantId: 'tenant-456',
  userId: 'user-123',
  userName: 'Test User',
  userRoles: ['admin', 'editor'],
};

vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
  }),
}));

vi.mock('@/stores/useUiStore', () => ({
  useUiStore: <T,>(selector: (state: MockUiState) => T) => selector(mockUiState),
}));

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: <T,>(selector: (state: MockAuthState) => T) => selector(mockAuthState),
}));

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and description', () => {
    render(<SettingsPanel />);
    expect(screen.getByText('settings.title')).toBeInTheDocument();
    expect(screen.getByText('settings.desc')).toBeInTheDocument();
  });

  it('handles theme switching', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByText('settings.themeDark'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');

    await user.click(screen.getByText('settings.themeLight'));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('handles language switching', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByText('中文'));
    expect(mockSetLocale).toHaveBeenCalledWith('zh');

    await user.click(screen.getByText('English'));
    expect(mockSetLocale).toHaveBeenCalledWith('en');
  });

  it('handles display toggles', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    const sidebarCheckbox = screen.getByLabelText('settings.sidebarCollapsed');
    await user.click(sidebarCheckbox);
    expect(mockToggleSidebar).toHaveBeenCalled();

    const imCheckbox = screen.getByLabelText('settings.imPanel');
    await user.click(imCheckbox);
    expect(mockToggleImPanel).toHaveBeenCalled();
  });

  it('displays session information correctly', () => {
    render(<SettingsPanel />);
    expect(screen.getByText('user-123')).toBeInTheDocument();
    expect(screen.getByText('tenant-456')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('admin, editor')).toBeInTheDocument();
  });
});
