/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceDatabaseMappers.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Page } from "@notion-db/object-database";
import type { SelectOption } from "@notion-db/contract-types";
import type { PageEntry } from "@/entities/page";
import { DEFAULT_FILE_COVER, FILE, FOLD, WS_FILES_DB_ID, WS_FOLDERS_DB_ID } from "./workspaceDatabaseConstants";

const OPTION_COLORS = [
  "bg-accent-muted text-accent-text-bold",
  "bg-success-surface-muted text-success-text-tag",
  "bg-warning-surface-muted text-warning-text-tag",
  "bg-danger-surface-muted text-danger-text-tag",
  "bg-violet-surface-muted text-violet-text-tag",
  "bg-orange-surface-muted text-orange-text-tag",
  "bg-cyan-surface-muted text-cyan-text-tag",
  "bg-pink-surface-muted text-pink-text-tag",
  "bg-indigo-surface-muted text-indigo-text-tag",
  "bg-surface-muted text-ink-strong",
];

/** Derived (computed at load time) fields for a folder record. */
export interface FolderDerive { theme: string; category: string; childFileIds: string[]; }
/** Derived (computed at load time) fields for a file record. */
export interface FileDerive {
  theme: string; category: string; folderId: string; type: string; tags: string[]; related: string[];
}

/** Distinct, stable, coloured select options synthesized from the live values. */
export function synthOptions(values: Iterable<string>): SelectOption[] {
  const seen = new Set<string>();
  const out: SelectOption[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opt";
    out.push({ id: `opt-${slug}`, value, color: OPTION_COLORS[(out.length) % OPTION_COLORS.length] });
  }
  return out;
}

/** osionos folder page → notion Folders record (files relation + count derived). */
export function folderEntryToNotionPage(entry: PageEntry, derive: FolderDerive): Page {
  const at = entry.updatedAt ?? new Date().toISOString();
  return {
    id: entry._id,
    databaseId: WS_FOLDERS_DB_ID,
    icon: entry.icon,
    cover: entry.cover,
    properties: {
      [FOLD.title]: entry.title || "Untitled folder",
      [FOLD.files]: derive.childFileIds,
      [FOLD.count]: derive.childFileIds.length,
      [FOLD.theme]: derive.theme,
      [FOLD.category]: derive.category,
      [FOLD.visibility]: entry.visibility ?? "private",
      [FOLD.created]: at,
    },
    content: [],
    createdAt: at,
    updatedAt: at,
    createdBy: "You",
    lastEditedBy: "You",
    parentPageId: entry.parentPageId ?? undefined,
  };
}

/** osionos file page → notion Files record (folder relation derived; cover = photo). */
export function fileEntryToNotionPage(entry: PageEntry, derive: FileDerive): Page {
  const at = entry.updatedAt ?? new Date().toISOString();
  return {
    id: entry._id,
    databaseId: WS_FILES_DB_ID,
    icon: entry.icon,
    cover: entry.cover || DEFAULT_FILE_COVER,
    properties: {
      [FILE.title]: entry.title || "Untitled",
      [FILE.folder]: [derive.folderId],
      [FILE.theme]: derive.theme,
      [FILE.category]: derive.category,
      [FILE.type]: derive.type,
      [FILE.tags]: derive.tags,
      [FILE.related]: derive.related,
      [FILE.visibility]: entry.visibility ?? "private",
      [FILE.created]: at,
    },
    content: [],
    createdAt: at,
    updatedAt: at,
    createdBy: "You",
    lastEditedBy: "You",
    parentPageId: entry.parentPageId ?? undefined,
  };
}
