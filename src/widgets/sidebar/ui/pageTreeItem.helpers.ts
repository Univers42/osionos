/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageTreeItem.helpers.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { usePageStore, type PageEntry } from "@/store/usePageStore";
import type { DropMode } from "../model/sidebarTreeDnd";

type PageStoreState = ReturnType<typeof usePageStore.getState>;

/**
 * Classify a pointer position over a row: the top/bottom `edge` band (as a
 * fraction of row height) means "drop as a same-depth sibling" (before/after),
 * the middle means "drop inside as a child".
 */
export function computeDropMode(clientY: number, rect: DOMRect, edge = 0.3): DropMode {
  const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  if (ratio < edge) return "before";
  if (ratio > 1 - edge) return "after";
  return "inside";
}

/** A folder is an organizing container that never opens a page (see PageEntry.surface). */
export function isFolderEntry(page: Pick<PageEntry, "surface">): boolean {
  return page.surface === "folder";
}

/** A wiki is a governed knowledge root: groups children like a folder but opens onto its own index content. */
export function isWikiEntry(page: Pick<PageEntry, "surface">): boolean {
  return page.surface === "wiki";
}

/** Narrow projection of a page used for a sidebar tree row (kept stable for useShallow). */
export function selectPageTreeEntry(state: PageStoreState, pageId: string): PageEntry | null {
  const index = state.pagesIndex[pageId];
  const page = index ? state.pages[index.workspaceId]?.[index.index] : undefined;
  if (!page) return null;
  return {
    _id: page._id,
    title: page.title,
    icon: page.icon,
    workspaceId: page.workspaceId,
    ownerId: page.ownerId,
    visibility: page.visibility,
    collaborators: page.collaborators,
    parentPageId: page.parentPageId,
    databaseId: page.databaseId,
    archivedAt: page.archivedAt,
    surface: page.surface,
  };
}

/** Ids of the direct, non-archived children of a parent page (folder or file). */
/** Manual sibling order; null/undefined (e.g. brand-new pages) sort to the end. */
export function pageOrder(page: Pick<PageEntry, "sortOrder">): number {
  return typeof page.sortOrder === "number" ? page.sortOrder : Number.MAX_SAFE_INTEGER;
}

/** Comparator for sibling rows — manual sort_order. */
export function byPageOrder(a: Pick<PageEntry, "sortOrder">, b: Pick<PageEntry, "sortOrder">): number {
  return pageOrder(a) - pageOrder(b);
}

export function selectChildPageIds(pages: readonly PageEntry[], parentPageId: string): string[] {
  return pages
    .filter((page) => page.parentPageId === parentPageId && !page.archivedAt)
    .slice()
    .sort(byPageOrder)
    .map((page) => page._id);
}
