/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutGuards.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { collectPanes, findPane, type LayoutNode, type WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

/** The index `step` places away from `index` in a ring of `count`, wrapping at both ends. */
export function cycleIndex(index: number, count: number, step: 1 | -1): number {
  return (index + step + count) % count;
}

/** The tabId one step from the active tab, or null when there is nothing else to cycle to. */
export function tabCycleTarget(tabs: WorkspaceTab[], activeTabId: string | null, step: 1 | -1): string | null {
  const index = tabs.findIndex((tab) => tab.tabId === activeTabId);
  if (tabs.length < 2 || index < 0) return null;
  return tabs[cycleIndex(index, tabs.length, step)].tabId;
}

/** True when closing a pane leaves another one: closing the only pane closes the workspace. */
export function canClosePane(root: LayoutNode): boolean {
  return collectPanes(root).length > 1;
}

/**
 * True when closing the pane's active tab leaves something open. The last tab of
 * the last pane would close the whole workspace, so it is refused.
 */
export function canCloseTab(root: LayoutNode, paneId: string): boolean {
  const pane = findPane(root, paneId);
  const hasActiveTab = pane?.tabs.some((tab) => tab.tabId === pane.activeTabId) ?? false;
  return hasActiveTab && ((pane?.tabs.length ?? 0) > 1 || canClosePane(root));
}
