/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import type { PageEntry, PagePropertyEntry, PageRecurrence, PageVisibility } from "@/entities/page";

/** A block page on disk: osionos's Markdown dialect + front-matter (ADR-004). */
export const PAGE_FILE_SUFFIX = ".omd";
/** Front-matter-only file carrying a folder page's id/icon/cover/properties. */
export const FOLDER_META_NAME = "_folder.omd";

/** How a page occupies the workspace folder. */
export type PageFileKind = "page" | "code" | "dir";

/** Per-block id + attributes Markdown cannot carry, keyed by structural index
 *  path ("0", "3.1"). `t` = the block type the entry was taken from; an entry
 *  whose `t` differs from the parsed block at that path is dropped. */
export type BlockOverlayEntry = { t: string; id: string } & Record<string, unknown>;
export type BlockOverlay = Record<string, BlockOverlayEntry>;

/** `.omd` front-matter. One `key: <JSON literal>` per line. Everything is
 *  optional on read (hand-written files); pageToFile always writes id/title/updated. */
export interface PageFileMeta {
  id?: string;
  title?: string;
  icon?: string;
  cover?: string;
  cover_position?: number;
  surface?: PageEntry["surface"];
  visibility?: PageVisibility;
  database_id?: string;
  template?: boolean;
  template_default?: boolean;
  template_surface?: PageEntry["templateSurface"];
  recurrence?: PageRecurrence | null;
  properties?: PagePropertyEntry[];
  updated?: string;
  blocks?: BlockOverlay;
}

export interface ParsedPageFile {
  meta: PageFileMeta;
  /** PageEntry fields the front-matter carries — apply with patchPage. Never contains _id/workspaceId/content. */
  patch: Partial<PageEntry>;
  /** Body blocks with ids/extras restored from the overlay, else from `existing` by position, else fresh ids. */
  content: Block[];
  /** Set when a `---` block was present but not parseable: it was kept as body text. */
  frontMatterError: string | null;
}
