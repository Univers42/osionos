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

/** VSCode-style left-sidebar states: full panel, icon-only rail, or hidden. */
export type SidebarMode = 'panel' | 'rail' | 'hidden';
/** Which destination the expanded panel shows (the active activity-rail item). */
export type ActivePanel =
  | 'files'
  | 'search'
  | 'marketplace'
  | 'agents'
  | 'messenger'
  | 'notifications'
  | 'public'
  | 'database';

/** Panel-width bounds (px). The rail itself is a fixed ~48px, set in CSS. */
export const PANEL_MIN_WIDTH = 160;
export const PANEL_MAX_WIDTH = 480;
const clampPanelWidth = (width: number) =>
  Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width));

interface UIStore {
  // --- VSCode-style sidebar state machine -------------------------------
  sidebarMode: SidebarMode;
  activePanel: ActivePanel;
  setSidebarMode: (mode: SidebarMode) => void;
  setActivePanel: (panel: ActivePanel) => void;
  /** Rail click: open the panel; clicking the already-active panel collapses to rail. */
  selectPanel: (panel: ActivePanel) => void;
  expandToPanel: (panel?: ActivePanel) => void;
  collapseToRail: () => void;
  hide: () => void;
  reveal: () => void;

  // --- legacy fields kept for back-compat (still read by Sidebar/Settings/TopBar) ---
  isSidebarOpen: boolean; // mirror of (sidebarMode !== 'hidden')
  sidebarWidth: number; // = the expanded PANEL width, remembered across rail/hidden
  useNewSidebar: boolean;
  showOtherApps: boolean;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setUseNewSidebar: (enabled: boolean) => void;
  setShowOtherApps: (enabled: boolean) => void;
  toggleSidebar: () => void;
}

/**
 * Shared store for layout and UI state, persisted to localStorage so the
 * sidebar mode/width survive reloads. The sidebar is a small state machine
 * (panel | rail | hidden); `isSidebarOpen` is kept as a derived mirror so the
 * older call-sites (WorkspaceSwitcher, SidebarTrigger, TopBar) keep working.
 */
export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => {
      // Every mode change also refreshes the `isSidebarOpen` compat mirror.
      const applyMode = (mode: SidebarMode) =>
        set({ sidebarMode: mode, isSidebarOpen: mode !== 'hidden' });

      return {
        sidebarMode: 'panel',
        activePanel: 'files',
        isSidebarOpen: true,
        sidebarWidth: 260,
        useNewSidebar: true,
        showOtherApps: true,

        setSidebarMode: (mode) => applyMode(mode),
        setActivePanel: (panel) => set({ activePanel: panel }),
        selectPanel: (panel) => {
          const { sidebarMode, activePanel } = get();
          if (sidebarMode === 'panel') {
            // Clicking the active icon while expanded collapses back to the rail.
            if (activePanel === panel) return applyMode('rail');
            return set({ activePanel: panel });
          }
          // From rail/hidden: open the panel on the chosen destination.
          set({ activePanel: panel });
          applyMode('panel');
        },
        expandToPanel: (panel) => {
          if (panel) set({ activePanel: panel });
          applyMode('panel');
        },
        collapseToRail: () => applyMode('rail'),
        hide: () => applyMode('hidden'),
        reveal: () => applyMode('panel'),

        // Back-compat actions, rewired onto the state machine.
        setSidebarOpen: (open) => applyMode(open ? 'panel' : 'rail'),
        setSidebarWidth: (width) => set({ sidebarWidth: clampPanelWidth(width) }),
        setUseNewSidebar: (enabled) => set({ useNewSidebar: enabled }),
        setShowOtherApps: (enabled) => set({ showOtherApps: enabled }),
        // The TopBar/View toggle flips panel <-> rail (never to hidden).
        toggleSidebar: () =>
          applyMode(get().sidebarMode === 'panel' ? 'rail' : 'panel'),
      };
    },
    {
      name: 'ui-storage', // key in localStorage
      version: 1,
      // Map the old {isSidebarOpen, sidebarWidth, ...} blob onto the new shape
      // so existing users keep their width and aren't reset to defaults.
      migrate: (persisted, version) => {
        const prev = (persisted ?? {}) as Partial<UIStore>;
        if (version < 1) {
          const open = prev.isSidebarOpen !== false;
          return {
            ...prev,
            sidebarMode: open ? 'panel' : 'hidden',
            activePanel: 'files',
            isSidebarOpen: open,
            sidebarWidth: clampPanelWidth(prev.sidebarWidth ?? 260),
            useNewSidebar: prev.useNewSidebar ?? true,
            showOtherApps: prev.showOtherApps ?? true,
          } as UIStore;
        }
        return prev as UIStore;
      },
    },
  ),
);
