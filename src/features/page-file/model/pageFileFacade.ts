/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileFacade.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError } from "@/features/ide/vfs/errors";
import { archivePage, createPage, loadedPage, movePage, renamePage, writePage, type OpContext } from "./pageFileFacadeOps";
import { ownerOf, type PageDir } from "./pageFileFacadeTables";
import { createReadableViews, type ReadableViews } from "./pageFileFacadeViews";
import { pageFileText } from "./pageFileText";
import { FOLDER_META_NAME } from "./types";

import type { PageFacade, PageFacadeEntry } from "@/features/ide/vfs/pageProvider";
import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";

const NO_ENTRIES: readonly PageFacadeEntry[] = [];

/** One create step in store terms: the facade picks the surface from the file name (`*.omd` → block page, else code page). */
export interface NewPage {
  title: string;
  parentId: string | null;
  surface: PageEntry["surface"];
  content?: Block[];
}

/** Every collaborator the facade needs, injected so node tests can drive it with
 *  an in-memory store. The real wiring lives in pageFileFacadeStore.ts, the only
 *  facade module that imports the app store and API client (neither loads under node). */
export interface PageFileStore {
  /** Names the index cache entry: the explorer's `usePageIndex` keys on the
   *  bare workspace id over ALL pages; sharing it would make the two arrays
   *  evict each other on every call. */
  workspaceId: string;
  pages(): readonly PageEntry[];
  /** The access snapshot `canRead` runs under — the slice cache keys on its identity. */
  access(): object | null;
  canRead(page: PageEntry): boolean;
  canEdit(page: PageEntry): boolean;
  /** Owner-only: may this user change who sees the page (pinFilePatch). */
  canChangeSharing(page: PageEntry): boolean;
  /** Fetch a page body the store has not hydrated yet. */
  loadContent(pageId: string): Promise<void>;
  subscribe(listener: (state: unknown, prevState: unknown) => void): () => void;
  addPage(input: NewPage): Promise<PageEntry | null>;
  patchPage(pageId: string, patch: Partial<PageEntry>): void;
  updatePageContent(pageId: string, blocks: Block[]): void;
  updatePageTitle(pageId: string, title: string): void;
  updateBlock(pageId: string, blockId: string, updates: Partial<Block>): void;
  movePage(pageId: string, parentId: string | null): void;
  archivePage(pageId: string): Promise<void>;
  /** Title → file name (idePaths.sanitizeSegment), the ONE sanitizer. */
  toSegment(title: string): string;
}

type DirLookup = (parentId: string | null) => PageDir | undefined;

function operationContext(deps: PageFileStore, views: ReadableViews, dirOf: DirLookup): OpContext {
  return {
    deps,
    pageById: views.pageById,
    entryFor: async (created) => {
      if (!created) throw fsError("Io", undefined, "page create failed");
      const entry = views.tablesFor().byId.get(created._id);
      if (!entry) throw fsError("Io", undefined, `${created._id} is not reachable in the page index`);
      return entry;
    },
    claimedIn: (parentId) => dirOf(parentId)?.claimed,
  };
}

// Ponytail: only a page-store change fires this. An access REVOKE changes the entries
// `list`/`children` return but emits no event until the next store change, so a watcher
// keeps showing the revoked page until then. Escape hatch: also subscribe to the
// user/session store and re-run the same index check.
function subscribeToTreeChanges(deps: PageFileStore, views: ReadableViews, onChange: () => void): () => void {
  let last = views.indexOf();
  return deps.subscribe(() => {
    const next = views.indexOf();
    if (next === last) return;
    last = next;
    onChange();
  });
}

/**
 * The page tree as `PageFacade`: every file operation the workbench resolves
 * through `workspace://<ws>/<path>`, online or degraded, from the SAME tree.
 * O(1) by id or name, O(children) per listing, O(depth) per walk; the memoised
 * views live in pageFileFacadeViews.ts and the mutating operations in pageFileFacadeOps.ts.
 * Pass `views` to share one slice cache with another reader of the same store (the
 * inbound view): two caches would each pay the O(n) readable filter per store change.
 */
export function createPageFileFacade(deps: PageFileStore, views: ReadableViews = createReadableViews(deps)): PageFacade {
  const dirOf: DirLookup = (parentId) => views.tablesFor().dirs.get(ownerOf(parentId));
  const ctx = operationContext(deps, views, dirOf);

  return {
    // The page index makes sibling names unique CASE-INSENSITIVELY
    // (assignSiblingNames) but keeps the given case: the provider must say so
    // instead of advertising a tree it cannot hold.
    caseSensitivity: "insensitive-preserving",
    // The folder meta file is hidden from listings, never from childByName
    // (the provider's read() reaches it by path).
    list: () => views.tablesFor().all.filter((e) => e.name !== FOLDER_META_NAME),
    children: (parentId) => (dirOf(parentId)?.list ?? NO_ENTRIES).filter((e) => e.name !== FOLDER_META_NAME),
    childByName: (parentId, name) => dirOf(parentId)?.byName.get(name.toLowerCase()),
    // The loaded-body hit stays inline: no promise chain beyond this async frame, no closure
    // (budgeted at 100 ns in the bench); only a missing body takes loadedPage's fetch path.
    // That path ends in pageFileText either way, so a body that never arrived reads as
    // front matter with an empty body (loadedPage's Ponytail) rather than failing the read.
    readContent: async (id) => {
      const page = views.pageById(ownerOf(id));
      return pageFileText(page?.content === undefined ? await loadedPage(ctx, id) : page);
    },
    create: (input) => createPage(ctx, input),
    writeContent: (id, text) => writePage(ctx, id, text),
    rename: (id, name) => renamePage(ctx, id, name),
    move: (id, parentId) => movePage(ctx, id, parentId),
    archive: (id) => archivePage(ctx, id),
    subscribe: (onChange) => subscribeToTreeChanges(deps, views, onChange),
    toSegment: deps.toSegment,
  };
}
