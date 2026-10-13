/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageIndexCache.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

import { buildPageIndex, type PageIndex } from "./pageIndex";

// Pure: no store import.

interface CachedIndex {
  pages: readonly PageEntry[];
  index: PageIndex;
}

// Ponytail: one entry per workspace ever asked for, each pinning its pages array — a session
// that visits many workspaces (or logs out of one) keeps that many page arrays, block content
// included, alive until the module is unloaded. It never evicts, so the bound is "workspaces",
// not "pages", and nothing here shrinks it.
const cache = new Map<string, CachedIndex>();

/**
 * True when `next` yields the same index as `prev`: same length and, at every position, the same
 * object or the same five index fields. O(n), allocates nothing.
 * Ponytail: the comparison is positional — the same pages in a different order, or one page
 * moved between positions, reads as "changed" and rebuilds. Correct, only slower.
 */
export function sameIndexShape(prev: readonly PageEntry[], next: readonly PageEntry[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < next.length; i++) {
    const before = prev[i];
    const after = next[i];
    if (before === after || sameIndexFields(before, after)) continue;
    return false;
  }
  return true;
}

/**
 * The five fields buildPageIndex reads, so a page equal here would build an equal entry:
 * `_id`, `title`, `surface`, `archivedAt` (only its truthiness: any date reads as archived) and
 * `parentPageId` (null and undefined are the same group). O(1).
 */
function sameIndexFields(before: PageEntry, after: PageEntry): boolean {
  return (
    before._id === after._id &&
    before.title === after.title &&
    before.surface === after.surface &&
    Boolean(before.archivedAt) === Boolean(after.archivedAt) &&
    (before.parentPageId ?? null) === (after.parentPageId ?? null)
  );
}

/**
 * The index of one workspace's pages. Same array as last call → cached index, O(1). Different
 * array with the same shape → the SAME index object (consumers' memo deps stay stable), O(n),
 * and the new array becomes the cached one. Otherwise → buildPageIndex, O(n log n).
 */
export function pageIndexFor(workspaceId: string, pages: readonly PageEntry[]): PageIndex {
  const cached = cache.get(workspaceId);
  if (cached && cached.pages === pages) return cached.index;
  const index = cached !== undefined && sameIndexShape(cached.pages, pages) ? cached.index : buildPageIndex(pages);
  cache.set(workspaceId, { pages, index });
  return index;
}
