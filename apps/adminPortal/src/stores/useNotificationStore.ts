import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationState {
  readIds: Set<string>;
  markAsRead: (id: string) => void;
  markAllAsRead: (ids: string[]) => void;
  isRead: (id: string) => boolean;
}

interface PersistedState {
  readIds: string[];
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      readIds: new Set<string>(),
      markAsRead: (id) => {
        set((state) => {
          const next = new Set(state.readIds);
          next.add(id);
          return { readIds: next };
        });
      },
      markAllAsRead: (ids) => {
        set((state) => {
          const next = new Set(state.readIds);
          ids.forEach((id) => next.add(id));
          return { readIds: next };
        });
      },
      isRead: (id) => get().readIds.has(id),
    }),
    {
      name: 'node-admin-notifications',
      partialize: (state: NotificationState): PersistedState => ({
        readIds: Array.from(state.readIds),
      }),
      onRehydrateStorage: () => (state: NotificationState | undefined) => {
        if (state && Array.isArray(state.readIds as unknown)) {
          (state as { readIds: Set<string> }).readIds = new Set(state.readIds as unknown as string[]);
        }
      },
    },
  ),
);
