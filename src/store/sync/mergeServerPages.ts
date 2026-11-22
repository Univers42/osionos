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
// takes the server body on its next content fetch (settleFetchedPage). A content write is
// immune once both copies carry a contentVersion (#82); a metadata-only write is not.

import type { SyncLedger } from "@osionos/outbox-ledger";
import type { PageEntry } from "@/entities/page";
import { readCoverFields, type CoverFields } from "@/entities/page/model/coverFields";
import { isPersistedPageId } from "@/store/pageStore.helpers";
import { mergePageContent } from "./mergePageContent";
import { baseFor, type PageBase } from "./pageBase";
import { pageStamp } from "./pageStamp";

/** The local copy holds nothing the server lacks: its stamp is the last one the server confirmed.
 *  A page this viewer cannot publish never holds anything to lose. O(content) for the stamp hash. */
export function isPageClean(page: PageEntry, ledger: SyncLedger, canPublish: boolean): boolean {
  return !canPublish || ledger[page._id] === pageStamp(page);
}

// A greater content version is newer whatever the clocks say (#82): the server bumps it only
// when the content changed, so it is immune to the skew the updatedAt comparison has.
const isNewerVersion = (server: PageEntry, local: PageEntry) =>
  typeof server.contentVersion === "number" && typeof local.contentVersion === "number"
  && server.contentVersion > local.contentVersion;
const isNewer = (server: PageEntry, local: PageEntry) =>
  (server.updatedAt ?? "") > (local.updatedAt ?? "") || isNewerVersion(server, local);

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
 * The cover layout a fetch takes. The size follows the page (it is in the stamp). coverPosition is
 * outside the stamp, so "clean" says nothing about it: only a newer copy, or a page that has none,
 * gives it (groot ADR 0065 CV4). O(1).
 */
function fetchedCoverFields(current: PageEntry, server: PageEntry, takeServer: boolean): CoverFields {
  if (!takeServer) return {};
  const { coverPosition, ...size } = readCoverFields(server);
  const takesPosition = isNewer(server, current) || current.coverPosition === undefined;
  return takesPosition && coverPosition !== undefined ? { ...size, coverPosition } : size;
}

// What a content fetch that is not stale (isStaleAnswer) does. "take": nothing unpublished
// (or no body loaded), the server's copy stands. "merge": the server moved past the base under
// unpublished keystrokes, so base, local and server merge three ways and neither side is
// lost. "keep": the server
// holds nothing past the base, went back behind it, or the base content is unknown (a
// reload): the local body stays, and a later 409 merges or copies it (C25), never a blind
// overwrite (AM15).
type FetchPlan = "take" | "merge" | "keep";

// Caveat: the order of two copies is read from content versions only. Against a bridge
// without the version column (both null) a fetch that left before the client's own save
// landed looks fresh, and is taken or merged as one: the legacy last-writer-wins case AM16
// retires. O(1).
function versionOrder(server: PageEntry, base: PageBase): number | null {
  if (typeof server.contentVersion !== "number" || typeof base.version !== "number") return null;
  return Math.sign(server.contentVersion - base.version);
}

// Stale = older than the base, on a page with a body to protect and a base learned in this
// session: a GET that left before the client's own save landed, or two refreshes resolving out
// of order. A page with no body loads whatever comes (boot race, AM15 r2 P4); a base that is
// a version alone (after a reload) yields to the server (a database restored from a backup).
// Caveat: a restore that lands DURING a session, under a base learned in it, looks exactly like
// an out-of-order answer (both are "older than the base") and is ignored until a reload drops
// the base content. Taking it instead would let every out-of-order answer revert the editor
// (r1 P1). Ignoring it drops no keystroke: the next save carries the old version, the bridge's
// version=eq precondition refuses it, and the 409 path merges against the restored copy.
// Escape hatch: the version the GET was sent at would tell the two apart.
function isStaleAnswer(current: PageEntry, server: PageEntry, base: PageBase): boolean {
  return current.content !== undefined && base.content !== null && versionOrder(server, base) === -1;
}

function fetchPlan(current: PageEntry, server: PageEntry, base: PageBase, clean: boolean): FetchPlan {
  if (clean || current.content === undefined) return "take";
  const order = versionOrder(server, base);
  if (order === 0 || order === -1 || server.content === undefined || base.content === null) return "keep";
  return "merge";
}

// The base a fetch leaves, or null when it stays: it moves to the server's copy only once the
// body holds that copy (taken or merged), never over unpublished keystrokes (AM15). An answer
// at the base's own version IS the base content: a reload lost it, this learns it back.
function nextBase(plan: FetchPlan, server: PageEntry, base: PageBase): PageBase | null {
  if (plan !== "keep") return { version: server.contentVersion ?? null, content: server.content ?? null };
  if (versionOrder(server, base) !== 0) return null;
  return { version: base.version, content: base.content ?? server.content ?? null };
}

function fetchedBody(current: PageEntry, server: PageEntry, base: PageBase, plan: FetchPlan) {
  if (plan === "take") return { content: server.content ?? current.content, conflicts: false };
  if (plan !== "merge") return { content: current.content, conflicts: false };
  const merged = mergePageContent(base.content, current.content ?? [], server.content ?? []);
  return { content: merged.content, conflicts: merged.status === "conflicts" };
}

export interface FetchedPage {
  /** The page to store, or null when the fetch changes nothing. */
  resolved: { page: PageEntry; recordSynced: boolean } | null;
  /** The base to remember, or null when it stays where it is. */
  base: PageBase | null;
  /** The merge kept both variants of a block both sides changed: the reader must be told. */
  conflicts: boolean;
}

/**
 * Everything one content fetch decides, decided once: the page, the base, and whether the
 * merge kept a conflict. A clean page (nothing unpublished) takes the server copy whatever the
 * timestamps say (except coverPosition, fetchedCoverFields): that also heals a cache an older
 * merge left as {newer updatedAt, older body}. A stale answer (isStaleAnswer) changes nothing.
 * A page with an unpublished change takes the server's metadata only when the server copy is
 * newer, and its body is the 3-way merge of base, local and server: the keystrokes and the
 * server's blocks both stay. `recordSynced`: the page was clean, so its new stamp is the
 * server's and the outbox must not PATCH that body back. Called on the store's CURRENT page
 * (after the await): an edit typed during the request makes it unclean, and it still
 * publishes. O(content), plus the merge when the page holds unpublished keystrokes.
 */
export function settleFetchedPage(current: PageEntry, server: PageEntry, ledger: SyncLedger, canPublish: boolean): FetchedPage {
  // Read BEFORE anything moves it: it moves to the server's copy only through `base` below.
  const base = baseFor(current);
  if (isStaleAnswer(current, server, base)) return { resolved: null, base: null, conflicts: false };
  const clean = isPageClean(current, ledger, canPublish);
  const plan = fetchPlan(current, server, base, clean);
  const body = fetchedBody(current, server, base, plan);
  const resolved = fetchedPage(current, server, body.content, clean, canPublish);
  return { resolved, base: nextBase(plan, server, base), conflicts: resolved !== null && body.conflicts };
}

function fetchedPage(
  current: PageEntry,
  server: PageEntry,
  content: PageEntry["content"],
  clean: boolean,
  canPublish: boolean,
): { page: PageEntry; recordSynced: boolean } | null {
  const takeServer = clean || isNewer(server, current);
  if (!takeServer && content === current.content) return null;
  const page: PageEntry = {
    ...current,
    content,
    title: takeServer ? (server.title ?? current.title) : current.title,
    icon: takeServer ? (server.icon ?? current.icon) : current.icon,
    cover: takeServer ? (server.cover ?? current.cover) : current.cover,
    ...fetchedCoverFields(current, server, takeServer),
    updatedAt: takeServer ? (server.updatedAt ?? current.updatedAt) : current.updatedAt,
  };
  // coverPosition is not in the stamp (pageStamp), so a page gaining one is compared here.
  const unchanged = pageStamp(page) === pageStamp(current) && page.coverPosition === current.coverPosition;
  if (unchanged) return null;
  return { page, recordSynced: canPublish && clean };
}
