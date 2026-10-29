/* ************************************************************************** */
/*                                                                            */
/*   pageLibraryModel.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The pure half of the Library pane: which pages a tab lists, how a flat page
// list becomes a tree, and every sort order the header offers. No React and no
// store reads here, so the tree/recents rules are testable in the canvas suite.

import type { ActivePage, PageEntry } from "@/entities/page";

export const LIBRARY_TABS = ["recents", "favorites", "shared", "private", "skills"] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

export const LIBRARY_SORTS = ["edited", "visited", "title"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export interface LibraryNode {
  page: PageEntry;
  depth: number;
  children: LibraryNode[];
}

export interface LibraryRow {
  page: PageEntry;
  depth: number;
  hasChildren: boolean;
}

/** A page whose body the Library may show. Archived pages are never listed. */
export function isListablePage(page: PageEntry): boolean {
  return !page.archivedAt;
}

/** A page is shared when it is shared/public or carries an explicit collaborator. */
export function isSharedPage(page: PageEntry): boolean {
  return page.visibility === "shared" || page.visibility === "public" || (page.collaborators?.length ?? 0) > 0;
}

/** Case-insensitive owner match; anonymous pages belong to nobody. */
export function isOwnedBy(page: PageEntry, userId: string): boolean {
  return Boolean(userId && page.ownerId && page.ownerId.toLowerCase() === userId.toLowerCase());
}

/** The Source column: public pages show their workspace, explicitly shared pages
 *  say Shared, and everything else is Private. */
export function sourceLabel(page: PageEntry, workspaceName: string): string {
  if (page.visibility === "public") return workspaceName || "Workspace";
  if (isSharedPage(page)) return "Shared";
  return "Private";
}

/** Last visit per page id, newest first when the recents list is newest-first. */
export function visitedAtByPage(recents: readonly ActivePage[]): Map<string, number> {
  const visited = new Map<string, number>();
  for (const recent of recents) {
    if (visited.has(recent.id)) continue;
    visited.set(recent.id, recent.visitedAt ?? 0);
  }
  return visited;
}

/** The pages of one tab, before search and sorting. Order follows the tab's own
 *  meaning: recents keep visit order, every other tab keeps workspace order. */
export function pagesForTab(
  tab: LibraryTab,
  pages: readonly PageEntry[],
  recents: readonly ActivePage[],
  favoriteIds: readonly string[],
  userId: string,
): PageEntry[] {
  const live = pages.filter(isListablePage);
  if (tab === "skills") return [];
  if (tab === "favorites") {
    const favorites = new Set(favoriteIds);
    return live.filter((page) => favorites.has(page._id));
  }
  if (tab === "recents") {
    const byId = new Map(live.map((page) => [page._id, page]));
    const seen = new Set<string>();
    const out: PageEntry[] = [];
    for (const recent of recents) {
      const page = byId.get(recent.id);
      if (!page || seen.has(page._id)) continue;
      seen.add(page._id);
      out.push(page);
    }
    return out;
  }
  if (tab === "shared") return live.filter(isSharedPage);
  return live.filter((page) => !isSharedPage(page) && isOwnedBy(page, userId));
}

/** Date parse that treats a missing/invalid timestamp as "never". */
function timeOf(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Sort one sibling list. Ties keep the incoming order so Recents stays newest-first. */
export function sortPages(
  pages: readonly PageEntry[],
  sort: LibrarySort,
  visited: ReadonlyMap<string, number>,
): PageEntry[] {
  return [...pages].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    if (sort === "visited") {
      const delta = (visited.get(b._id) ?? 0) - (visited.get(a._id) ?? 0);
      return delta || a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    }
    return timeOf(b.updatedAt) - timeOf(a.updatedAt) || a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

/** Build the visible tree: pages stay under their parent when the parent is in
 *  the same list, otherwise they become roots. Each level is sorted the same way. */
export function buildTree(
  pages: readonly PageEntry[],
  sort: LibrarySort,
  visited: ReadonlyMap<string, number>,
): LibraryNode[] {
  const sorted = sortPages(pages, sort, visited);
  const ids = new Set(sorted.map((page) => page._id));
  const childrenOf = new Map<string | null, PageEntry[]>();
  for (const page of sorted) {
    const parent = page.parentPageId && ids.has(page.parentPageId) ? page.parentPageId : null;
    const bucket = childrenOf.get(parent);
    if (bucket) bucket.push(page);
    else childrenOf.set(parent, [page]);
  }
  const emitted = new Set<string>();
  const nodesFor = (parent: string | null, depth: number): LibraryNode[] => {
    const bucket = childrenOf.get(parent) ?? [];
    const nodes: LibraryNode[] = [];
    for (const page of bucket) {
      if (emitted.has(page._id)) continue;
      emitted.add(page._id);
      nodes.push({ page, depth, children: nodesFor(page._id, depth + 1) });
    }
    return nodes;
  };
  return nodesFor(null, 0);
}

/** Flatten only what the user expanded: a collapsed subtree renders no rows. */
export function visibleRows(nodes: readonly LibraryNode[], expanded: ReadonlySet<string>): LibraryRow[] {
  const rows: LibraryRow[] = [];
  const walk = (level: readonly LibraryNode[]) => {
    for (const node of level) {
      rows.push({ page: node.page, depth: node.depth, hasChildren: node.children.length > 0 });
      if (node.children.length > 0 && expanded.has(node.page._id)) walk(node.children);
    }
  };
  walk(nodes);
  return rows;
}

/** Case-insensitive title filter for the header's search box. */
export function filterByTitle(pages: readonly PageEntry[], query: string): PageEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...pages];
  return pages.filter((page) => page.title.toLowerCase().includes(needle));
}

/** The display name behind an owner id, or null when the app knows no name. */
export function ownerName(ownerId: string | null | undefined, names: ReadonlyMap<string, string>): string | null {
  if (!ownerId) return null;
  const name = names.get(ownerId) ?? names.get(ownerId.toLowerCase());
  return name?.trim() || null;
}

/** Store tab ids survive old/unknown localStorage values by falling back to Recents. */
export function parseLibraryTab(value: string | null | undefined): LibraryTab {
  return LIBRARY_TABS.includes(value as LibraryTab) ? (value as LibraryTab) : "recents";
}
