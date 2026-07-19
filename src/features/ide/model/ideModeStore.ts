/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideModeStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The left-rail panels of the IDE shell (VS Code activity bar). */
export type IdePanel = "explorer" | "search" | "scm" | "run" | "problems";

interface IdeModeState {
  /** Per-workspace "the full IDE layout is active". Keyed by workspaceId so a
   *  user can be in IDE mode in one workspace and the normal grid in another. */
  byWorkspace: Record<string, boolean>;
  /** Which left panel is showing (shared across workspaces — a UI preference). */
  activePanel: IdePanel;
  /** Whether the bottom strip (terminal/output) is expanded. */
  bottomOpen: boolean;
  isIdeMode: (workspaceId: string) => boolean;
  setIdeMode: (workspaceId: string, on: boolean) => void;
  toggleIdeMode: (workspaceId: string) => void;
  setPanel: (panel: IdePanel) => void;
  toggleBottom: () => void;
}

/**
 * IDE layout mode — the runtime switch that flips a workspace's content region
 * from the normal WorkspaceGrid into the dedicated VS Code-style IdeShell.
 *
 * Distinct from BOTH the `osio.ide` FLAG (the feature must exist at all —
 * default OFF) and `useDevMode` (reveals file affordances on the normal
 * surface). All three gate the shell: flag on + this mode on renders IdeShell.
 * Per-workspace + persisted, so "I code in workspace W" sticks across reloads.
 * SAFE to persist: the shell always renders its own exit control, so a stuck
 * state is one click out (unlike Zen mode, which hides its own exit).
 */
export const useIdeModeStore = create<IdeModeState>()(
  persist(
    (set, get) => ({
      byWorkspace: {},
      activePanel: "explorer",
      bottomOpen: false,
      isIdeMode: (workspaceId) => Boolean(workspaceId) && get().byWorkspace[workspaceId] === true,
      setIdeMode: (workspaceId, on) => {
        if (!workspaceId) return;
        set((state) => ({ byWorkspace: { ...state.byWorkspace, [workspaceId]: on } }));
      },
      toggleIdeMode: (workspaceId) => {
        if (!workspaceId) return;
        set((state) => ({
          byWorkspace: { ...state.byWorkspace, [workspaceId]: !state.byWorkspace[workspaceId] },
        }));
      },
      setPanel: (panel) => set({ activePanel: panel }),
      toggleBottom: () => set((state) => ({ bottomOpen: !state.bottomOpen })),
    }),
    { name: "osio.ide.mode" },
  ),
);
