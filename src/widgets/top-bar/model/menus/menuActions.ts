/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   menuActions.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { activeTabOf, findPane, type WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { usePalette } from "../usePalette";
import type { MenuAction } from "../menuTypes";
import { canClosePane, canCloseTab, tabCycleTarget } from "./layoutGuards";

/** The workspace layout store, read at call time so a row never closes over stale state. */
export function layout(): ReturnType<typeof useWorkspaceLayout.getState> {
  return useWorkspaceLayout.getState();
}

/** The command palette store, read at call time. */
export function palette(): ReturnType<typeof usePalette.getState> {
  return usePalette.getState();
}

/** The active tab of the active pane, or null when the layout holds none. */
export function activeTab(): WorkspaceTab | null {
  const state = layout();
  return activeTabOf(state.root, state.activePaneId);
}

/** True while File › Close tab would leave a tab open (the last tab of the last pane stays). */
export function canCloseActiveTab(): boolean {
  const state = layout();
  return canCloseTab(state.root, state.activePaneId);
}

/** Close the active tab; a no-op on the last tab of the last pane, which would close the workspace. */
export function closeActiveTab(): void {
  const state = layout();
  const tab = activeTab();
  if (tab && canCloseActiveTab()) state.closeTab(state.activePaneId, tab.tabId);
}

/** True while File › Close pane would leave a pane open. */
export function canCloseActivePane(): boolean {
  return canClosePane(layout().root);
}

/** Close the active pane; a no-op on the only pane, which would close the workspace. */
export function closeActivePane(): void {
  const state = layout();
  if (canCloseActivePane()) state.closePane(state.activePaneId);
}

/** The pane and tab one step from the active tab, or null with fewer than two tabs. */
function cycleTarget(step: 1 | -1): { paneId: string; tabId: string } | null {
  const state = layout();
  const pane = findPane(state.root, state.activePaneId);
  const tabId = pane ? tabCycleTarget(pane.tabs, pane.activeTabId, step) : null;
  return pane && tabId ? { paneId: pane.id, tabId } : null;
}

/** A Go row that focuses the next or previous tab of the active pane; disabled with fewer than two tabs. */
export function cycleTabAction(row: Pick<MenuAction, "id" | "label" | "separatorAfter">, step: 1 | -1): MenuAction {
  return {
    ...row,
    disabled: () => cycleTarget(step) === null,
    run: () => {
      const target = cycleTarget(step);
      if (target) layout().setActiveTab(target.paneId, target.tabId);
    },
  };
}

/** A row that opens (or focuses) the tab a factory builds. */
export function openTabAction(id: string, label: string, makeTab: () => WorkspaceTab): MenuAction {
  return { id, label, run: () => layout().openTab(makeTab()) };
}
