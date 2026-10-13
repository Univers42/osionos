/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mergeServerPages.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The one rule for taking the server's copy of a page. The page list (GET /api/pages/all) is
// metadata only; content arrives per page (GET /api/pages/:id). Two drifted copies of this rule
// lost edits (review of 2026-10-13): the boot hydrate put a newer row's updatedAt on the cached
// OLD body, so the content fetch saw "not newer" and kept that body; the sidebar's fetchPages
// took every row without comparing timestamps, so the outbox PATCHed the old body back over
// another device's edit. And a content fetch changed the page's stamp, so the outbox PATCHed
// the server's own body back once per page opened.
// Ponytail: updatedAt mixes clocks — client edits carry the browser's (the bridge clamps it at
// +5 min), server-side writes (archive, publish, record notes) the server's. Within that skew
// last-write-wins can keep the local copy over a newer server-side write; a clean page still
// takes the server body on its next content fetch (resolveFetchedPage).

import type { SyncLedger } from "@osionos/outbox-ledger";
import type { PageEntry } from "@/entities/page";
import { isPersistedPageId } from "@/store/pageStore.helpers";
import { pageStamp } from "./pageStamp";

/** The local copy holds nothing the server lacks: its stamp is the last one the server confirmed.
 *  A page this viewer cannot publish never holds anything to lose. O(content) for the stamp hash. */
export function isPageClean(page: PageEntry, ledger: SyncLedger, canPublish: boolean): boolean {
  return !canPublish || ledger[page._id] === pageStamp(page);
}

const isNewer = (server: PageEntry, local: PageEntry) => (server.updatedAt ?? "") > (local.updatedAt ?? "");

/**
 * The page to keep for one server row, or null to keep the local copy. Last-write-wins on
 * updatedAt. A newer row without content may describe a newer body: a clean page drops its
 * cached body (content undefined, so it loads again before anyone can edit it); a page with an
 * unpublished change keeps its local copy whole, and that change publishes.
 * Ponytail: that last case is a true concurrent edit (a local change made offline, older than
 * the other device's) - the device that publishes last wins, not the newest edit. O(1).
 */
export function mergeServerPage(
  local: PageEntry | undefined,
  incoming: PageEntry,
  isClean: (page: PageEntry) => boolean,
): PageEntry | null {
  if (!local) return incoming;
  if (!isNewer(incoming, local)) return null;
  if (incoming.content !== undefined) return { ...local, ...incoming };
  if (!isClean(local)) return null;
  return { ...local, ...incoming, content: undefined };
}

export interface MergeServerPagesOptions {
  /** The rows are the server's whole list: a saved page missing from it was deleted there. */
  authoritative: boolean;
  isClean: (page: PageEntry) => boolean;
  /** Pages a refused-edit recovery still owns: their local copy wins whatever the row says. */
  recovering?: ReadonlySet<string>;
}

export interface MergedServerPages {
  pages: PageEntry[];
  /** Pages now holding the server's copy: their stamps are what the server has. */
  serverWon: PageEntry[];
}

/**
 * Merges one workspace's server rows into its local pages. Authoritative keeps the server's
 * order and drops saved pages it omits (a page never saved, with a temporary id, stays);
 * additive keeps the local order and appends new pages. An empty authoritative list changes
 * nothing: an outage that answers [] must not wipe the workspace. O(local + incoming).
 */
export function mergeServerPages(
  local: readonly PageEntry[],
  incoming: readonly PageEntry[],
  options: MergeServerPagesOptions,
): MergedServerPages {
  const serverWon: PageEntry[] = [];
  const localById = new Map(local.map((page) => [page._id, page] as const));
  const take = (row: PageEntry): PageEntry => {
    const current = localById.get(row._id);
    // A newer server copy would overwrite the only copy of the edit the bridge refused.
    if (current && options.recovering?.has(row._id)) return current;
    const merged = mergeServerPage(current, row, options.isClean);
    if (!merged) return current ?? row;
    serverWon.push(merged);
    return merged;
  };
  if (!options.authoritative) {
    const pages = local.slice();
    const at = new Map(local.map((page, index) => [page._id, index] as const));
    for (const row of incoming) {
      const index = at.get(row._id);
      if (index !== undefined) {
        pages[index] = take(row);
        continue;
      }
      at.set(row._id, pages.length);
      pages.push(take(row));
    }
    return { pages, serverWon };
  }
  if (incoming.length === 0) return { pages: local.slice(), serverWon };
  const pages = incoming.map(take);
  const incomingIds = new Set(incoming.map((row) => row._id));
  for (const page of local) {
    if (!incomingIds.has(page._id) && !isPersistedPageId(page._id)) pages.push(page);
  }
  return { pages, serverWon };
}

/**
 * The page after a content fetch, or null when the server copy changes nothing (no store write,
 * no cache write). A clean page (nothing unpublished) takes the server copy whatever the
 * timestamps say: that also heals a cache an older merge left as {newer updatedAt, older body}.
 * A page with an unpublished change takes it only when the server's updatedAt is newer.
 * `recordSynced`: the page was clean, so its new stamp is the server's and the outbox must not
 * PATCH that body back. Called on the store's CURRENT page (after the await): an edit typed
 * during the request makes it unclean, and it still publishes.
 * Ponytail: a keystroke typed into a cached body before this fetch returns makes the page
 * unclean, so a newer body from another device that kept the same updatedAt is not taken and
 * the edit publishes over it — the concurrent-edit case, as in mergeServerPage. O(content).
 */
export function resolveFetchedPage(
  current: PageEntry,
  server: PageEntry,
  ledger: SyncLedger,
  canPublish: boolean,
): { page: PageEntry; recordSynced: boolean } | null {
  const clean = isPageClean(current, ledger, canPublish);
  const takeServer = clean || isNewer(server, current);
  const fillsContent = current.content === undefined && server.content !== undefined;
  if (!takeServer && !fillsContent) return null;
  const page: PageEntry = {
    ...current,
    content: server.content ?? current.content,
    title: takeServer ? (server.title ?? current.title) : current.title,
    icon: takeServer ? (server.icon ?? current.icon) : current.icon,
    cover: takeServer ? (server.cover ?? current.cover) : current.cover,
    updatedAt: takeServer ? (server.updatedAt ?? current.updatedAt) : current.updatedAt,
  };
  if (pageStamp(page) === pageStamp(current)) return null;
  return { page, recordSynced: canPublish && clean };
}
