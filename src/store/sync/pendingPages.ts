/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pendingPages.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Page edits the server has not confirmed, kept across a reload under their own small key. They
// used to live only in the page cache, which holds every page of every workspace with its content
// and shares one localStorage quota (~2.6M characters in Chrome) with the database state and the
// outbox ledger. On the live demo origin that quota was 96% full: the cache's writes failed
// silently, it stopped at 312 of ~3 180 pages, and an unconfirmed edit lived only in memory — a
// reload during a bridge outage, or of a page over keepalive's 64 KB, lost it (2026-10-14).
// Written before the cache. On a full origin the page caches go first (the hydrate rebuilds them
// from the server); never the outbox ledger, nor the database state, which holds databases not yet
// pushed (objectDatabaseBridgeSync keeps a failed push dirty).
// Ponytail: an edit made since the last outbox flush (800 ms debounce, 250 ms draft) reaches this
// key at pagehide, so a tab killed hard (crash, OOM) loses it. Edits that no longer fit even here
// (an outage while hundreds of files are cloned) are warned about once, and the browser asks
// before the tab is left; a tab killed hard then loses them all.

import type { PageEntry } from "@/entities/page";
import { evictPageCaches } from "@/store/pageStore.helpers";

/** Outside the page cache's `osio:pages:` prefix, which its loader reads as workspaces. */
export const PENDING_PAGES_KEY = "osio:pending-pages.v1";

export type PendingStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

function browserStorage(): PendingStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function trySet(storage: PendingStorage, text: string): boolean {
  try {
    storage.setItem(PENDING_PAGES_KEY, text);
    return true;
  } catch {
    return false;
  }
}

function byWorkspace(pages: readonly PageEntry[]): Record<string, PageEntry[]> {
  const grouped: Record<string, PageEntry[]> = {};
  for (const page of pages) (grouped[page.workspaceId] ??= []).push(page);
  return grouped;
}

/** Puts `pages` (every page whose edit is unconfirmed; none clears the key) on disk, the page
 *  caches evicted when the origin is full. False when they could not be kept. O(bytes). */
export function keepPendingPages(pages: readonly PageEntry[], storage: PendingStorage | null = browserStorage()): boolean {
  if (storage === null) return pages.length === 0;
  if (pages.length === 0) {
    try {
      storage.removeItem(PENDING_PAGES_KEY);
    } catch {
      // storage unavailable: nothing was kept to clear
    }
    return true;
  }
  const text = JSON.stringify(byWorkspace(pages));
  if (trySet(storage, text)) return true;
  evictPageCaches(storage);
  return trySet(storage, text);
}

/** `keepPendingPages` that calls `warn` the first time pages cannot be kept, never again: each
 *  outbox flush keeps them, and a full origin would otherwise warn every 800 ms. */
export function createPendingKeeper(warn: () => void, storage: PendingStorage | null = browserStorage()) {
  let warned = false;
  return (pages: readonly PageEntry[]): boolean => {
    const kept = keepPendingPages(pages, storage);
    if (!kept && !warned) {
      warned = true;
      warn();
    }
    return kept;
  };
}

function readPending(storage: PendingStorage | null): Record<string, PageEntry[]> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(PENDING_PAGES_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const kept: Record<string, PageEntry[]> = {};
    for (const [workspaceId, pages] of Object.entries(parsed)) {
      if (!Array.isArray(pages)) continue;
      kept[workspaceId] = pages.filter((page): page is PageEntry => typeof page?._id === "string");
    }
    return kept;
  } catch {
    return {};
  }
}

/** The cached pages with every kept unconfirmed page in place of its cached copy (or added). The
 *  hydrate then keeps the local copy, its stamp differing from the outbox ledger, and the outbox
 *  publishes it. O(pages). */
export function withPendingPages(
  cache: Record<string, PageEntry[]>,
  storage: PendingStorage | null = browserStorage(),
): Record<string, PageEntry[]> {
  const kept = readPending(storage);
  if (Object.keys(kept).length === 0) return cache;
  const pages = { ...cache };
  for (const [workspaceId, pending] of Object.entries(kept)) {
    const list = (pages[workspaceId] ?? []).slice();
    const at = new Map(list.map((page, index) => [page._id, index] as const));
    for (const page of pending) {
      const index = at.get(page._id);
      if (index === undefined) list.push(page);
      else list[index] = page;
    }
    pages[workspaceId] = list;
  }
  return pages;
}

/**
 * While unconfirmed edits exist, `beforeunload` keeps them first and asks the browser to confirm
 * leaving only when they could not be kept: a reload then cannot drop them silently, whether
 * the keepalive PATCH is offline, refused or over 64 KB. Armed by the outbox when the store
 * changes, disarmed once nothing is unconfirmed (an armed page is kept out of the bfcache).
 */
export function createUnloadGuard(target: Pick<EventTarget, "addEventListener" | "removeEventListener">, keepNow: () => boolean) {
  let armed = false;
  const onBeforeUnload = (event: Event): void => {
    if (keepNow()) return;
    event.preventDefault();
    (event as BeforeUnloadEvent).returnValue = ""; // older Chrome asks only when this is set
  };
  return {
    arm(): void {
      if (armed) return;
      armed = true;
      target.addEventListener("beforeunload", onBeforeUnload);
    },
    disarm(): void {
      if (!armed) return;
      armed = false;
      target.removeEventListener("beforeunload", onBeforeUnload);
    },
  };
}
