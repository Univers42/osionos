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
  | 'conversations'
  | 'notifications'
  | 'tasks'
  | 'public'
  | 'database'
  // Workbench panels (Source Control, Run, Problems).
  | 'scm'
  | 'run'
  | 'problems';

/** Panel-width bounds (px). The rail itself is a fixed ~48px, set in CSS. */
/** Where Ctrl+Alt+B goes from `mode`: a docked sidebar (panel or rail) hides,
 *  a hidden one comes back as it was docked last. */
export function nextSidebarMode(mode: SidebarMode, lastDocked: Exclude<SidebarMode, 'hidden'>): SidebarMode {
  return mode === 'hidden' ? lastDocked : 'hidden';
}

/** Panel ids that were renamed: a stored old id still opens the right panel. */
export function migratePanelId(panel: unknown): ActivePanel {
  if (panel === 'messenger') return 'conversations';
  return typeof panel === 'string' && KNOWN_PANELS.has(panel as ActivePanel) ? (panel as ActivePanel) : 'files';
}

const KNOWN_PANELS = new Set<ActivePanel>([
  'files', 'search', 'marketplace', 'agents', 'conversations', 'notifications', 'tasks', 'public', 'database',
]);

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
  /** The docked mode Ctrl+Alt+B returns to after hiding. */
  lastDockedMode: Exclude<SidebarMode, 'hidden'>;
  /** Ctrl+Alt+B: hide a docked sidebar, bring a hidden one back as it was. */
  toggleDocked: () => void;

  // --- legacy fields kept for back-compat (still read by Settings/TopBar) ---
  isSidebarOpen: boolean; // mirror of (sidebarMode !== 'hidden')
  sidebarWidth: number; // = the expanded PANEL width, remembered across rail/hidden
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
}

/** Persisted-state migration. v0 → v1: the old {isSidebarOpen, width} blob
 *  maps onto the mode machine. v1 → v2: the panel id "messenger" became
 *  "conversations" and Ctrl+Alt+B remembers the docked mode. */
export function migrateUiState(persisted: unknown, version: number): UIStore {
  const prev = (persisted ?? {}) as Partial<UIStore>;
  if (version < 1) {
    const open = prev.isSidebarOpen !== false;
    return {
      ...prev,
      sidebarMode: open ? 'panel' : 'hidden',
      activePanel: 'files',
      isSidebarOpen: open,
      sidebarWidth: clampPanelWidth(prev.sidebarWidth ?? 260),
      lastDockedMode: 'panel',
    } as UIStore;
  }
  if (version < 2) {
    const mode = prev.sidebarMode ?? 'panel';
    return {
      ...prev,
      activePanel: migratePanelId(prev.activePanel),
      lastDockedMode: mode === 'rail' ? 'rail' : 'panel',
    } as UIStore;
  }
  return prev as UIStore;
}

/**
 * Shared store for layout and UI state, persisted to localStorage so the
 * sidebar mode/width survive reloads. The sidebar is a small state machine
 * (panel | rail | hidden); `isSidebarOpen` is kept as a derived mirror so the
 * older call-sites (Settings, Sidebar) keep working.
 */
export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => {
      // Every mode change also refreshes the `isSidebarOpen` compat mirror.
      const applyMode = (mode: SidebarMode) =>
        set(mode === 'hidden'
          ? { sidebarMode: mode, isSidebarOpen: false }
          : { sidebarMode: mode, isSidebarOpen: true, lastDockedMode: mode });

      return {
        sidebarMode: 'panel',
        lastDockedMode: 'panel',
        activePanel: 'files',
        isSidebarOpen: true,
        sidebarWidth: 260,

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
        toggleDocked: () => {
          const { sidebarMode, lastDockedMode } = get();
          applyMode(nextSidebarMode(sidebarMode, lastDockedMode));
        },

        // Back-compat actions, rewired onto the state machine.
        setSidebarOpen: (open) => applyMode(open ? 'panel' : 'rail'),
        setSidebarWidth: (width) => set({ sidebarWidth: clampPanelWidth(width) }),
        // The TopBar/View toggle flips panel <-> rail (never to hidden).
        toggleSidebar: () =>
          applyMode(get().sidebarMode === 'panel' ? 'rail' : 'panel'),
      };
    },
    {
      name: 'ui-storage', // key in localStorage
      version: 2,
      // Map the old {isSidebarOpen, sidebarWidth, ...} blob onto the new shape
      // so existing users keep their width and aren't reset to defaults.
      migrate: migrateUiState,
    },
  ),
);
