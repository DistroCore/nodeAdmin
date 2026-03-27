import { create } from 'zustand';
import { type AppLocale, getLocale, setStoredLocale } from '@/i18n';

interface UiState {
  imConversationPanelOpen: boolean;
  locale: AppLocale;
  mobileMenuOpen: boolean;
  setImConversationPanelOpen: (open: boolean) => void;
  setLocale: (locale: AppLocale) => void;
  setMobileMenuOpen: (open: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  sidebarCollapsed: boolean;
  theme: 'dark' | 'light';
  toggleImConversationPanel: () => void;
  toggleSidebar: () => void;
}

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
  setTheme: (theme) => set({ theme }),
  sidebarCollapsed: false,
  theme: 'light',
  toggleImConversationPanel: () =>
    set((state) => ({ imConversationPanelOpen: !state.imConversationPanelOpen })),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
