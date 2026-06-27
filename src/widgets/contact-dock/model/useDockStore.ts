/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDockStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Floating contact dock state (LinkedIn-style). Persists the collapsed pill,
 * the stack of open chat tabs and which one is focused; `minimized` and the AI
 * panel toggle live alongside. `Set` is not JSON-serializable so we persist
 * minimized as an array and rehydrate it back into a Set.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DockTab {
  channelId: string;
  workspaceId: string;
  title: string;
}

interface DockStore {
  collapsed: boolean;
  openTabs: DockTab[];
  minimized: Set<string>;
  focusedId: string | null;
  aiOpen: boolean;
  toggleCollapsed: () => void;
  openTab: (tab: DockTab) => void;
  closeTab: (channelId: string) => void;
  minimizeTab: (channelId: string) => void;
  focusTab: (channelId: string) => void;
  toggleAi: () => void;
}

const STORE_NAME = 'osionos:contact-dock';
const MAX_TABS = 3;

export const useDockStore = create<DockStore>()(
  persist(
    (set, get) => ({
      collapsed: true,
      openTabs: [],
      minimized: new Set<string>(),
      focusedId: null,
      aiOpen: false,
      toggleCollapsed: () => set({ collapsed: !get().collapsed }),
      openTab: (tab) => {
        const existing = get().openTabs.find((item) => item.channelId === tab.channelId);
        const minimized = new Set(get().minimized);
        minimized.delete(tab.channelId);
        const openTabs = existing
          ? get().openTabs
          : [tab, ...get().openTabs].slice(0, MAX_TABS);
        set({ openTabs, minimized, focusedId: tab.channelId, collapsed: false });
      },
      closeTab: (channelId) => {
        const minimized = new Set(get().minimized);
        minimized.delete(channelId);
        const openTabs = get().openTabs.filter((item) => item.channelId !== channelId);
        set({
          openTabs,
          minimized,
          focusedId: get().focusedId === channelId ? null : get().focusedId,
        });
      },
      minimizeTab: (channelId) => {
        const minimized = new Set(get().minimized);
        minimized.add(channelId);
        set({ minimized, focusedId: get().focusedId === channelId ? null : get().focusedId });
      },
      focusTab: (channelId) => {
        const minimized = new Set(get().minimized);
        minimized.delete(channelId);
        set({ minimized, focusedId: channelId });
      },
      toggleAi: () => set({ aiOpen: !get().aiOpen, collapsed: false }),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({
        collapsed: state.collapsed,
        openTabs: state.openTabs,
        minimized: [...state.minimized],
        aiOpen: state.aiOpen,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<DockStore> & { minimized?: string[] };
        return {
          ...current,
          ...saved,
          minimized: new Set(Array.isArray(saved.minimized) ? saved.minimized : []),
        };
      },
    },
  ),
);
