/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileFacadeTables.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { compareFacadeEntries, type PageFacadeEntry } from "@/features/ide/vfs/pageProvider";
import { FOLDER_META_NAME, PAGE_FILE_SUFFIX } from "./types";
import type { PageEntry } from "@/entities/page";
import type { PageIndex, PageIndexEntry } from "./pageIndex";

/** The page tree as a FILESYSTEM: block page `Roadmap` = FILE `Roadmap.omd` + (with
 *  children) DIR `Roadmap/`; folder page = DIR + hidden `_folder.omd`; code page = raw
 *  FILE (+ rarely DIR `main.ts.d/`). Names come off the page index, so this table and
 *  `PageIndex.pathForId` cannot disagree. The mutating ops run against OpContext. */
/** A block page's DIR id (`#dir`) and a folder page's meta-FILE id (`#meta`). */
const DIR_SUFFIX = "#dir";
export const META_SUFFIX = "#meta";
/** A code page's children live in `<path>.d/` — pagePaths.childDirName's rule. */
export const CODE_DIR_SUFFIX = ".d";

/** The page an entry id (or a DIR id used as a parent) belongs to. Ponytail: a
 *  page id that itself ends in "#dir"/"#meta" loses that suffix — ids are
 *  server UUIDs or `local-page-…`, a naming assumption, not a guarantee. */
export function ownerOf(id: string | null): string {
  if (id === null) return "";
  return id.endsWith(DIR_SUFFIX) || id.endsWith(META_SUFFIX) ? id.slice(0, id.lastIndexOf("#")) : id;
}

/** A page's DIR entry id: the page id for a folder, `<id>#dir` otherwise. */
function dirIdOf(entry: PageIndexEntry): string {
  return entry.kind === "dir" ? entry.id : `${entry.id}${DIR_SUFFIX}`;
}

/** The directory a page's children live in (last segment: ownerOfDir's key). */
function dirPathOf(entry: PageIndexEntry): string {
  if (entry.kind === "code") return `${entry.path}${CODE_DIR_SUFFIX}`;
  if (entry.kind === "dir") return entry.path;
  return entry.path.slice(0, -PAGE_FILE_SUFFIX.length);
}

const lastSegment = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** One directory: entries in facadeChildren order (sorted once), the by-name map keyed
 *  LOWER-CASED (the page index makes sibling names unique case-insensitively), and every
 *  lower-cased name the siblings RESERVE: each page's own name AND its child-dir name
 *  (`Roadmap` for `Roadmap.omd`, `main.ts.d` for `main.ts`), listed or not. */
export interface PageDir {
  readonly list: PageFacadeEntry[];
  readonly byName: Map<string, PageFacadeEntry>;
  readonly claimed: Set<string>;
}
export interface Tables {
  readonly all: PageFacadeEntry[];
  readonly dirs: ReadonlyMap<string, PageDir>;
  readonly byId: ReadonlyMap<string, PageFacadeEntry>;
}

/** O(n): a FILE entry per page, a DIR per folder or page with children; each entry's
 *  `parentId` is its parent's DIR entry id. Sorted by (title, id) — the fallback's order. */
export function buildTables(index: PageIndex, pages: readonly PageEntry[]): Tables {
  const pagesById = new Map(pages.map((p) => [p._id, p]));
  const entryById = new Map<string, PageIndexEntry>(index.entries.map((e) => [e.id, e]));
  const withChildren = new Set(index.entries.filter((e) => e.parentId !== null).map((e) => e.parentId));
  const dirs = new Map<string, PageDir>();
  const all: PageFacadeEntry[] = [];
  const byId = new Map<string, PageFacadeEntry>();
  const dirFor = (owner: string): PageDir => {
    let dir = dirs.get(owner);
    if (dir === undefined) {
      dir = { list: [], byName: new Map(), claimed: new Set() };
      dirs.set(owner, dir);
    }
    return dir;
  };
  const add = (entry: PageFacadeEntry, owner: string): void => {
    all.push(entry);
    byId.set(entry.id, entry);
    const dir = dirFor(owner);
    dir.list.push(entry);
    dir.byName.set((entry.name ?? "").toLowerCase(), entry);
  };
  for (const entry of index.entries) {
    const parent = entry.parentId === null ? null : entryById.get(entry.parentId) ?? null;
    const parentId = parent === null ? null : dirIdOf(parent);
    const stamp = pagesById.get(entry.id)?.updatedAt;
    const mtimeMs = stamp === undefined ? 0 : new Date(stamp).getTime();
    const owner = entry.parentId ?? "";
    const claimed = dirFor(owner).claimed;
    claimed.add(lastSegment(entry.path).toLowerCase());
    claimed.add(lastSegment(dirPathOf(entry)).toLowerCase());
    if (entry.kind === "dir") {
      // _folder.omd lives INSIDE the folder's own directory, not its parent's.
      add({ id: `${entry.id}${META_SUFFIX}`, title: FOLDER_META_NAME, parentId: entry.id, kind: "file", sizeBytes: null, mtimeMs, name: FOLDER_META_NAME }, entry.id);
    } else {
      const name = lastSegment(entry.path);
      add({ id: entry.id, title: name, parentId, kind: "file", sizeBytes: null, mtimeMs, name }, owner);
    }
    if (entry.kind === "dir" || withChildren.has(entry.id)) {
      const name = lastSegment(dirPathOf(entry));
      add({ id: dirIdOf(entry), title: name, parentId, kind: "dir", sizeBytes: 0, mtimeMs, name }, owner);
    }
  }
  for (const dir of dirs.values()) dir.list.sort(compareFacadeEntries);
  return { all, dirs, byId };
}
