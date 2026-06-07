/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceDatabaseSchema.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { DatabaseSchema, SchemaProperty, SelectOption, ViewConfig } from "@notion-db/object-database";
import {
  FILE,
  FOLD,
  WS_FILES_DB_ID,
  WS_FILES_GALLERY_VIEW,
  WS_FILES_TABLE_VIEW,
  WS_FOLDERS_DB_ID,
  WS_FOLDERS_TABLE_VIEW,
} from "./workspaceDatabaseConstants";

/** Select-option sets synthesized from the live data (see workspaceDatabaseLoad). */
export interface WsSchemaOptions {
  folderTheme: SelectOption[];
  folderCategory: SelectOption[];
  fileTheme: SelectOption[];
  fileCategory: SelectOption[];
  fileType: SelectOption[];
  fileTags: SelectOption[];
  visibility: SelectOption[];
}

function props(list: SchemaProperty[]): Record<string, SchemaProperty> {
  return Object.fromEntries(list.map((property) => [property.id, property]));
}

/** The Folders table: a record per surface='folder' page; Files relation derived from parent_page_id. */
export function buildFoldersSchema(options: WsSchemaOptions): DatabaseSchema {
  return {
    id: WS_FOLDERS_DB_ID,
    name: "Folders",
    icon: "📁",
    description: "Every folder in the workspace, with the files it contains.",
    titlePropertyId: FOLD.title,
    properties: props([
      { id: FOLD.title, name: "Name", type: "title" },
      { id: FOLD.files, name: "Files", type: "relation",
        relationConfig: { databaseId: WS_FILES_DB_ID, type: "two_way", reversePropertyId: FILE.folder } },
      { id: FOLD.count, name: "Files count", type: "number" },
      { id: FOLD.theme, name: "Theme", type: "select", options: options.folderTheme },
      { id: FOLD.category, name: "Parent", type: "select", options: options.folderCategory },
      { id: FOLD.visibility, name: "Visibility", type: "select", options: options.visibility },
      { id: FOLD.created, name: "Created", type: "created_time" },
    ]),
  };
}

/** The Files table: a record per file page; folder relation derived from parent_page_id; cover = photo. */
export function buildFilesSchema(options: WsSchemaOptions): DatabaseSchema {
  return {
    id: WS_FILES_DB_ID,
    name: "Files",
    icon: "📄",
    description: "Every file (note), grouped by folder and shown with a photo cover.",
    titlePropertyId: FILE.title,
    properties: props([
      { id: FILE.title, name: "Name", type: "title" },
      { id: FILE.folder, name: "Folder", type: "relation",
        relationConfig: { databaseId: WS_FOLDERS_DB_ID, type: "two_way", reversePropertyId: FOLD.files } },
      { id: FILE.theme, name: "Theme", type: "select", options: options.fileTheme },
      { id: FILE.category, name: "Category", type: "select", options: options.fileCategory },
      { id: FILE.type, name: "Type", type: "select", options: options.fileType },
      { id: FILE.tags, name: "Tags", type: "multi_select", options: options.fileTags },
      { id: FILE.related, name: "Related", type: "relation",
        relationConfig: { databaseId: WS_FILES_DB_ID, type: "one_way" } },
      { id: FILE.visibility, name: "Visibility", type: "select", options: options.visibility },
      { id: FILE.created, name: "Created", type: "created_time" },
    ]),
  };
}

function view(config: Partial<ViewConfig> & Pick<ViewConfig, "id" | "databaseId" | "name" | "type">): ViewConfig {
  return {
    filters: [], filterConjunction: "and", sorts: [], visibleProperties: [], settings: {},
    ...config,
  };
}

/** Folders table view + Files gallery (photo covers) + Files table view. */
export function buildWorkspaceViews(): Record<string, ViewConfig> {
  const list: ViewConfig[] = [
    view({ id: WS_FOLDERS_TABLE_VIEW, databaseId: WS_FOLDERS_DB_ID, name: "Folders", type: "table",
      visibleProperties: [FOLD.count, FOLD.theme, FOLD.category, FOLD.visibility],
      settings: { showRowNumbers: true, openPagesIn: "side_peek" } }),
    view({ id: WS_FILES_GALLERY_VIEW, databaseId: WS_FILES_DB_ID, name: "Gallery", type: "gallery",
      visibleProperties: [FILE.category, FILE.theme, FILE.tags],
      settings: { cardPreview: "page_cover", cardSize: "medium", fitMedia: true, showPageIcon: true,
        showTitle: true, openPagesIn: "side_peek" } }),
    view({ id: WS_FILES_TABLE_VIEW, databaseId: WS_FILES_DB_ID, name: "All files", type: "table",
      visibleProperties: [FILE.folder, FILE.category, FILE.theme, FILE.tags, FILE.visibility],
      settings: { showRowNumbers: true, openPagesIn: "side_peek" } }),
  ];
  return Object.fromEntries(list.map((entry) => [entry.id, entry]));
}
