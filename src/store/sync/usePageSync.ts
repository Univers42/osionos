/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageSync.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
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
 *
 * One PATCH comes back in one of five results, each with its own rule (./pageFlush):
 *   "ok"       → written; advance the ledger. `ignored` lists the fields the bridge declined.
 *   "refused"  → 403: the viewer may not write the page; the edit is recovered, never dropped.
 *   "gone"     → 404: the page is gone server-side; the recovery evicts the local copy.
 *   "conflict" → 409: the server's copy moved; merge, re-send once, and keep going.
 *   "failed"   → transient (offline / 5xx / 429); leave pending and retry.
 */

import { useEffect, useRef } from "react";
import { usePageStore } from "@/store/usePageStore";
import { derivePageState, flushScheduledPagesCachePersist } from "@/store/pageStore.helpers";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { useUserStore } from "@/features/auth";
import { API_BASE } from "@/shared/api/client";
import { canEditPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { flushAllBlockDrafts } from "@/features/block-editor/model/blockDraftStore";
import { buildDesiredPages, PAGE_OUTBOX_KEY, saveOutboxLedger } from "./pageStamp";
import { publishPage, publishPageKeepalive } from "./pageOutbox";
import { publishOutboxPage, settleRecoveringMarks, type FlushDeps } from "./pageFlush";
import { pruneBases } from "./pageBase";
import { createPendingKeeper, createUnloadGuard } from "./pendingPages";
import { hydratePagesFromBaas } from "./hydratePages";
import { refusedEditDeps } from "./refusedEditDeps";
import { MAX_RECOVERIES_PER_FLUSH } from "./outboxRecovery";
import { computeSyncActions, loadLedger } from "@osionos/outbox-ledger";
import type { SyncLedger } from "@osionos/outbox-ledger";
import type { PageEntry } from "@/entities/page";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

const DEBOUNCE_MS = 800;
/** First retry delay when the server pushes back; doubles up to MAX_RETRY_MS. */
const RETRY_MS = 15000;
/** Cap on the exponential backoff so a recovered server is still picked up promptly. */
const MAX_RETRY_MS = 120000;

/**
 * The world the flush works on: the bridge, the store and the toast. Built once per
 * flush — the reads inside it happen when they are needed, not when it is built.
 */
function flushDeps(): FlushDeps {
  return {
    publish: (page) => publishPage(page),
    recovery: refusedEditDeps(),
    privateWorkspaceId: () => getCurrentPageAccessContext()?.privateWorkspaceIds[0] ?? null,
    notify: (notice) => {
      // A sticky notice never times out of sight (a lost edit is something the reader
      // must act on); the conflict merge is a plain notice — it blocks nothing.
      const { sticky, ...rest } = notice;
      useToastStore.getState().push(sticky ? { ...rest, durationMs: null } : rest);
    },
    applyContent: (pageId, content) => {
      // The store's own page update action: the editor re-renders what was saved.
      usePageStore.getState().updatePageContent(pageId, content);
      return usePageStore.getState().pageById(pageId) ?? null;
    },
    recordVersion: (pageId, version) => usePageStore.getState().setPageContentVersion(pageId, version),
  };
}

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

    // Unconfirmed edits go to their own key before any network await (pendingPages).
    const keep = createPendingKeeper(() => useToastStore.getState().push({
      kind: "error",
      title: "Browser storage is full",
      description: "Edits not yet saved to the server can't be kept across a reload. Keep this tab open until they sync.",
    }));
    const unconfirmedNow = (): PageEntry[] => {
      const context = getCurrentPageAccessContext();
      const { desired, payloads } = buildDesiredPages(
        usePageStore.getState().pages,
        (page) => !!context && canEditPage(page, context),
      );
      const { toPublish } = computeSyncActions(desired, loadLedger(PAGE_OUTBOX_KEY));
      return toPublish.flatMap((id) => payloads.get(id) ?? []);
    };
    // A draft typed in the last 250 ms is committed first, so the decision covers it.
    // Ponytail: before the hydrate settles there is no keep, no keepalive and no prompt (the
    // ledger is still empty, so every page would look unconfirmed), and the http-gate client has
    // no timeout: a hydrate that never answers keeps the tab in that window. A draft typed while
    // the guard is disarmed (nothing else unconfirmed) reaches the store only at pagehide, after
    // beforeunload has decided: it is kept then, but nobody is asked if that keep fails.
    const guard = createUnloadGuard(globalThis, () => {
      if (!hydratedRef.current) return true;
      flushAllBlockDrafts("unmount");
      return keep(unconfirmedNow());
    });

    const flush = async (): Promise<void> => {
      // Wait for hydrate to seed the ledger before the first publish (re-check shortly).
      if (!hydratedRef.current) { schedule(); return; }
      if (flushing) { rerun = true; return; } // serialize: never two flushes at once
      flushing = true;
      try {
        const ledger = loadLedger(PAGE_OUTBOX_KEY); // reload so hydrate seeds are honoured
        const context = getCurrentPageAccessContext();
        const { pages: pagesAtStart, pageRevisions: revisionsAtStart } = usePageStore.getState();
        const { desired, payloads } = buildDesiredPages(
          pagesAtStart,
          (page) => !!context && canEditPage(page, context), // never publish a non-editable page
        );
        const { toPublish, toUnpublish } = computeSyncActions(desired, ledger);
        keep(toPublish.flatMap((id) => payloads.get(id) ?? []));
        const confirmed: SyncLedger = {};
        const forgotten = new Set(toUnpublish); // left desired set → forget (no network)
        let failed = false;
        const budget = { left: MAX_RECOVERIES_PER_FLUSH };
        const settled: string[] = [];
        const deps = flushDeps();
        for (const id of toPublish) {
          const page = payloads.get(id);
          const stamp = desired.get(id);
          if (!page || stamp === undefined) continue;
          const step = await publishOutboxPage({ page, id, stamp, confirmed, forgotten, budget }, deps);
          if (step === "stop") { failed = true; break; }
          settled.push(id);
        }
        // Reloaded after the awaits: a content fetch or page-list merge may have recorded a
        // page as synced meanwhile, and writing back the copy loaded above would drop that
        // record and PATCH the server's own body back on the next flush.
        const latest = loadLedger(PAGE_OUTBOX_KEY);
        Object.assign(latest, confirmed);
        for (const id of forgotten) delete latest[id];
        saveOutboxLedger(PAGE_OUTBOX_KEY, latest);
        const done = new Set(settled);
        const left = toPublish.filter((id) => !done.has(id) && payloads.has(id));
        keep(left.flatMap((id) => payloads.get(id) ?? []));
        const now = usePageStore.getState();
        // The same two fields that arm it below: an edit made during the awaits keeps it armed.
        if (left.length === 0 && now.pages === pagesAtStart && now.pageRevisions === revisionsAtStart) guard.disarm();
        settleRecoveringMarks([...settled, ...toUnpublish]);
        // A page that left the store leaves its base behind: the version it was at is
        // nobody's business now.
        pruneBases(new Set(Object.values(now.pages).flatMap((list) => list.map((page) => page._id))));
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

    // UNLOAD seam — a reload can land inside the editor's 250ms draft commit
    // AND this outbox's 800ms debounce, so without this flush the last edits
    // die in memory. Ordered: (1) commit every dirty draft into the page store,
    // (2) keep every unconfirmed page under its own key, BEFORE the cache: a
    // full origin refused the cache silently and the edits were lost
    // (pendingPages), (3) force the store's localStorage cache to disk (its own
    // pagehide listener would also run, but AFTER ours is not guaranteed — the
    // explicit call is idempotent), (4) fire best-effort keepalive PATCHes for
    // every unconfirmed page. The ledger is NOT advanced — nothing can confirm
    // during unload — so the next session publishes them again, pinned to the
    // version they were made against: a server copy that moved meanwhile is a
    // conflict to merge, not an edit to overwrite.
    const flushOnUnload = () => {
      if (!hydratedRef.current) return; // pre-hydrate the ledger is empty — everything would spray
      flushAllBlockDrafts("unmount");
      const unconfirmed = unconfirmedNow();
      keep(unconfirmed);
      flushScheduledPagesCachePersist();
      for (const page of unconfirmed) publishPageKeepalive(page);
    };
    globalThis.addEventListener("pagehide", flushOnUnload);

    // Only page edits matter; ignore activePage / recents / loadingIds churn (their
    // mutations leave `pages` and `pageRevisions` referentially unchanged).
    const unsubscribe = usePageStore.subscribe((state, previous) => {
      if (state.pages === previous.pages && state.pageRevisions === previous.pageRevisions) return;
      guard.arm();
      schedule();
    });
    schedule(); // publish whatever is already pending on mount
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      clearRetry();
      guard.disarm();
      globalThis.removeEventListener("pagehide", flushOnUnload);
      unsubscribe();
    };
  }, []);
}
