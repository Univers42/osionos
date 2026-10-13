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

/** Lower-cased once at load: the one name a sibling group can never claim. O(1). */
const FOLDER_META_LOWER = FOLDER_META_NAME.toLowerCase();

/** `_id` order: the semantic order deciding who keeps the plain name. O(1). */
function compareIdAsc(a: PageEntry, b: PageEntry): number {
  return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
}

/**
 * Assigns collision-free names to live siblings.
 * Ponytail: sorting by `_id` is deterministic but not creation order (ids are random
 * UUIDs or `local-page-N-…`), so a NEW sibling whose `_id` sorts first takes the
 * plain name and renames the existing colliding sibling's file to " (2)".
 * O(n log n) for the sort + O(n) for assignment using a per-base next-k map.
 */
export function assignSiblingNames(siblings: readonly PageEntry[]): Map<string, SiblingName> {
  const result = new Map<string, SiblingName>();
  const single = siblings.length === 1 ? siblings[0] : undefined;
  if (single !== undefined) {
    if (!single.archivedAt) claimNext(single, new Set([FOLDER_META_LOWER]), new Map<string, number>(), result);
    return result;
  }
  const live: PageEntry[] = [];
  const seen = new Set<string>();
  for (const page of siblings) {
    if (page.archivedAt || seen.has(page._id)) continue;
    seen.add(page._id);
    live.push(page);
  }
  const only = live.length === 1 ? live[0] : undefined;
  if (only !== undefined) {
    claimNext(only, new Set([FOLDER_META_LOWER]), new Map<string, number>(), result);
    return result;
  }
  if (live.length === 0) return result;
  live.sort(compareIdAsc);
  const claimed = new Set<string>([FOLDER_META_LOWER]);
  const nextK = new Map<string, number>();
  for (const page of live) claimNext(page, claimed, nextK, result);
  return result;
}

/** Next free " (k)" for `page`: `nextK` resumes per base, so this runs once unless two
 *  bases fold onto one name. Both lowers are computed once. O(title) per try. */
function claimNext(page: PageEntry, claimed: Set<string>, nextK: Map<string, number>, result: Map<string, SiblingName>): void {
  const kind = kindOfPage(page);
  const found = baseFor(page, kind);
  const isCode = kind === "code";
  for (let k = nextK.get(found.lower) ?? 1; ; k++) {
    const candidate = k === 1 ? found.base : suffixed(found.base, k, isCode);
    const own = ownName(candidate, kind);
    const childDir = childDirName(candidate, kind);
    const ownLower = own.toLowerCase();
    const childLower = own === childDir ? ownLower : childDir.toLowerCase();
    if (claimed.has(ownLower) || claimed.has(childLower)) continue;
    claimed.add(ownLower);
    claimed.add(childLower);
    result.set(page._id, { own, childDir });
    nextK.set(found.lower, k + 1);
    return;
  }
}

/**
 * Sanitized base plus its lower-case, sharing one `toLowerCase` between the `.omd`
 * probe and the collision key (the old code paid it twice per page). A page drops a
 * typed ".omd" (the suffix is added back), a code file named "*.omd" gets ".txt" so
 * it is never read back as a page file. A page also drops trailing dots: "etc." would
 * be "etc..omd", a name the inbound guard refuses (inboundSegments). O(title).
 */
function baseFor(page: PageEntry, kind: PageFileKind): { base: string; lower: string } {
  const raw = sanitizeSegment(page.title || "untitled");
  const trimmed = kind === "page" ? raw.replace(/\.+$/, "") : raw;
  const clean = trimmed === "" || trimmed === "." ? "untitled" : trimmed;
  const lowerRaw = clean.toLowerCase();
  if (kind === "code") {
    if (lowerRaw.endsWith(PAGE_FILE_SUFFIX)) return { base: `${clean}.txt`, lower: `${lowerRaw}.txt` };
    return { base: clean, lower: lowerRaw };
  }
  if (kind !== "page" || !lowerRaw.endsWith(PAGE_FILE_SUFFIX)) return { base: clean, lower: lowerRaw };
  const stripped = clean.slice(0, -PAGE_FILE_SUFFIX.length);
  if (stripped === "" || stripped === ".") return { base: "untitled", lower: "untitled" };
  // Lower-cased again, not sliced: case mapping is context-sensitive (a Greek
  // final sigma before ".omd" is not final), so lower(stripped) can differ from
  // a slice of lower(clean). Only titles ending in ".omd" pay this.
  return { base: stripped, lower: stripped.toLowerCase() };
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
  return kind === "code" ? `${base}.d` : base;
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