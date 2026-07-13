/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutMutations.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { collectPanes, findPane, genId, updatePane, type LayoutNode, type PaneNode, type WorkspaceTab } from "./layoutTree";

/** Scale a list of split sizes so it sums to 100. */
function normalizeSizes(sizes: number[]): number[] {
  const sum = sizes.reduce((acc, value) => acc + value, 0) || 1;
  return sizes.map((value) => (value / sum) * 100);
}

/**
 * Remove a pane and collapse the tree: an emptied split with one child is
 * replaced by that child; sizes are renormalised. Returns null only if the
 * removed pane was the entire tree (caller then resets to a fresh layout).
 */
export function removePane(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.type === "pane") return node.id === paneId ? null : node;
  const keptChildren: LayoutNode[] = [];
  const keptSizes: number[] = [];
  node.children.forEach((child, index) => {
    const next = removePane(child, paneId);
    if (next) {
      keptChildren.push(next);
      keptSizes.push(node.sizes[index] ?? 0);
    }
  });
  if (keptChildren.length === 0) return null;
  if (keptChildren.length === 1) return keptChildren[0];
  return { ...node, children: keptChildren, sizes: normalizeSizes(keptSizes) };
}

/**
 * Replace `paneId` with a 50/50 split that contains the original pane and a new
 * pane, ordered by `side`. Always wraps in a fresh split node (simple nesting).
 */
export function splitPane(
  node: LayoutNode,
  paneId: string,
  direction: "row" | "column",
  newPane: PaneNode,
  side: "before" | "after",
): LayoutNode {
  if (node.type === "pane") {
    if (node.id !== paneId) return node;
    const children = side === "before" ? [newPane, node] : [node, newPane];
    return { type: "split", id: genId("split"), direction, children, sizes: [50, 50] };
  }
  return { ...node, children: node.children.map((child) => splitPane(child, paneId, direction, newPane, side)) };
}

/**
 * Close every open tab that `shouldClose` matches (a page archived → trash, or
 * deleted, must not linger in the tab bar). Emptied panes collapse via removePane.
 * Pure — the store method is thin glue over this. Returns:
 *   - `null`   → nothing matched, tree unchanged;
 *   - `"empty"`→ the whole tree emptied (caller resets to a fresh Home layout);
 *   - `{ root, activePaneId }` → the pruned tree + a still-live active pane.
 */
export function pruneTabsForPages(
  root: LayoutNode,
  activePaneId: string,
  shouldClose: (tab: WorkspaceTab) => boolean,
): { root: LayoutNode; activePaneId: string } | "empty" | null {
  const panes = collectPanes(root);
  if (!panes.some((pane) => pane.tabs.some(shouldClose))) return null;

  let next: LayoutNode = root;
  for (const pane of panes) {
    if (!pane.tabs.some(shouldClose)) continue;
    const remaining = pane.tabs.filter((tab) => !shouldClose(tab));
    if (remaining.length > 0) {
      next = updatePane(next, pane.id, (p) => ({
        ...p,
        // Keep the active tab if it survived, else fall to the rightmost survivor.
        tabs: remaining,
        activeTabId: remaining.some((t) => t.tabId === p.activeTabId)
          ? p.activeTabId
          : remaining[remaining.length - 1].tabId,
      }));
    } else {
      next = removePane(next, pane.id) ?? next; // null only for the LAST pane → guard below
    }
  }

  const livePanes = collectPanes(next);
  if (livePanes.length <= 1 && (livePanes[0]?.tabs.some(shouldClose) ?? true)) return "empty";
  const nextActive = findPane(next, activePaneId) ? activePaneId : livePanes[0].id;
  return { root: next, activePaneId: nextActive };
}

/** Immutably set the sizes of one split node. */
export function setSizes(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (node.type === "pane") return node;
  if (node.id === splitId) return { ...node, sizes: normalizeSizes(sizes) };
  return { ...node, children: node.children.map((child) => setSizes(child, splitId, sizes)) };
}
