/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundView.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The live InboundView: what the planner reads of one workspace, answered from
// the page-file facade's own tables (so a path means here exactly what it means
// to the workbench), the sync ledger, the echo set and the executor's pending
// state. Store-free: the store arrives as the facade's injected PageFileStore.

import { DIR_SUFFIX, ownerOf, type Tables } from "@/features/page-file/model/pageFileFacadeTables";
import { fileOfEntry } from "@/features/page-file/model/pageIndex";
import { kindOfPage } from "@/features/page-file/model/pagePaths";
import { isEchoHash } from "./ideFsEcho";
import { syncedHashOf } from "./ideSyncEngine";

import type { PageFileStore } from "@/features/page-file/model/pageFileFacade";
import type { ReadableViews } from "@/features/page-file/model/pageFileFacadeViews";
import type { PageFacadeEntry } from "../vfs/pageProvider";
import type { InboundView, LivePage, ViewEntry } from "./inboundPlan";
import type { InboundPending } from "./inboundPending";
import type { LandedMemo } from "./inboundLanded";

export interface InboundViewDeps {
  workspaceId: string;
  store: PageFileStore;
  /** The SAME views the facade was built with (one slice cache, one table build). */
  views: ReadableViews;
  pending: InboundPending;
  landed: LandedMemo;
  /** The facade's readContent: the text the app would write for the page's own file. */
  readText(pageId: string): Promise<string>;
}

/** The planner's view plus what the executor alone needs. */
export interface ExecView extends InboundView {
  /** The page whose directory is exactly `dirPath`: a folder's own, or the one a page's
   *  children live in (`Roadmap` for `Roadmap.omd`) even before it has any. O(1). */
  ownerOfDir(dirPath: string): string | undefined;
  /** The children directory of a non-folder page that HAS children in the index. O(1). */
  childrenDirOf(pageId: string): string | undefined;
}

export function createInboundView(deps: InboundViewDeps): ExecView {
  const { views, pending, workspaceId } = deps;
  const live = (pageId: string): LivePage | undefined => livePage(deps, pageId);
  return {
    entryAt: (segments) => entryAt(deps, views.tablesFor(), segments),
    pageState(pageId) {
      const page = views.pageById(pageId);
      if (page === undefined) return undefined;
      return page.archivedAt ? { status: "archived" } : live(pageId);
    },
    hasOwnPending: (pageId) => pending.hasOwn(pageId),
    moveEvidence(pageId) {
      if (pending.hasOwn(pageId)) return { kind: "own" };
      const state = live(pageId);
      const dir = state === undefined ? undefined : pending.deepestDeletedDir(state.filePath);
      return dir === undefined ? undefined : { kind: "dir", dir: dir.path, role: dir.role, ownerId: dir.ownerId };
    },
    archivedByInbound: (pageId) => pending.archived(pageId),
    canDelete(pageId) {
      const page = views.pageById(pageId);
      return page !== undefined && deps.store.canEdit(page);
    },
    syncedHashOf: (path) => syncedHashOf(workspaceId, path),
    agreedPageHash: (path, inboundHash) => deps.landed.pageHashAt(path, inboundHash),
    isEchoHash: (hash) => isEchoHash(hash),
    childrenOf: (entryId) => childrenOf(views, entryId),
    localText: (pageId) => deps.readText(pageId),
    ownerOfDir: (dirPath) => views.indexOf().ownerOfDir(dirPath),
    childrenDirOf(pageId) {
      const state = live(pageId);
      if (state === undefined || state.isFolder || !views.tablesFor().byId.has(`${pageId}${DIR_SUFFIX}`)) return undefined;
      const page = views.pageById(pageId);
      return page !== undefined && kindOfPage(page) === "code" ? `${state.path}.d` : state.path.replace(/\.omd$/i, "");
    },
    pendingDeletedDirs: () => pending.deletedDirs().map((dir) => ({ dir: dir.path, role: dir.role, ownerId: dir.ownerId })),
  };
}

/** A live page reachable in the readable index, or undefined (archived, unknown,
 *  or under an archived/unreadable ancestor — no file of its own). O(1). */
function livePage(deps: InboundViewDeps, pageId: string): LivePage | undefined {
  const page = deps.views.pageById(pageId);
  const path = page === undefined || page.archivedAt ? undefined : deps.views.indexOf().pathForId(pageId);
  if (page === undefined || path === undefined) return undefined;
  const kind = kindOfPage(page);
  return { status: "live", path, filePath: fileOfEntry({ path, kind }), isFolder: kind === "dir", parentId: page.parentPageId ?? undefined };
}

/**
 * The entry at `segments`, walking the facade's per-directory tables (keyed
 * lower-cased, as the page index makes sibling names unique case-insensitively).
 * Exact when every segment matched its name byte for byte, else `{ caseOf }`
 * carrying the real path. O(depth) map hits.
 */
function entryAt(deps: InboundViewDeps, tables: Tables, segments: readonly string[]): ViewEntry | { caseOf: ViewEntry } | undefined {
  let owner = "";
  let exact = true;
  const names: string[] = [];
  let found: PageFacadeEntry | undefined;
  for (const segment of segments) {
    if (found !== undefined && found.kind !== "dir") return undefined;
    if (found !== undefined) owner = ownerOf(found.id);
    found = tables.dirs.get(owner)?.byName.get(segment.toLowerCase());
    if (found === undefined) return undefined;
    const name = found.name ?? found.title;
    exact = exact && name === segment;
    names.push(name);
  }
  if (found === undefined) return undefined;
  const entry = viewEntryOf(deps, found, names.join("/"));
  return exact ? entry : { caseOf: entry };
}

/** A synthetic id (`#dir`, `#meta`) names its owner page; a plain id is the page. O(1). */
function viewEntryOf(deps: InboundViewDeps, found: PageFacadeEntry, path: string): ViewEntry {
  const pageId = ownerOf(found.id);
  const synthetic = pageId !== found.id;
  if (found.kind === "dir") return { entryId: found.id, pageId, role: synthetic ? "children-dir" : "folder-dir", path };
  if (synthetic) return { entryId: found.id, pageId, role: "folder-meta", path };
  const page = deps.views.pageById(pageId);
  return { entryId: found.id, pageId, role: page !== undefined && kindOfPage(page) === "code" ? "code-file" : "page-file", path };
}

/** The pages directly inside a directory entry: each page once (its FILE, or a
 *  folder's DIR), never a `#meta` or `#dir` twin. O(entries in that directory). */
function childrenOf(views: ReadableViews, entryId: string): { pageId: string; path: string }[] {
  const index = views.indexOf();
  const out: { pageId: string; path: string }[] = [];
  for (const entry of views.tablesFor().dirs.get(ownerOf(entryId))?.list ?? []) {
    const path = ownerOf(entry.id) === entry.id ? index.pathForId(entry.id) : undefined;
    if (path !== undefined) out.push({ pageId: entry.id, path });
  }
  return out;
}
