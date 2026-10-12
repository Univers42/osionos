/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbenchStore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import {
  DOCK_DEFAULT_HEIGHT,
  clampDockHeight,
  isDockTab,
  migrateFromIdeMode,
  type DockTab,
} from "./workbenchLayout";

export const WORKBENCH_STORAGE_KEY = "osio.workbench.v1";
const LEGACY_IDE_MODE_KEY = "osio.ide.mode";

interface WorkbenchState {
  dockOpen: boolean;
  dockTab: DockTab;
  dockHeight: number;
  statusBarVisible: boolean;
  toggleDock: () => void;
  openDock: (tab?: DockTab) => void;
  closeDock: () => void;
  setDockTab: (tab: DockTab) => void;
  setDockHeight: (px: number) => void;
  toggleStatusBar: () => void;
}

type PersistedWorkbench = Pick<WorkbenchState, "dockOpen" | "dockTab" | "dockHeight" | "statusBarVisible">;

/** Never trust the stored blob: a hand-edited or older shape must not reach
 *  the UI (unknown tab would hide every panel; NaN height would break layout). */
export function sanitizePersisted(raw: unknown, viewportHeight: number): Partial<PersistedWorkbench> {
  const src = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: Partial<PersistedWorkbench> = {};
  if (typeof src.dockOpen === "boolean") out.dockOpen = src.dockOpen;
  if (typeof src.statusBarVisible === "boolean") out.statusBarVisible = src.statusBarVisible;
  out.dockTab = isDockTab(src.dockTab) ? src.dockTab : "terminal";
  if (typeof src.dockHeight === "number") out.dockHeight = clampDockHeight(src.dockHeight, viewportHeight);
  return out;
}

function safeGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

// Seeds dockOpen exactly once: only while our own blob is absent. Once the
// store persists, the legacy key is never consulted again.
const seededStorage: StateStorage = {
  getItem: (name) => {
    const own = safeGet(name);
    if (own !== null) return own;
    const seed = migrateFromIdeMode(safeGet(LEGACY_IDE_MODE_KEY));
    return seed ? JSON.stringify({ state: { dockOpen: seed.dockOpen }, version: 0 }) : null;
  },
  setItem: (name, value) => {
    try {
      globalThis.localStorage?.setItem(name, value);
    } catch {
      /* storage full or blocked: the dock state is session-only then */
    }
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage?.removeItem(name);
    } catch {
      /* nothing to remove when storage is blocked */
    }
  },
};

export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set) => ({
      dockOpen: false,
      dockTab: "terminal",
      dockHeight: DOCK_DEFAULT_HEIGHT,
      statusBarVisible: true,
      toggleDock: () => set((s) => ({ dockOpen: !s.dockOpen })),
      openDock: (tab) => set((s) => ({ dockOpen: true, dockTab: tab ?? s.dockTab })),
      closeDock: () => set({ dockOpen: false }),
      setDockTab: (tab) => set({ dockTab: tab }),
      setDockHeight: (px) => set({ dockHeight: clampDockHeight(px, globalThis.innerHeight) }),
      toggleStatusBar: () => set((s) => ({ statusBarVisible: !s.statusBarVisible })),
    }),
    {
      name: WORKBENCH_STORAGE_KEY,
      storage: createJSONStorage(() => seededStorage),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizePersisted(persisted, globalThis.innerHeight),
      }),
      partialize: (s) => ({
        dockOpen: s.dockOpen,
        dockTab: s.dockTab,
        dockHeight: s.dockHeight,
        statusBarVisible: s.statusBarVisible,
      }),
    },
  ),
);
