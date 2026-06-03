/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useNoteGraphSync.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { isBaasGraphEnabled } from "../baas/baasGraphClient";
import { type PublishableNote, noteRowId, publishNote, unpublishNote } from "../baas/publishNote";
import { hydrateNotesFromBaas } from "./hydrateNotes";
import { isContentNote } from "./noteScope";
import { computeSyncActions, loadLedger, saveLedger } from "./noteSyncLedger";

/**
 * Two-way sync between the osionos page store and the BaaS notes collection (the
 * SOURCE OF TRUTH for notes). On mount it HYDRATES — pulls the viewer's own notes
 * from the BaaS and restores any missing locally, so notes survive a cache clear /
 * new device and the sidebar always matches the graph. Then it keeps publishing:
 * a created/edited note is upserted (idempotent), a deleted note is removed. The
 * server is authoritative, so there's no client-side prune — a row only leaves the
 * BaaS through an explicit delete. No-op unless the BaaS graph is configured.
 *
 * Mount once near the app root.
 */
const DEBOUNCE_MS = 1500;
/** While the server is unreachable, retry the pending writes on this cadence. */
const RETRY_MS = 15000;

/** Real, explicit tags from a note's properties (a tag/multi-select property). */
function noteTags(page: { properties?: { key: string; label: string; type?: string; value: unknown }[] }): string[] {
  const property = (page.properties ?? []).find(
    (entry) => Array.isArray(entry.value) && (/tag/i.test(entry.label) || /tag/i.test(entry.key) || /multi|tag/i.test(String(entry.type ?? ""))),
  );
  return property && Array.isArray(property.value) ? property.value.map(String) : [];
}

export function useNoteGraphSync(): void {
  const activeUserId = useUserStore((store) => store.activeUserId);

  // HYDRATE from the BaaS (source of truth) once the signed-in user is known.
  // Reactive on activeUserId because auth resolves AFTER mount — this restores the
  // viewer's notes that aren't in localStorage (cache clear / fresh device). Seeding
  // merges (never clobbers), so either order is safe; idempotent on user switch.
  useEffect(() => {
    if (!isBaasGraphEnabled() || !activeUserId) return;
    hydrateNotesFromBaas(activeUserId).catch(() => undefined);
  }, [activeUserId]);

  useEffect(() => {
    if (!isBaasGraphEnabled()) return undefined;
    // The ledger records what we've CONFIRMED-written to the BaaS (persisted), so a
    // write only "completes" once the server acknowledges it. While the server is
    // down, the diff stays pending and we retry on a timer — offline edits are never
    // lost and flush automatically on reconnect.
    const ledger = loadLedger();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let flushing = false;
    let rerun = false;
    let disposed = false;

    // Desired state from the page store: each content note's stamp + write payload.
    const buildDesired = (): { desired: Map<string, string>; payloads: Map<string, PublishableNote> } => {
      const notes = Object.values(usePageStore.getState().pages).flat().filter(isContentNote);
      const noteIds = new Set(notes.map((page) => page._id));
      const viewerId = useUserStore.getState().activeUserId || null;
      const desired = new Map<string, string>();
      const payloads = new Map<string, PublishableNote>();
      for (const page of notes) {
        const parentNoteId = page.parentPageId && noteIds.has(page.parentPageId) ? noteRowId(page.parentPageId) : null;
        const visibility = page.visibility ?? "private";
        const owner = page.ownerId ?? viewerId; // the note's real owner (per-user privacy)
        const tags = noteTags(page);
        desired.set(page._id, `${page.updatedAt ?? ""}|${parentNoteId ?? ""}|${visibility}|${owner ?? ""}|${tags.join(",")}`);
        payloads.set(page._id, {
          id: page._id, title: page.title, blocks: page.content, parentNoteId,
          parentPageId: page.parentPageId ?? null, visibility, tags, owner,
          workspaceId: page.workspaceId, updatedAt: page.updatedAt,
        });
      }
      return { desired, payloads };
    };

    const scheduleRetry = () => { if (!retry && !disposed) retry = setTimeout(() => { retry = null; void flush(); }, RETRY_MS); };
    const clearRetry = () => { if (retry) { clearTimeout(retry); retry = null; } };

    const flush = async (): Promise<void> => {
      if (flushing) { rerun = true; return; } // serialize: never two flushes at once
      flushing = true;
      try {
        const { desired, payloads } = buildDesired();
        const { toPublish, toUnpublish } = computeSyncActions(desired, ledger);
        let failed = false;
        for (const id of toPublish) {
          const note = payloads.get(id);
          const stamp = desired.get(id);
          if (!note || stamp === undefined) continue;
          try { await publishNote(note); ledger[id] = stamp; } // advance ONLY on success
          catch { failed = true; }
        }
        for (const id of toUnpublish) {
          try { await unpublishNote(id); delete ledger[id]; }
          catch { failed = true; }
        }
        saveLedger(ledger);
        if (failed) scheduleRetry(); else clearRetry(); // server down → keep retrying
      } finally {
        flushing = false;
        if (rerun && !disposed) { rerun = false; void flush(); }
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), DEBOUNCE_MS);
    };

    // Keep the BaaS in sync with subsequent edits/creates/deletes.
    const unsubscribe = usePageStore.subscribe(schedule);
    schedule(); // publish whatever notes already exist on mount
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      clearRetry();
      unsubscribe();
    };
  }, []);
}
