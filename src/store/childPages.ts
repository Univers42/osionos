/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   childPages.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A page's direct children in manual order. The workbench removed the sidebar
// page tree that owned this selector; the wiki's page list still needs it.

import type { PageEntry } from "@/entities/page";

/** Manual sibling order; null/undefined (e.g. brand-new pages) sort to the end. */
function pageOrder(page: Pick<PageEntry, "sortOrder">): number {
  return typeof page.sortOrder === "number" ? page.sortOrder : Number.MAX_SAFE_INTEGER;
}

/** Children index, built once per pages-array identity (the store replaces the
 *  array on every commit), so each caller of a commit is an O(1) lookup instead
 *  of a filter and sort over the whole workspace. */
const childrenIndexCache = new WeakMap<readonly PageEntry[], Map<string, string[]>>();
const NO_CHILDREN: string[] = [];

function childrenIndexOf(pages: readonly PageEntry[]): Map<string, string[]> {
  const cached = childrenIndexCache.get(pages);
  if (cached) return cached;
  const buckets = new Map<string, PageEntry[]>();
  for (const page of pages) {
    if (page.archivedAt || !page.parentPageId) continue;
    const bucket = buckets.get(page.parentPageId);
    if (bucket) bucket.push(page);
    else buckets.set(page.parentPageId, [page]);
  }
  const index = new Map<string, string[]>();
  for (const [parentId, children] of buckets) {
    index.set(parentId, children.sort((a, b) => pageOrder(a) - pageOrder(b)).map((page) => page._id));
  }
  childrenIndexCache.set(pages, index);
  return index;
}

/** Ids of the direct, non-archived children of a parent page, in manual order. */
export function selectChildPageIds(pages: readonly PageEntry[], parentPageId: string): string[] {
  return childrenIndexOf(pages).get(parentPageId) ?? NO_CHILDREN;
}
