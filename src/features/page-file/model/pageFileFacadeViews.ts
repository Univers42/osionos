/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileFacadeViews.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { pageIndexFor } from "./pageIndexCache";
import { buildTables, type Tables } from "./pageFileFacadeTables";
import type { PageEntry } from "@/entities/page";
import type { PageFileStore } from "./pageFileFacade";
import type { PageIndex } from "./pageIndex";

/** The `access()` answer when no session exists — the WeakMap key for "none". */
const NO_ACCESS: object = {};

/** The readable pages of one source array under one access snapshot. */
interface Slice {
  readonly pages: readonly PageEntry[];
  byId: Map<string, PageEntry> | null;
}

/** source pages array → access snapshot → that pair's readable slice. */
type SliceCache = WeakMap<readonly PageEntry[], WeakMap<object, Slice>>;

export interface ReadableViews {
  indexOf(): PageIndex;
  tablesFor(): Tables;
  pageById(id: string): PageEntry | undefined;
}

// Memoised per (source array, access snapshot): a NEW access object drops the slice
// even when the user store kept the same pages array. Ponytail: the key is the access
// object's identity, so an access/session object mutated IN PLACE (same reference,
// grants changed) keeps serving the stale slice — pages revoked that way stay
// readable until the pages array changes. Escape hatch: have `access()` return a
// fresh snapshot per change. O(n) per new pair, O(1) on a hit.
function sliceOf(deps: PageFileStore, cache: SliceCache): Slice {
  const source = deps.pages();
  const access = deps.access() ?? NO_ACCESS;
  let byAccess = cache.get(source);
  if (byAccess === undefined) {
    byAccess = new WeakMap();
    cache.set(source, byAccess);
  }
  const cached = byAccess.get(access);
  if (cached) return cached;
  const pages: PageEntry[] = [];
  for (const page of source) if (deps.canRead(page)) pages.push(page);
  const slice: Slice = { pages, byId: null };
  byAccess.set(access, slice);
  return slice;
}

/** One page by id off the readable slice, lazily indexed. O(1) after the first map. */
function pageById(deps: PageFileStore, cache: SliceCache, id: string): PageEntry | undefined {
  const slice = sliceOf(deps, cache);
  if (slice.byId === null) slice.byId = new Map(slice.pages.map((p) => [p._id, p]));
  return slice.byId.get(id);
}

function indexOf(deps: PageFileStore, cache: SliceCache): PageIndex {
  return pageIndexFor(`${deps.workspaceId}#readable`, sliceOf(deps, cache).pages);
}

// Ponytail: timestamps are read at THIS build and never refreshed while the index
// object lives: a body edit (updatedAt is not an index field) leaves stat() on the
// pre-edit mtime until a new index object.
function tablesFor(deps: PageFileStore, cache: SliceCache, built: WeakMap<PageIndex, Tables>): Tables {
  const index = indexOf(deps, cache);
  const cached = built.get(index);
  if (cached) return cached;
  const tables = buildTables(index, sliceOf(deps, cache).pages);
  built.set(index, tables);
  return tables;
}

/**
 * The memoised views of the store the facade reads through. Tables are built once per
 * PageIndex object and the index survives a body edit (pageIndexFor), so a keystroke
 * costs one O(n) readable filter plus the index's O(n) shape scan.
 */
export function createReadableViews(deps: PageFileStore): ReadableViews {
  const slices: SliceCache = new WeakMap();
  const tablesOf = new WeakMap<PageIndex, Tables>();
  return {
    indexOf: () => indexOf(deps, slices),
    tablesFor: () => tablesFor(deps, slices, tablesOf),
    pageById: (id) => pageById(deps, slices, id),
  };
}
