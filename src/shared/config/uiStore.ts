import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIStore {
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

/**
 * Shared store for layout and UI state.
 * Uses localStorage persistence to remember sidebar state across sessions.
 */
export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      isSidebarOpen: true,
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    }),
    {
      name: 'ui-storage', // key in localStorage
    }
  )
);
