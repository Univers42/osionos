/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStamp.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure desired-state builder for the page OUTBOX. Turns the page store into a stable
 * `id → stamp` map (what must reach the server) plus the payloads to send. The stamp
 * folds `updatedAt`, title, parent, workspace, visibility, icon, cover, properties, the
 * template fields, content and a defined cover size, so an edit to any of them changes
 * the stamp and a no-op does not. It does NOT fold `coverPosition`, which the bridge
 * persists too: ledgers recorded without it would re-PATCH every positioned page (F7).
 * A reposition reaches the server through the `updatedAt` bump its edit makes
 * (`editPageHeader`, groot ADR 0065 CV2/CV5).
 *
 * CRITICAL: page block `content` is lazy-loaded (the tree arrives without it). When it
 * is NOT loaded the stamp uses a sentinel and the writer OMITS content — never sending
 * an empty array that would wipe the server's content.
 */

import type { PageEntry } from "@/entities/page";
import { saveLedger, type SyncLedger } from "@osionos/outbox-ledger";
import { evictPageCaches, isPersistedPageId, PAGE_OUTBOX_KEY } from "@/store/pageStore.helpers";

const HASH_SEED = 5381;
/** Stamp marker for a page whose content is not loaded (so it is never published). */
export const CONTENT_UNLOADED = "∅";
/** The page outbox ledger key (shared by the writer + hydrate seeding); defined beside the page
 *  cache's prefix, which it shares. */
export { PAGE_OUTBOX_KEY };

/** The outbox's ledger writes. On a full origin the rebuildable page caches make room first: a
 *  refused write left the ledger on disk stale, and after a reload a stale ledger republishes
 *  pages already confirmed (outbox-ledger saveLedger). */
export function saveOutboxLedger(key: string, ledger: SyncLedger): boolean {
  return saveLedger(key, ledger, () => void evictPageCaches());
}

/** Pages the outbox is responsible for: server-persisted and not archived. */
export function isPersistablePage(page: PageEntry): boolean {
  return isPersistedPageId(page._id) && !page.archivedAt;
}

/** Small stable hash (djb2) over a JSON-serialisable value — keeps stamps compact. */
function hashJson(value: unknown): string {
  const text = JSON.stringify(value ?? null);
  let hash = HASH_SEED;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ (text.codePointAt(index) ?? 0);
  }
  return (hash >>> 0).toString(36);
}

/** Content hashes cached by the content array's IDENTITY: the store replaces the
 *  array immutably only when that page is edited, so on each outbox flush (every
 *  ~800ms while an edit is pending, re-stamping ALL loaded pages) only the edited
 *  page pays the full-tree JSON.stringify — the rest hit the cache. */
const contentHashCache = new WeakMap<object, string>();

function hashContentCached(content: unknown): string {
  if (typeof content !== "object" || content === null) return hashJson(content);
  const cached = contentHashCache.get(content);
  if (cached !== undefined) return cached;
  const hash = hashJson(content);
  contentHashCache.set(content, hash);
  return hash;
}

/** The fields whose change must reach the server, folded into one stamp string. */
export function pageStamp(page: PageEntry): string {
  const content = page.content === undefined ? CONTENT_UNLOADED : hashContentCached(page.content);
  const stamp = [
    page.updatedAt ?? "",
    page.title ?? "",
    page.parentPageId ?? "",
    page.workspaceId ?? "",
    page.visibility ?? "private",
    page.icon ?? "",
    page.cover ?? "",
    hashJson(page.properties ?? []),
    page.isTemplate ? "1" : "0",
    page.isDefaultTemplate ? "1" : "0",
    hashJson(page.recurrence ?? null),
    content,
  ].join("|");
  return stamp + coverSizeStamp(page);
}

/** Empty for a page without a cover size, so its stamp stays what every ledger already holds
 *  (ADR 0064 PS26). coverPosition stays out: ledgers recorded without it would mark every
 *  repositioned page unpublished and re-PATCH it once. A reposition publishes through the
 *  updatedAt bump of its edit instead (ADR 0065 CV2). */
function coverSizeStamp(page: PageEntry): string {
  if (page.coverHeight === undefined && page.coverWidth === undefined) return "";
  return `|c${page.coverHeight ?? ""}/${page.coverWidth ?? ""}`;
}

/** Desired outbox state: id → stamp + payloads, limited to pages the viewer may publish. */
export function buildDesiredPages(
  pagesByWorkspace: Record<string, PageEntry[]>,
  canPublish: (page: PageEntry) => boolean = () => true,
): { desired: Map<string, string>; payloads: Map<string, PageEntry> } {
  const desired = new Map<string, string>();
  const payloads = new Map<string, PageEntry>();
  for (const list of Object.values(pagesByWorkspace)) {
    for (const page of list) {
      if (!isPersistablePage(page) || !canPublish(page)) continue;
      desired.set(page._id, pageStamp(page));
      payloads.set(page._id, page);
    }
  }
  return { desired, payloads };
}
