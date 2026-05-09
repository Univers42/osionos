/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   uiStore.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:24:37 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/09 18:49:05 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIStore {
  isSidebarOpen: boolean;
  sidebarWidth: number;
  useNewSidebar: boolean;
  showOtherApps: boolean;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setUseNewSidebar: (enabled: boolean) => void;
  setShowOtherApps: (enabled: boolean) => void;
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
      sidebarWidth: 260,
      useNewSidebar: true,
      showOtherApps: true,
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.min(420, Math.max(220, width)) }),
      setUseNewSidebar: (enabled) => set({ useNewSidebar: enabled }),
      setShowOtherApps: (enabled) => set({ showOtherApps: enabled }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    }),
    {
      name: 'ui-storage', // key in localStorage
    }
  )
);
