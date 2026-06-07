/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceDatabaseDerive.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Page } from "@notion-db/object-database";
import type { PageEntry, PagePropertyEntry } from "@/entities/page";
import { FOLD, UNFILED_FOLDER_ID, UNFILED_FOLDER_TITLE } from "./workspaceDatabaseConstants";

/** A coarse file "type" derived from the title, for a useful gallery facet. */
export function fileType(title: string): string {
  const value = title ?? "";
  if (/showcase|playground|gallery/i.test(value)) return "Showcase";
  if (/cheat|reference|sheet/i.test(value)) return "Reference";
  if (/overview|index|readme/i.test(value)) return "Overview";
  return "Lesson";
}

/** Tag values from a file's multi-select / "tags" property, if any. */
export function readTags(entry: PageEntry): string[] {
  const props: PagePropertyEntry[] = Array.isArray(entry.properties) ? entry.properties : [];
  const tagProp = props.find((p) =>
    p && (p.type === "multi_select" || /tag/i.test(p.label ?? "") || /tag/i.test(p.key ?? "")));
  const value = tagProp?.value;
  return Array.isArray(value) ? value.map(String).map((v) => v.trim()).filter(Boolean) : [];
}

/** Linked file ids from a file's existing relation property (the "related" cross-links). */
export function readRelated(entry: PageEntry): string[] {
  const props: PagePropertyEntry[] = Array.isArray(entry.properties) ? entry.properties : [];
  const out: string[] = [];
  for (const prop of props) {
    if (prop && prop.type === "relation" && Array.isArray(prop.value)) {
      for (const v of prop.value) if (typeof v === "string" && v) out.push(v);
    }
  }
  return out;
}

/** The synthetic "Unfiled" folder record gathering files with no folder parent. */
export function unfiledFolderPage(childFileIds: string[]): Page {
  const now = new Date().toISOString();
  return {
    id: UNFILED_FOLDER_ID,
    databaseId: "ws-folders",
    icon: "🗃️",
    properties: {
      [FOLD.title]: UNFILED_FOLDER_TITLE,
      [FOLD.files]: childFileIds,
      [FOLD.count]: childFileIds.length,
      [FOLD.theme]: UNFILED_FOLDER_TITLE,
      [FOLD.category]: UNFILED_FOLDER_TITLE,
      [FOLD.visibility]: "private",
      [FOLD.created]: now,
    },
    content: [],
    createdAt: now,
    updatedAt: now,
    createdBy: "You",
    lastEditedBy: "You",
  };
}
