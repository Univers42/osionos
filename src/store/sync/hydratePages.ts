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
 * Merge policy = `mergeServerPages` (additive: a hydrate never removes pages; a page the
 * outbox is RECOVERING keeps its local copy, see applyServerPages). We SEED the
 * outbox ledger — atomically, from the post-merge value captured inside the state update —
 * for every page the server copy was taken for, so a freshly-hydrated page is not
 * pointlessly re-published; we never seed a page the local copy won (it may carry a pending
 * edit that still must be sent).
 */

import { usePageStore } from "@/store/usePageStore";
import { api, getActivePageJwt } from "@/shared/api/client";
import { getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { applyServerPages } from "./applyServerPages";
import type { PageEntry } from "@/entities/page";

/** Pull one workspace's pages from the BaaS (via the bridge) and merge them in. */
async function hydrateWorkspace(workspaceId: string, jwt: string): Promise<number> {
  const rows = await api.get<PageEntry[]>(`/api/pages/all?workspaceId=${encodeURIComponent(workspaceId)}`, jwt);
  return Array.isArray(rows) ? applyServerPages(usePageStore.setState, workspaceId, rows, false) : 0;
}

/** Restore the viewer's pages from the BaaS for every accessible workspace (LWW). */
export async function hydratePagesFromBaas(): Promise<number> {
  const jwt = getActivePageJwt();
  const context = getCurrentPageAccessContext();
  if (!jwt || !context) return 0;
  // Hydrate every workspace in parallel; the api client's 6-slot limiter (shared/api/client)
  // bounds real concurrency, so N workspaces drain in ~ceil(N/6) waves instead of serially.
  // allSettled: one workspace's offline/transient failure must not abort the others — a
  // skipped workspace is reconciled by the outbox + the next hydrate; never block load.
  const results = await Promise.allSettled(
    context.workspaceIds.map((workspaceId) => hydrateWorkspace(workspaceId, jwt)),
  );
  let changed = 0;
  for (const result of results) {
    if (result.status === "fulfilled") changed += result.value;
  }
  return changed;
}
