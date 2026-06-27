/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceDatabaseWrites.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { NotionState, Page } from "@notion-db/object-database";
import type { PageEntry, PagePropertyEntry } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { FILE, FOLD, UNFILED_FOLDER_ID, WS_FILES_DB_ID, WS_FOLDERS_DB_ID } from "./workspaceDatabaseConstants";

function titleOf(page: Page): string {
  const key = page.databaseId === WS_FOLDERS_DB_ID ? FOLD.title : FILE.title;
  return String(page.properties[key] ?? "Untitled");
}

/** The folder id a file record points at (null/Unfiled → no folder parent). */
function folderRelationOf(page: Page): string | null {
  const raw = page.properties[FILE.folder];
  const id = Array.isArray(raw) ? raw[0] : raw;
  return !id || id === UNFILED_FOLDER_ID ? null : String(id);
}

/** Editable select/tags facets → osionos page properties (persist + show in inspector). */
function recordProperties(page: Page): PagePropertyEntry[] {
  const isFolder = page.databaseId === WS_FOLDERS_DB_ID;
  const specs: Array<[string, string, PagePropertyEntry["type"]]> = isFolder
    ? [[FOLD.theme, "Theme", "select"], [FOLD.category, "Parent", "select"]]
    : [[FILE.theme, "Theme", "select"], [FILE.category, "Category", "select"],
       [FILE.type, "Type", "select"], [FILE.tags, "Tags", "multi_select"]];
  const props: PagePropertyEntry[] = specs.map(([key, label, type]) => ({
    key, label, type, value: page.properties[key] ?? (type === "multi_select" ? [] : null),
  }));
  if (!isFolder) {
    const related = page.properties[FILE.related];
    props.push({ key: FILE.related, label: "Related", type: "relation", relationTarget: "page",
      value: Array.isArray(related) ? related.map(String) : [] });
  }
  return props;
}

function visibilityOf(page: Page): "private" | "shared" | null {
  const key = page.databaseId === WS_FOLDERS_DB_ID ? FOLD.visibility : FILE.visibility;
  const value = page.properties[key];
  return value === "private" || value === "shared" ? value : null;
}

/** A user adds rows one at a time; a *batch* of "new" rows is always a load/sync
 * artifact (the bug that duplicated the whole workspace), never a real edit. */
const MAX_CREATES_PER_PERSIST = 3;

/** Apply the diff between two synthesized states to the live page store. Returns true if it mutated. */
export function applyWorkspacePersist(next: NotionState, previous?: NotionState): boolean {
  const workspaceId = useUserStore.getState().activeWorkspace()?._id ?? "";
  if (!workspaceId) return false;
  const jwt = useUserStore.getState().activeSession()?.accessToken ?? "";
  const store = usePageStore.getState();
  const prevPages = previous?.pages ?? {};
  let mutated = false;
  const creates: Page[] = [];

  for (const page of Object.values(next.pages)) {
    if (page.id === UNFILED_FOLDER_ID) continue;
    const before = prevPages[page.id];
    if (!before) {
      // "New" ONLY when it isn't already a live page — otherwise this is the load
      // surfacing existing records. Collect (don't create yet); a bulk batch is
      // rejected wholesale below so the duplicate storm can never recur.
      if (!store.pageById(page.id)) creates.push(page);
      continue;
    }
    if (titleOf(page) !== titleOf(before)) { store.updatePageTitle(page.id, titleOf(page)); mutated = true; }
    const patch: Partial<PageEntry> = {};
    if (page.cover !== before.cover) patch.cover = page.cover;
    const visibility = visibilityOf(page);
    if (visibility && visibility !== visibilityOf(before)) patch.visibility = visibility;
    if (JSON.stringify(recordProperties(page)) !== JSON.stringify(recordProperties(before))) {
      patch.properties = recordProperties(page);
    }
    if (Object.keys(patch).length > 0) { store.patchPage(page.id, patch); mutated = true; }
    if (page.databaseId === WS_FILES_DB_ID && folderRelationOf(page) !== folderRelationOf(before)) {
      store.movePage(page.id, folderRelationOf(page), workspaceId);
      mutated = true;
    }
  }

  // Safety net against the duplicate storm: create at most a handful of genuinely
  // new rows; a larger batch is a load artifact and is dropped (logged, not written).
  if (creates.length > MAX_CREATES_PER_PERSIST) {
    console.warn(`[workspace-db] dropped ${creates.length} bulk "new" rows (load artifact, not a user edit)`);
  } else {
    for (const page of creates) {
      const surface = page.databaseId === WS_FOLDERS_DB_ID ? "folder" : undefined;
      const parent = page.databaseId === WS_FILES_DB_ID ? (folderRelationOf(page) ?? undefined) : undefined;
      void store.addPage(workspaceId, titleOf(page), jwt, parent, { surface, icon: page.icon });
      mutated = true;
    }
  }

  // Same guard for removals — a user deletes one row at a time; a bulk vanish is a
  // load/filter artifact, never a real edit, so it must not mass-archive the vault.
  const archives = Object.keys(prevPages).filter((id) => id !== UNFILED_FOLDER_ID && !next.pages[id]);
  if (archives.length > MAX_CREATES_PER_PERSIST) {
    console.warn(`[workspace-db] dropped ${archives.length} bulk archives (load artifact, not a user edit)`);
  } else {
    for (const id of archives) { void store.archivePage(id, workspaceId, jwt); mutated = true; }
  }
  return mutated;
}
