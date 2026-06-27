/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceDatabaseLoad.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { NotionState, Page } from "@notion-db/object-database";
import type { PageEntry } from "@/entities/page";
import { UNFILED_FOLDER_ID, UNFILED_FOLDER_TITLE, WS_FILES_DB_ID, WS_FOLDERS_DB_ID } from "./workspaceDatabaseConstants";
import { fileType, readRelated, readTags, unfiledFolderPage } from "./workspaceDatabaseDerive";
import { fileEntryToNotionPage, folderEntryToNotionPage, synthOptions } from "./workspaceDatabaseMappers";
import { buildFilesSchema, buildFoldersSchema, buildWorkspaceViews, type WsSchemaOptions } from "./workspaceDatabaseSchema";
import { FILE, FOLD } from "./workspaceDatabaseConstants";

function partitionEntries(entries: PageEntry[]) {
  const byId = new Map<string, PageEntry>();
  for (const entry of entries) if (!entry.archivedAt && !entry.isTemplate) byId.set(entry._id, entry);
  const folders: PageEntry[] = [];
  const files: PageEntry[] = [];
  for (const entry of byId.values()) {
    if (entry.surface === "folder") folders.push(entry);
    else if ((entry.surface == null || entry.surface === "page") && !entry.databaseId) files.push(entry);
  }
  return { byId, folders, files };
}

/** Resolve, per file, its folder id (parent folder or Unfiled) → child-file index + per-folder root theme. */
function buildIndexes(byId: Map<string, PageEntry>, folders: PageEntry[], files: PageEntry[]) {
  const folderIdFor = (entry: PageEntry): string =>
    entry.parentPageId && byId.get(entry.parentPageId)?.surface === "folder"
      ? entry.parentPageId
      : UNFILED_FOLDER_ID;

  const childFiles = new Map<string, string[]>();
  for (const file of files) {
    const folderId = folderIdFor(file);
    const list = childFiles.get(folderId);
    if (list) list.push(file._id); else childFiles.set(folderId, [file._id]);
  }

  const themeOf = new Map<string, string>();
  for (const folder of folders) {
    let current: PageEntry | undefined = folder;
    const seen = new Set<string>();
    while (current?.parentPageId && byId.get(current.parentPageId) && !seen.has(current._id)) {
      seen.add(current._id);
      current = byId.get(current.parentPageId);
    }
    themeOf.set(folder._id, current?.title || folder.title || "—");
  }
  return { folderIdFor, childFiles, themeOf };
}

function collectOptions(folderPages: Page[], filePages: Page[]): WsSchemaOptions {
  const values = (pages: Page[], key: string): string[] =>
    pages.flatMap((page) => {
      const raw = page.properties[key];
      return Array.isArray(raw) ? raw.map(String) : raw == null ? [] : [String(raw)];
    });
  return {
    folderTheme: synthOptions(values(folderPages, FOLD.theme)),
    folderCategory: synthOptions(values(folderPages, FOLD.category)),
    fileTheme: synthOptions(values(filePages, FILE.theme)),
    fileCategory: synthOptions(values(filePages, FILE.category)),
    fileType: synthOptions(values(filePages, FILE.type)),
    fileTags: synthOptions(values(filePages, FILE.tags)),
    visibility: synthOptions([...values(folderPages, FOLD.visibility), ...values(filePages, FILE.visibility)]),
  };
}

/** Build one NotionState (both databases + all records + views) from the live pages. */
export function synthesizeWorkspaceState(entries: PageEntry[]): NotionState {
  const { byId, folders, files } = partitionEntries(entries);
  const { folderIdFor, childFiles, themeOf } = buildIndexes(byId, folders, files);
  const pages: Record<string, Page> = {};
  const folderPages: Page[] = [];
  const filePages: Page[] = [];
  let unfiledUsed = false;

  for (const folder of folders) {
    const theme = themeOf.get(folder._id) ?? "—";
    const category = (folder.parentPageId && byId.get(folder.parentPageId)?.title) || theme;
    const page = folderEntryToNotionPage(folder, { theme, category, childFileIds: childFiles.get(folder._id) ?? [] });
    pages[page.id] = page;
    folderPages.push(page);
  }
  for (const file of files) {
    const folderId = folderIdFor(file);
    if (folderId === UNFILED_FOLDER_ID) unfiledUsed = true;
    const theme = themeOf.get(folderId) ?? (folderId === UNFILED_FOLDER_ID ? UNFILED_FOLDER_TITLE : "—");
    const category = byId.get(folderId)?.title ?? UNFILED_FOLDER_TITLE;
    const page = fileEntryToNotionPage(file, {
      theme, category, folderId, type: fileType(file.title), tags: readTags(file), related: readRelated(file),
    });
    pages[page.id] = page;
    filePages.push(page);
  }
  if (unfiledUsed) {
    const unfiled = unfiledFolderPage(childFiles.get(UNFILED_FOLDER_ID) ?? []);
    pages[unfiled.id] = unfiled;
    folderPages.push(unfiled);
  }

  const options = collectOptions(folderPages, filePages);
  return {
    databases: { [WS_FOLDERS_DB_ID]: buildFoldersSchema(options), [WS_FILES_DB_ID]: buildFilesSchema(options) },
    pages,
    views: buildWorkspaceViews(),
  };
}
