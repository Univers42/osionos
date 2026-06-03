/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageSync.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Two-way sync between the osionos page store and the BaaS osionos_pages collection (the
 * SOURCE OF TRUTH for pages) THROUGH the bridge. On mount it HYDRATES — pulls the viewer's
 * pages (LWW) so they survive a cache clear / fresh device — then keeps an OUTBOX: any
 * created / edited / moved page is upserted through the bridge with retry, and the ledger
 * advances ONLY on confirm, so offline edits survive a reload and flush on reconnect (this
 * replaces the old fire-and-forget PATCH that dropped edits whenever a write failed).
 *
 * Only pages the viewer may EDIT are published (defence in depth — the store already gates
 * mutations the same way). Publish-only: archive/delete are handled by the page actions; a
 * page that left the desired set is just forgotten from the ledger (no network). The
 * subscription is gated to page-relevant store changes; the ledger is reloaded per flush so
 * hydrate's seeds are honoured. No-op without a bridge. Mount once near the app root.
 */

import { useEffect } from "react";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { API_BASE } from "@/shared/api/client";
import { canEditPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { buildDesiredPages, PAGE_OUTBOX_KEY } from "./pageStamp";
import { publishPage } from "./pageOutbox";
import { hydratePagesFromBaas } from "./hydratePages";
import { computeSyncActions, loadLedger, saveLedger } from "@/shared/sync/outboxLedger";

const DEBOUNCE_MS = 800;
/** While the server is unreachable, retry the pending writes on this cadence. */
const RETRY_MS = 15000;

export function usePageSync(): void {
  const activeUserId = useUserStore((store) => store.activeUserId);

  // HYDRATE from the BaaS (source of truth) once the signed-in user is known. Reactive on
  // activeUserId because auth resolves AFTER mount; merging never clobbers, so it is safe
  // to re-run on user switch.
  useEffect(() => {
    if (!API_BASE || !activeUserId) return;
    hydratePagesFromBaas().catch(() => undefined);
  }, [activeUserId]);

  useEffect(() => {
    if (!API_BASE) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let flushing = false;
    let rerun = false;
    let disposed = false;

    const scheduleRetry = () => {
      if (!retry && !disposed) retry = setTimeout(() => { retry = null; void flush(); }, RETRY_MS);
    };
    const clearRetry = () => { if (retry) { clearTimeout(retry); retry = null; } };

    const flush = async (): Promise<void> => {
      if (flushing) { rerun = true; return; } // serialize: never two flushes at once
      flushing = true;
      try {
        const ledger = loadLedger(PAGE_OUTBOX_KEY); // reload so hydrate seeds are honoured
        const context = getCurrentPageAccessContext();
        const { desired, payloads } = buildDesiredPages(
          usePageStore.getState().pages,
          (page) => !!context && canEditPage(page, context), // never publish a non-editable page
        );
        const { toPublish, toUnpublish } = computeSyncActions(desired, ledger);
        let failed = false;
        for (const id of toPublish) {
          const page = payloads.get(id);
          const stamp = desired.get(id);
          if (!page || stamp === undefined) continue;
          const result = await publishPage(page);
          if (result === "ok") ledger[id] = stamp; // advance ONLY on confirm
          else if (result === "gone") delete ledger[id]; // deleted/unowned → forget it
          else failed = true; // transient → leave pending, retry
        }
        for (const id of toUnpublish) delete ledger[id]; // left desired set → forget (no network)
        saveLedger(PAGE_OUTBOX_KEY, ledger);
        if (failed) scheduleRetry(); else clearRetry();
      } finally {
        flushing = false;
        if (rerun && !disposed) { rerun = false; void flush(); }
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), DEBOUNCE_MS);
    };

    // Only page edits matter; ignore activePage / recents / loadingIds churn (their
    // mutations leave `pages` and `pageRevisions` referentially unchanged).
    const unsubscribe = usePageStore.subscribe((state, previous) => {
      if (state.pages === previous.pages && state.pageRevisions === previous.pageRevisions) return;
      schedule();
    });
    schedule(); // publish whatever is already pending on mount
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      clearRetry();
      unsubscribe();
    };
  }, []);
}
