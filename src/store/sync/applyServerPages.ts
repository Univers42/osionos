/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   applyServerPages.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The one store write for a server page list: the boot hydrate (additive) and the sidebar's
// fetchPages (authoritative) both land here, so they cannot drift apart again.

import { loadLedger, saveLedger } from "@osionos/outbox-ledger";
import type { PageEntry, PageStore } from "@/entities/page";
import { flushAllBlockDrafts } from "@/features/block-editor/model/blockDraftStore";
import { canEditPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { derivePageState, savePagesCache } from "@/store/pageStore.helpers";
import { isPageClean, mergeServerPages } from "./mergeServerPages";
import { OUTBOX_RECOVERING_KEY, recoveringIds } from "./outboxRecovery";
import { PAGE_OUTBOX_KEY, pageStamp } from "./pageStamp";

type SetPageState = (update: (state: PageStore) => Partial<PageStore>) => void;

/**
 * Merges server rows into one workspace's pages and records the pages the server copy won
 * as synced, so they are not published back. Drafts are committed first: a block still being
 * typed is an unpublished change and keeps its page. A page the outbox is recovering keeps
 * its local copy: it holds the only copy of an edit the bridge refused. The recovering marks
 * are read once per call, not per row: the outbox writes them while a recovery runs, so a
 * per-row read could merge against a view of "who is protected" already stale by the next
 * row. Returns the number of pages taken.
 */
export function applyServerPages(
  setState: SetPageState,
  workspaceId: string,
  rows: PageEntry[],
  authoritative: boolean,
): number {
  flushAllBlockDrafts("idle");
  const ledger = loadLedger(PAGE_OUTBOX_KEY);
  const recovering = recoveringIds(loadLedger(OUTBOX_RECOVERING_KEY));
  const context = getCurrentPageAccessContext();
  const isClean = (page: PageEntry) =>
    isPageClean(page, ledger, context !== null && canEditPage(page, context));
  let taken = 0;
  setState((state) => {
    const merged = mergeServerPages(state.pages[workspaceId] ?? [], rows, { authoritative, isClean, recovering });
    const pages: Record<string, PageEntry[]> = { ...state.pages, [workspaceId]: merged.pages };
    // Stamped from the post-merge pages inside the update, so the ledger matches the store.
    for (const page of merged.serverWon) ledger[page._id] = pageStamp(page);
    taken = merged.serverWon.length;
    if (taken > 0 || authoritative) savePagesCache(pages, workspaceId);
    return derivePageState(pages, state);
  });
  if (taken > 0) saveLedger(PAGE_OUTBOX_KEY, ledger);
  return taken;
}
