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
import { sanitizeSegment } from "@/features/ide/model/idePaths";
import { FOLDER_META_NAME, PAGE_FILE_SUFFIX, type PageFileKind } from "./types";

export function kindOfPage(page: PageEntry): PageFileKind {
  if (page.surface === "folder") return "dir";
  return page.surface === "code" ? "code" : "page";
}

/** "Roadmap.omd" → "Roadmap"; any other name is returned unchanged. */
export function titleFromFileName(name: string): string {
  return name.toLowerCase().endsWith(PAGE_FILE_SUFFIX) ? name.slice(0, -PAGE_FILE_SUFFIX.length) : name;
}

export interface SiblingName {
  own: string;
  childDir: string;
}

/**
 * Assigns collision-free names to live siblings.
 * Ponytail: sorting by `_id` is deterministic but not creation order (ids are random
 * UUIDs or `local-page-N-…`), so a NEW sibling whose `_id` sorts first takes the
 * plain name and renames the existing colliding sibling's file to " (2)".
 * O(n log n) for the sort + O(n) for assignment using a per-base next-k map.
 */
export function assignSiblingNames(siblings: readonly PageEntry[]): Map<string, SiblingName> {
  const seen = new Set<string>();
  const live = siblings
    .filter((p) => !p.archivedAt && !seen.has(p._id) && seen.add(p._id))
    .sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
  const claimed = new Set<string>([FOLDER_META_NAME.toLowerCase()]);
  const nextK = new Map<string, number>();
  const result = new Map<string, SiblingName>();
  for (const page of live) {
    const kind = kindOfPage(page);
    const base = baseNameFor(page, kind);
    const lowerBase = base.toLowerCase();
    for (let k = nextK.get(lowerBase) ?? 1; ; k++) {
      const candidate = k === 1 ? base : suffixed(base, k, kind === "code");
      const own = ownName(candidate, kind);
      const childDir = childDirName(candidate, kind);
      if (claimed.has(own.toLowerCase()) || claimed.has(childDir.toLowerCase())) continue;
      claimed.add(own.toLowerCase());
      claimed.add(childDir.toLowerCase());
      result.set(page._id, { own, childDir });
      nextK.set(lowerBase, k + 1);
      break;
    }
  }
  return result;
}

/** Sanitized title; a page drops a typed ".omd" (the suffix is added back), a code
 *  file named "*.omd" gets ".txt" so it is never read back as a page file. */
function baseNameFor(page: PageEntry, kind: PageFileKind): string {
  const base = sanitizeSegment(page.title || "untitled");
  if (base === ".") return "untitled";
  const endsOmd = base.toLowerCase().endsWith(PAGE_FILE_SUFFIX);
  if (kind === "code") return endsOmd ? `${base}.txt` : base;
  if (kind !== "page" || !endsOmd) return base;
  const stripped = base.slice(0, -PAGE_FILE_SUFFIX.length);
  return stripped && stripped !== "." ? stripped : "untitled";
}

function ownName(base: string, kind: PageFileKind): string {
  switch (kind) {
    case "code":
      return base;
    case "dir":
      return base;
    case "page":
      return base + PAGE_FILE_SUFFIX;
  }
}

function childDirName(base: string, kind: PageFileKind): string {
  switch (kind) {
    case "code":
      return base + ".d";
    case "dir":
      return base;
    case "page":
      return base;
  }
}

function suffixed(base: string, k: number, isCode: boolean): string {
  const suffix = ` (${k})`;
  if (isCode) {
    const lastDot = base.lastIndexOf(".");
    if (lastDot > 0) {
      return base.slice(0, lastDot) + suffix + base.slice(lastDot);
    }
  }
  return base + suffix;
}

/**
 * Returns this page's file name among `siblings` (same parent, live).
 * Includes `page` itself even if archived, so a caller can name a page before it goes live.
 */
export function fileNameForPage(page: PageEntry, siblings: readonly PageEntry[]): string {
  const others = siblings.filter((p) => p._id !== page._id);
  // Include page even if archived by temporarily clearing archivedAt for naming
  const pageForNaming = page.archivedAt ? { ...page, archivedAt: null } : page;
  const all = [...others, pageForNaming];
  const names = assignSiblingNames(all);
  return names.get(page._id)?.own ?? "";
}

/**
 * Workspace-relative POSIX path of a live page ("src/main.ts", "Roadmap.omd",
 * "Roadmap/Q3.omd"); "" when the page or an ancestor is archived/unknown or a cycle exists.
 * O(depth × s log s), s = siblings per level.
 */
export function pathForEntry(
  pageId: string,
  resolve: (id: string) => PageEntry | undefined,
  siblingsOf: (parentId: string | null) => readonly PageEntry[],
): string {
  const visited = new Set<string>();
  const segments: string[] = [];
  let currentId: string | undefined = pageId;
  let isFirst = true;
  const siblingCache = new Map<string, Map<string, SiblingName>>();

  while (currentId) {
    if (visited.has(currentId)) return "";
    visited.add(currentId);

    const page = resolve(currentId);
    if (!page || page.archivedAt) return "";

    const parentId = page.parentPageId ?? null;
    let siblingMap = siblingCache.get(parentId ?? "");
    if (!siblingMap) {
      const sibs = siblingsOf(parentId);
      siblingMap = assignSiblingNames(sibs);
      siblingCache.set(parentId ?? "", siblingMap);
    }

    const names = siblingMap.get(page._id);
    if (!names) return "";

    segments.push(isFirst ? names.own : names.childDir);
    isFirst = false;
    currentId = page.parentPageId ?? undefined;
  }

  return segments.reverse().join("/");
}