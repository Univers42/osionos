/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   hydratePages.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * READ path: the BaaS (osionos_pages, via the bridge) is the SOURCE OF TRUTH for pages;
 * the page store (zustand + localStorage) is a cache. On load we pull the viewer's pages
 * for every accessible workspace and restore/refresh them so a page survives a cache
 * clear or shows up on a fresh device. Owner/visibility scoping is enforced by the bridge.
 *
 * Merge policy = last-write-wins by `updatedAt`: ADD pages missing locally; UPDATE a
 * local page only when the server copy is strictly newer (so a local edit still pending
 * in the outbox is never clobbered). We SEED the outbox ledger — atomically, from the
 * post-merge value captured inside the state update — for every page the server copy was
 * taken for, so a freshly-hydrated page is not pointlessly re-published; we never seed a
 * page the local copy won (it may carry a pending edit that still must be sent).
 */

import { usePageStore } from "@/store/usePageStore";
import { derivePageState, savePagesCache } from "@/store/pageStore.helpers";
import { api, getActivePageJwt } from "@/shared/api/client";
import { getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { loadLedger, saveLedger } from "@/shared/sync/outboxLedger";
import { PAGE_OUTBOX_KEY, pageStamp } from "./pageStamp";
import type { PageEntry } from "@/entities/page";

/** Merge one server page (O(1) via the index map); returns the post-merge page when the
 *  SERVER copy was taken (added or strictly newer) so it can be seeded, else null. */
function mergePage(bucket: PageEntry[], index: Map<string, number>, incoming: PageEntry): PageEntry | null {
  const at = index.get(incoming._id);
  if (at === undefined) {
    index.set(incoming._id, bucket.length);
    bucket.push(incoming);
    return incoming;
  }
  if ((incoming.updatedAt ?? "") > (bucket[at].updatedAt ?? "")) {
    const merged = { ...bucket[at], ...incoming, content: incoming.content ?? bucket[at].content };
    bucket[at] = merged;
    return merged;
  }
  return null;
}

/** Mark just-hydrated (server-won) pages as already-synced in the outbox ledger. */
function seedLedger(seeds: Array<[string, string]>): void {
  const ledger = loadLedger(PAGE_OUTBOX_KEY);
  for (const [id, stamp] of seeds) ledger[id] = stamp;
  saveLedger(PAGE_OUTBOX_KEY, ledger);
}

/** Merge a workspace's server pages into the store (LWW) + seed the ledger. # changed. */
function mergeWorkspace(workspaceId: string, rows: PageEntry[]): number {
  const seeds: Array<[string, string]> = [];
  usePageStore.setState((state) => {
    const pages: Record<string, PageEntry[]> = { ...state.pages };
    const bucket = pages[workspaceId] ? [...pages[workspaceId]] : [];
    const index = new Map(bucket.map((page, at) => [page._id, at] as const));
    for (const row of rows) {
      const merged = mergePage(bucket, index, row);
      if (merged) seeds.push([merged._id, pageStamp(merged)]); // capture stamp atomically
    }
    pages[workspaceId] = bucket;
    if (seeds.length > 0) savePagesCache(pages, workspaceId);
    return derivePageState(pages, state.pageIdsByWorkspace);
  });
  if (seeds.length > 0) seedLedger(seeds);
  return seeds.length;
}

/** Pull one workspace's pages from the BaaS (via the bridge) and merge them in. */
async function hydrateWorkspace(workspaceId: string, jwt: string): Promise<number> {
  const rows = await api.get<PageEntry[]>(`/api/pages/all?workspaceId=${encodeURIComponent(workspaceId)}`, jwt);
  return Array.isArray(rows) ? mergeWorkspace(workspaceId, rows) : 0;
}

/** Restore the viewer's pages from the BaaS for every accessible workspace (LWW). */
export async function hydratePagesFromBaas(): Promise<number> {
  const jwt = getActivePageJwt();
  const context = getCurrentPageAccessContext();
  if (!jwt || !context) return 0;
  let changed = 0;
  for (const workspaceId of context.workspaceIds) {
    try {
      changed += await hydrateWorkspace(workspaceId, jwt);
    } catch {
      // offline / transient — the outbox + the next hydrate reconcile; never block load.
    }
  }
  return changed;
}
