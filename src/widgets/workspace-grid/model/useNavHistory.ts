/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useNavHistory.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import { useEffect } from "react";
import { create } from "zustand";

import { usePageStore } from "@/store/usePageStore";
import { activeTabOf, type WorkspaceTab } from "./layoutTree";
import { canStep, emptyHistory, recordVisit, stepHistory, type NavHistory } from "./navHistoryCore";
import { useWorkspaceLayout } from "./workspaceLayout";

/**
 * Ponytail: only a `page` tab is checked against the page store; the other kinds
 * (home, trash, database, settings, ...) are treated as always there, so a deleted
 * database is reopened as an empty tab instead of being skipped.
 */
function tabStillExists(tab: WorkspaceTab): boolean {
  if (tab.kind !== "page") return true;
  const page = usePageStore.getState().pageById(tab.pageId);
  return Boolean(page) && !page?.archivedAt;
}

interface NavHistoryState {
  history: NavHistory;
  record: (tab: WorkspaceTab) => void;
  go: (direction: -1 | 1) => void;
}

export const useNavHistory = create<NavHistoryState>((set, get) => ({
  history: emptyHistory(),
  record: (tab) => {
    const next = recordVisit(get().history, tab);
    if (next !== get().history) set({ history: next });
  },
  go: (direction) => {
    const stepped = stepHistory(get().history, direction, tabStillExists);
    set({ history: stepped.history });
    if (stepped.tab) useWorkspaceLayout.getState().openTab(stepped.tab);
  },
}));

/** True when Go back (-1) or Go forward (1) has an existing page to land on. */
export function canGoInHistory(direction: -1 | 1): boolean {
  return canStep(useNavHistory.getState().history, direction, tabStillExists);
}

/** Records the active tab each time the active page changes, from the layout store. */
export function useNavHistoryRecorder(): void {
  useEffect(() => {
    const record = (): void => {
      const { root, activePaneId } = useWorkspaceLayout.getState();
      const tab = activeTabOf(root, activePaneId);
      if (tab) useNavHistory.getState().record(tab);
    };
    record();
    return useWorkspaceLayout.subscribe(record);
  }, []);
}
