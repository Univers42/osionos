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

import { useEffect, useRef } from "react";
import { usePageStore } from "@/store/usePageStore";
import { derivePageState } from "@/store/pageStore.helpers";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { useUserStore } from "@/features/auth";
import { API_BASE } from "@/shared/api/client";
import { canEditPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { buildDesiredPages, PAGE_OUTBOX_KEY } from "./pageStamp";
import { publishPage } from "./pageOutbox";
import { hydratePagesFromBaas } from "./hydratePages";
import { computeSyncActions, loadLedger, saveLedger } from "@/shared/sync/outboxLedger";

const DEBOUNCE_MS = 800;
/** First retry delay when the server pushes back; doubles up to MAX_RETRY_MS. */
const RETRY_MS = 15000;
/** Cap on the exponential backoff so a recovered server is still picked up promptly. */
const MAX_RETRY_MS = 120000;

export function usePageSync(): void {
  const activeUserId = useUserStore((store) => store.activeUserId);
  const activeWorkspaceId = useUserStore((store) => store.activeWorkspace()?._id ?? "");
  // The outbox must not publish before HYDRATE seeds the ledger, otherwise every page just
  // pulled from the server looks "unsynced" and gets re-PATCHed — a needless write storm.
  const hydratedRef = useRef(false);
  const prevUserRef = useRef("");

  // HYDRATE from the BaaS (source of truth) once the signed-in user is known. Reactive on
  // activeUserId; on a real account SWITCH (not the first resolve) drop the previous
  // account's page tree + open tabs first, so the new account loads clean instead of
  // bleeding the old account's pages (the page cache is workspace-keyed, the layout global).
  useEffect(() => {
    if (!activeUserId) return;
    // Load THIS account's own tab layout (per-user keyed in layoutPersist) so neither a
    // fresh page load (prevUserRef is empty after a reload — the case that bled the
    // previous user's open tabs into a new account) nor an in-session switch inherits the
    // wrong tabs. Runs regardless of API_BASE so the offline/desktop edition still restores.
    const switched = prevUserRef.current !== "" && prevUserRef.current !== activeUserId;
    if (switched) usePageStore.setState({ ...derivePageState({}, {}), activePage: null });
    prevUserRef.current = activeUserId;
    // Per (user, workspace): a user OR workspace switch loads that identity's own slot.
    useWorkspaceLayout.getState().restoreForScope(activeUserId, activeWorkspaceId);
    if (!API_BASE) { hydratedRef.current = true; return; }
    hydratePagesFromBaas().catch(() => undefined).finally(() => { hydratedRef.current = true; });
  }, [activeUserId, activeWorkspaceId]);

  useEffect(() => {
    if (!API_BASE) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let flushing = false;
    let rerun = false;
    let disposed = false;
    let backoff = RETRY_MS;

    const scheduleRetry = () => {
      if (!retry && !disposed) retry = setTimeout(() => { retry = null; void flush(); }, backoff);
      backoff = Math.min(backoff * 2, MAX_RETRY_MS); // back off so we never hammer a throttled server
    };
    const clearRetry = () => { if (retry) { clearTimeout(retry); retry = null; } backoff = RETRY_MS; };

    const flush = async (): Promise<void> => {
      // Wait for hydrate to seed the ledger before the first publish (re-check shortly).
      if (!hydratedRef.current) { schedule(); return; }
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
          if (result === "ok") { ledger[id] = stamp; continue; } // advance ONLY on confirm
          if (result === "gone") { delete ledger[id]; continue; } // deleted/unowned → forget it
          // Transient (offline / 5xx / 429): STOP. Hammering the rest of the batch is what
          // turns a rate-limited server into a self-sustaining 429/502 storm. Back off and
          // resume next cycle — the pages already confirmed above stay advanced.
          failed = true;
          break;
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
