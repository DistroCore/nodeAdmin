import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationState {
  readIds: Set<string>;
  readBefore: number | null;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  isRead: (id: string, createdAt: string | number | Date) => boolean;
}

interface PersistedState {
  readIds: string[];
  readBefore: number | null;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      readIds: new Set<string>(),
      readBefore: null,
      markAsRead: (id) => {
        set((state) => {
          const next = new Set(state.readIds);
          next.add(id);
          return { readIds: next };
        });
      },
      // Watermark: everything created at or before "now" counts as read — including
      // entries not yet loaded into the list. Individually-marked ids still win.
      markAllAsRead: () => {
        set({ readBefore: Date.now() });
      },
      isRead: (id, createdAt) => {
        const state = get();
        if (state.readIds.has(id)) return true;
        if (state.readBefore === null) return false;
        return new Date(createdAt).getTime() <= state.readBefore;
      },
    }),
    {
      name: 'node-admin-notifications',
      partialize: (state: NotificationState): PersistedState => ({
        readIds: Array.from(state.readIds),
        readBefore: state.readBefore,
      }),
      onRehydrateStorage: () => (state: NotificationState | undefined) => {
        if (state && Array.isArray(state.readIds as unknown)) {
          (state as { readIds: Set<string> }).readIds = new Set(state.readIds as unknown as string[]);
        }
      },
    },
  ),
);
