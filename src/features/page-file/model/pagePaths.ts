/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pagePaths.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

import { PAGE_FILE_SUFFIX, type PageFileKind } from "./types";

// LANE I STUB — lane B (feat/ide-codec) implements fileNameForPage/pathForEntry.

export function kindOfPage(page: PageEntry): PageFileKind {
  if (page.surface === "folder") return "dir";
  return page.surface === "code" ? "code" : "page";
}

/** "Roadmap.omd" → "Roadmap"; any other name is returned unchanged. */
export function titleFromFileName(name: string): string {
  return name.toLowerCase().endsWith(PAGE_FILE_SUFFIX) ? name.slice(0, -PAGE_FILE_SUFFIX.length) : name;
}

/** This page's name inside its parent dir, collision-free among `siblings`
 *  (same parent, live). Code → sanitized title; dir → sanitized title;
 *  page → sanitized title + ".omd". */
export function fileNameForPage(page: PageEntry, siblings: readonly PageEntry[]): string {
  void siblings;
  throw new Error(`fileNameForPage(${page._id}): not implemented (lane B)`);
}

/** Workspace-relative POSIX path of a live page ("src/main.ts", "Roadmap.omd",
 *  "Roadmap/Q3.omd"); "" when the page or an ancestor is archived/unknown. */
export function pathForEntry(
  pageId: string,
  resolve: (id: string) => PageEntry | undefined,
  siblingsOf: (parentId: string | null) => readonly PageEntry[],
): string {
  void resolve;
  void siblingsOf;
  throw new Error(`pathForEntry(${pageId}): not implemented (lane B)`);
}
