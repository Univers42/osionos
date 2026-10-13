/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageConflictResolve.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import type { IdeSyncConflict } from "@/features/ide/model/ideSyncConflicts";
import { pageIndexFor } from "./pageIndexCache";
import { pageFileText } from "./pageFileText";
import { FOLDER_META_NAME } from "./types";

/** The two resolutions of one surfaced divergence (ADR-001 §7). Every collaborator is injected
 *  so the actions stay loadable under node; liveConflictDeps is the only part reaching the app,
 *  and it goes through import() because those modules touch browser-only globals at module
 *  scope. */
export type PageConflictDeps = {
  pageById(id: string): PageEntry | undefined;
  /** The page's CURRENT file path (folder → `<dir>/_folder.omd`); undefined when archived. */
  currentPathOf(page: PageEntry): string | undefined;
  conflictOf(pageId: string): IdeSyncConflict | undefined;
  canEdit(page: PageEntry): boolean;
  fsWrite(workspaceId: string, relPath: string, text: string): Promise<boolean>;
  writeContent(workspaceId: string, id: string, text: string): Promise<void>;
  recordSyncedHash(workspaceId: string, relPath: string, hash: string): void;
  resolve(pageId: string): void;
};

export type ConflictResult = { ok: true } | { ok: false; reason: string };

type Open = { page: PageEntry; path: string; conflict: IdeSyncConflict };

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The shared first steps. The conflict is read HERE, not captured earlier, so a newer report
 *  replaces an older one; the path is recomputed for the same reason — the conflict's own
 *  relPath is stale after a rename, move or archive, and writing to it would recreate the file
 *  the inbound sync just moved. O(1). */
function openConflict(pageId: string, deps: PageConflictDeps): Open | { fail: ConflictResult } {
  const conflict = deps.conflictOf(pageId);
  if (!conflict) return { fail: { ok: false, reason: "this conflict was already resolved" } };
  const page = deps.pageById(pageId);
  if (!page) { deps.resolve(pageId); return { fail: { ok: false, reason: "this page no longer exists" } }; }
  const path = deps.currentPathOf(page);
  if (!path) { deps.resolve(pageId); return { fail: { ok: false, reason: "this page has no file any more" } }; }
  return { page, path, conflict };
}

/** Keep mine: push the page's own text at its current path. A folder file is front matter only,
 *  so it needs no loaded body; anything else must have one or the write would serialise an
 *  empty body. ideFsWrite records (and rolls back) its own agreed hash, so this never calls
 *  recordSyncedHash. O(page text). */
export async function keepMine(pageId: string, deps: PageConflictDeps): Promise<ConflictResult> {
  try {
    const open = openConflict(pageId, deps);
    if ("fail" in open) return open.fail;
    const { page, path } = open;
    if (page.surface !== "folder" && page.content === undefined) {
      return { ok: false, reason: "this page body has not loaded yet" };
    }
    const written = await deps.fsWrite(page.workspaceId, path, pageFileText(page));
    if (!written) return { ok: false, reason: "the sandbox did not accept the write" };
    deps.resolve(pageId);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
}

/** Take file: replace the page with the sandbox's text. The edit right is checked first —
 *  writing content is the whole point, so a read-only page gets nothing at all. The ledger
 *  moves to theirsHash BEFORE the conflict is dropped, or the echo of our own write would read
 *  as a fresh change. O(conflict text). */
export async function takeFile(pageId: string, deps: PageConflictDeps): Promise<ConflictResult> {
  try {
    const open = openConflict(pageId, deps);
    if ("fail" in open) return open.fail;
    const { page, path, conflict } = open;
    if (!deps.canEdit(page)) return { ok: false, reason: "you can't edit this page" };
    await deps.writeContent(page.workspaceId, pageId, conflict.theirs);
    deps.recordSyncedHash(page.workspaceId, path, conflict.theirsHash);
    deps.resolve(pageId);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
}

/** The real collaborators, resolved on first use: async because the caller already awaits, and
 *  the modules it needs are browser-only at module scope. O(1). */
export async function liveConflictDeps(): Promise<PageConflictDeps> {
  const [store, fs, facade, engine, conflicts, access] = await Promise.all([
    import("@/store/usePageStore"), import("@/features/ide/model/ideFsClient"),
    import("./pageFileFacadeStore"), import("@/features/ide/model/ideSyncEngine"),
    import("@/features/ide/model/ideSyncConflicts"), import("@/shared/lib/auth/pageAccess"),
  ]);
  return {
    pageById: (id) => store.usePageStore.getState().pageById(id),
    // The PAGE's own workspace, never the active one: a conflict surfaced in a background pane
    // must not write into whichever workspace is focused. A folder page's index path is its DIRECTORY.
    currentPathOf: (page) => {
      const pages = store.usePageStore.getState().pagesForWorkspace(page.workspaceId);
      const own = pageIndexFor(page.workspaceId, pages).pathForId(page._id);
      if (own === undefined) return undefined;
      return page.surface === "folder" ? `${own}/${FOLDER_META_NAME}` : own;
    },
    conflictOf: (pageId) => conflicts.useIdeSyncConflicts.getState().byPageId[pageId],
    canEdit: (page) => access.canEditPage(page, access.getCurrentPageAccessContext()),
    fsWrite: (workspaceId, relPath, text) => fs.ideFsWrite(workspaceId, relPath, text),
    writeContent: (workspaceId, id, text) => facade.pageFileFacade(workspaceId).writeContent(id, text),
    recordSyncedHash: (workspaceId, relPath, hash) => engine.recordSyncedHash(workspaceId, relPath, hash),
    resolve: (pageId) => conflicts.useIdeSyncConflicts.getState().resolve(pageId),
  };
}
