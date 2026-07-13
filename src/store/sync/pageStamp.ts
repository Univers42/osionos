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
 * folds every field the bridge persists (title, parent, workspace, visibility, icon,
 * cover, properties, content) + `updatedAt`, so any edit changes the stamp and a no-op
 * does not — the ledger diff stays minimal and the BaaS holds the full page record.
 *
 * CRITICAL: page block `content` is lazy-loaded (the tree arrives without it). When it
 * is NOT loaded the stamp uses a sentinel and the writer OMITS content — never sending
 * an empty array that would wipe the server's content.
 */

import type { PageEntry } from "@/entities/page";
import { isPersistedPageId } from "@/store/pageStore.helpers";

const HASH_SEED = 5381;
/** Stamp marker for a page whose content is not loaded (so it is never published). */
export const CONTENT_UNLOADED = "∅";
/** localStorage key for the page outbox ledger (shared by the writer + hydrate seeding). */
export const PAGE_OUTBOX_KEY = "osio:pages:outbox";

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
  return [
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
