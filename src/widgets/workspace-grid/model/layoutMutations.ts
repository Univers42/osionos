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

import { genId, type LayoutNode, type PaneNode } from "./layoutTree";

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

/** Immutably set the sizes of one split node. */
export function setSizes(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (node.type === "pane") return node;
  if (node.id === splitId) return { ...node, sizes: normalizeSizes(sizes) };
  return { ...node, children: node.children.map((child) => setSizes(child, splitId, sizes)) };
}
