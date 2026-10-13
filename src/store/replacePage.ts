/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   replacePage.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { derivePageState, updatePageInState, type PageDerivedState } from "./pageStore.helpers";

/**
 * Applies `updater` to one page: an O(1) lookup through `pagesIndex` and one copy of that
 * workspace's array. The id sequence is untouched, so `pageIdsByWorkspace` and `pagesIndex`
 * are reused as they are instead of re-derived — the edit costs a pointer copy per page, not
 * a scan plus an index rebuild (tests/bench/page-store-edit.bench.ts).
 *
 * Falls back to the scan + full derive when the index does not point at `pageId` or the
 * updater changes `_id`, so the result always equals
 * `derivePageState(updatePageInState(state.pages, pageId, updater), state)`.
 */
export function replacePage(
  state: PageDerivedState,
  pageId: string,
  updater: (page: PageEntry) => PageEntry,
): PageDerivedState {
  const location = state.pagesIndex[pageId];
  const list = location ? state.pages[location.workspaceId] : undefined;
  const page = location && list ? list[location.index] : undefined;
  if (!location || !list || page?._id !== pageId) {
    // The index is what misled us, so it is rebuilt rather than carried over.
    return derivePageState(updatePageInState(state.pages, pageId, updater), {
      pageIdsByWorkspace: state.pageIdsByWorkspace,
    });
  }

  const next = updater(page);
  const nextList = list.slice();
  nextList[location.index] = next;
  const pages = { ...state.pages, [location.workspaceId]: nextList };
  if (next._id !== pageId) return derivePageState(pages, state);
  return { pages, pageIdsByWorkspace: state.pageIdsByWorkspace, pagesIndex: state.pagesIndex };
}
