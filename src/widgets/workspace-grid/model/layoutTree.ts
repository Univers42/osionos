/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutTree.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** A single open document inside a pane (an "onglet"). */
export type TabKind = "page" | "database" | "channel" | "folder" | "home" | "trash";

export interface WorkspaceTab {
  tabId: string;
  pageId: string;
  workspaceId: string;
  kind: TabKind;
  title?: string;
  icon?: string;
  databaseId?: string | null;
}

/** Leaf of the layout tree: a tab-group (one visible tab at a time). */
export interface PaneNode {
  type: "pane";
  id: string;
  tabs: WorkspaceTab[];
  activeTabId: string | null;
}

/** Branch of the layout tree: an ordered, resizable row/column of children. */
export interface SplitNode {
  type: "split";
  id: string;
  direction: "row" | "column";
  children: LayoutNode[];
  sizes: number[]; // parallel to children, normalised to sum 100
}

export type LayoutNode = PaneNode | SplitNode;

let idCounter = 0;
/** Collision-resistant, SSR-safe id (no crypto dependency at import time). */
export function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Depth-first lookup of a pane by id. */
export function findPane(node: LayoutNode, paneId: string): PaneNode | null {
  if (node.type === "pane") return node.id === paneId ? node : null;
  for (const child of node.children) {
    const hit = findPane(child, paneId);
    if (hit) return hit;
  }
  return null;
}

/** All panes left-to-right (used for "focus if already open" + fallbacks). */
export function collectPanes(node: LayoutNode): PaneNode[] {
  return node.type === "pane" ? [node] : node.children.flatMap(collectPanes);
}

/** Immutably replace one pane via an updater, returning a new tree. */
export function updatePane(node: LayoutNode, paneId: string, fn: (pane: PaneNode) => PaneNode): LayoutNode {
  if (node.type === "pane") return node.id === paneId ? fn(node) : node;
  return { ...node, children: node.children.map((child) => updatePane(child, paneId, fn)) };
}

/** First pane (anywhere) already showing `pageId` — for "focus if already open". */
export function findOpenTab(root: LayoutNode, pageId: string): { paneId: string; tab: WorkspaceTab } | null {
  for (const pane of collectPanes(root)) {
    const tab = pane.tabs.find((entry) => entry.pageId === pageId);
    if (tab) return { paneId: pane.id, tab };
  }
  return null;
}

/** The active tab of a pane (falls back to the first pane / first tab). */
export function activeTabOf(root: LayoutNode, paneId: string): WorkspaceTab | null {
  const pane = findPane(root, paneId) ?? collectPanes(root)[0];
  if (!pane) return null;
  return pane.tabs.find((entry) => entry.tabId === pane.activeTabId) ?? pane.tabs[0] ?? null;
}
