import { create } from 'zustand';
import { type AppLocale, getLocale, setStoredLocale } from '@/i18n';

type Theme = 'dark' | 'light';

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('theme', theme);
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface UiState {
  imConversationPanelOpen: boolean;
  locale: AppLocale;
  mobileMenuOpen: boolean;
  setImConversationPanelOpen: (open: boolean) => void;
  setLocale: (locale: AppLocale) => void;
  setMobileMenuOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  sidebarCollapsed: boolean;
  theme: Theme;
  toggleImConversationPanel: () => void;
  toggleSidebar: () => void;
}

// Apply theme immediately on load to prevent flash
applyTheme(getInitialTheme());

export const useUiStore = create<UiState>((set) => ({
  imConversationPanelOpen: true,
  locale: getLocale(),
  mobileMenuOpen: false,
  setImConversationPanelOpen: (open) => set({ imConversationPanelOpen: open }),
  setLocale: (locale) => {
    setStoredLocale(locale);
    document.documentElement.lang = locale;
    set({ locale });
  },
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  sidebarCollapsed: false,
  theme: getInitialTheme(),
  toggleImConversationPanel: () => set((state) => ({ imConversationPanelOpen: !state.imConversationPanelOpen })),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
