/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   evictLocalPage.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Drop a page that no longer exists server-side (404) from the local cache: a stale
 * localStorage ghost the additive hydrate never prunes, re-fetched in a 404 loop and
 * still listed in the sidebar. PURE — the state math only, no store, no cache write —
 * so the same rule serves pageStore.actions.ts's content-fetch 404 branch and the
 * refused-edit recovery. Actions cannot import the store themselves: usePageStore
 * imports pageStore.actions, so that would close a cycle. Each caller therefore does
 * its own setState + savePagesCache around this.
 */

import { derivePageState } from "./pageStore.helpers";
import type { PageStore } from "@/entities/page";

/** The slice of the page store an eviction rewrites. */
export type EvictablePageState = Pick<PageStore, "pages" | "pageIdsByWorkspace" | "activePage">;

/** The evicted store slice: the rewritten buckets plus the tab that may go with them. */
export type EvictedPageState = Pick<PageStore, "pages" | "pageIdsByWorkspace" | "pagesIndex" | "activePage">;

/** The state an eviction of `pageId` from `workspaceId` produces. O(p) over the bucket. */
export function evictPageFromState(
  state: EvictablePageState,
  workspaceId: string,
  pageId: string,
): EvictedPageState {
  const bucket = state.pages[workspaceId] ?? [];
  const pages = { ...state.pages, [workspaceId]: bucket.filter((page) => page._id !== pageId) };
  return {
    ...derivePageState(pages, state),
    // An open tab pointing at a page that is gone must close: the editor would
    // otherwise re-fetch it forever and offer to edit something that is not there.
    activePage: state.activePage?.id === pageId ? null : state.activePage,
  };
}
