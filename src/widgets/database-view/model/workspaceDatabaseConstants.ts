/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceDatabaseConstants.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Identity for the live "workspace" databases that expose the existing
 * osionos_pages records as two related Notion tables:
 *   - ws-folders  ← rows with surface === 'folder'
 *   - ws-files    ← rows with no surface (the notes/files)
 * The folder↔file relation is derived from parent_page_id. Nothing is copied;
 * these ids just label the synthesized NotionState (see workspaceDatabaseState).
 */

export const WS_FOLDERS_DB_ID = "ws-folders";
export const WS_FILES_DB_ID = "ws-files";

export const WS_FOLDERS_TABLE_VIEW = "v-ws-folders-table";
export const WS_FILES_GALLERY_VIEW = "v-ws-files-gallery";
export const WS_FILES_TABLE_VIEW = "v-ws-files-table";

/** Synthetic folder gathering files that have no folder parent. */
export const UNFILED_FOLDER_ID = "ws-folder-unfiled";
export const UNFILED_FOLDER_TITLE = "Unfiled";

/** Fallback cover for files without a photo (thematic Unsplash). */
export const DEFAULT_FILE_COVER =
  "https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?auto=format&fit=crop&w=1200&q=80";

/** Property ids for the Folders table. */
export const FOLD = {
  title: "ws-fold-title",
  files: "ws-fold-files",
  count: "ws-fold-count",
  theme: "ws-fold-theme",
  category: "ws-fold-category",
  visibility: "ws-fold-visibility",
  created: "ws-fold-created",
} as const;

/** Property ids for the Files table. */
export const FILE = {
  title: "ws-file-title",
  folder: "ws-file-folder",
  theme: "ws-file-theme",
  category: "ws-file-category",
  type: "ws-file-type",
  tags: "ws-file-tags",
  related: "ws-file-related",
  visibility: "ws-file-visibility",
  created: "ws-file-created",
} as const;

const WS_DATABASE_IDS = new Set<string>([WS_FOLDERS_DB_ID, WS_FILES_DB_ID]);
const WS_VIEW_IDS = new Set<string>([
  WS_FOLDERS_TABLE_VIEW,
  WS_FILES_GALLERY_VIEW,
  WS_FILES_TABLE_VIEW,
]);

/** True when a database id belongs to the live workspace databases. */
export function isWorkspaceDatabaseId(id?: string | null): boolean {
  return id != null && WS_DATABASE_IDS.has(id);
}

/** True when a view id belongs to the live workspace databases. */
export function isWorkspaceViewId(id?: string | null): boolean {
  return id != null && WS_VIEW_IDS.has(id);
}
