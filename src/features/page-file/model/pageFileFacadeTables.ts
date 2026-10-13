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
 *  (`Roadmap` for `Roadmap.omd`, `main.ts.d` for `main.ts`), listed or not.
 *  `claimed` holds only what THIS table saw — it never carries `_folder.omd`, which the
 *  page index reserves in every directory: a folder's meta FILE is stored under the
 *  folder's own key, so it lands in that directory's `byName`, not in its `claimed`.
 *  That is why the create/rename guards test the meta name against `toSegment`
 *  (pageFileFacadeOps.assertNotFolderMeta) and never against this set. */
export interface PageDir {
  readonly list: readonly PageFacadeEntry[];
  readonly byName: ReadonlyMap<string, PageFacadeEntry>;
  readonly claimed: ReadonlySet<string>;
}
export interface Tables {
  readonly all: PageFacadeEntry[];
  readonly dirs: ReadonlyMap<string, PageDir>;
  readonly byId: ReadonlyMap<string, PageFacadeEntry>;
}

/** The builder's own mutable view of one directory; `Tables` hands out the readonly shape. */
interface MutablePageDir {
  list: PageFacadeEntry[];
  byName: Map<string, PageFacadeEntry>;
  claimed: Set<string>;
}

/** Where every entry of one buildTables call goes. O(1) inserts, O(k log k) sorts at the end. */
interface Build {
  readonly dirs: Map<string, MutablePageDir>;
  readonly all: PageFacadeEntry[];
  readonly byId: Map<string, PageFacadeEntry>;
}

function dirFor(build: Build, owner: string): MutablePageDir {
  const existing = build.dirs.get(owner);
  if (existing) return existing;
  const dir: MutablePageDir = { list: [], byName: new Map(), claimed: new Set() };
  build.dirs.set(owner, dir);
  return dir;
}

function addTo(build: Build, entry: PageFacadeEntry, owner: string): void {
  build.all.push(entry);
  build.byId.set(entry.id, entry);
  const dir = dirFor(build, owner);
  dir.list.push(entry);
  dir.byName.set((entry.name ?? "").toLowerCase(), entry);
}

/** One index entry's contribution: its FILE (a folder's is the hidden meta file) plus, when
 *  the index gave the page children, the DIR they live in. O(1), two pushes at most. */
function addEntries(build: Build, row: { entry: PageIndexEntry; parentDirId: string | null; mtimeMs: number; hasChildren: boolean }): void {
  const { entry, parentDirId, mtimeMs, hasChildren } = row;
  const owner = entry.parentId ?? "";
  if (entry.kind === "dir") {
    // _folder.omd lives INSIDE the folder's own directory, not its parent's.
    addTo(build, { id: `${entry.id}${META_SUFFIX}`, title: FOLDER_META_NAME, parentId: entry.id, kind: "file", sizeBytes: null, mtimeMs, name: FOLDER_META_NAME }, entry.id);
  } else {
    const name = lastSegment(entry.path);
    addTo(build, { id: entry.id, title: name, parentId: parentDirId, kind: "file", sizeBytes: null, mtimeMs, name }, owner);
  }
  if (entry.kind === "dir" || hasChildren) {
    const name = lastSegment(dirPathOf(entry));
    addTo(build, { id: dirIdOf(entry), title: name, parentId: parentDirId, kind: "dir", sizeBytes: 0, mtimeMs, name }, owner);
  }
}

/** O(n): a FILE entry per page, a DIR per folder or page with children; each entry's
 *  `parentId` is its parent's DIR entry id. Sorted by (title, id) — the fallback's order. */
export function buildTables(index: PageIndex, pages: readonly PageEntry[]): Tables {
  const pagesById = new Map(pages.map((p) => [p._id, p]));
  const entryById = new Map<string, PageIndexEntry>(index.entries.map((e) => [e.id, e]));
  const withChildren = new Set(index.entries.filter((e) => e.parentId !== null).map((e) => e.parentId));
  const build: Build = { dirs: new Map(), all: [], byId: new Map() };
  for (const entry of index.entries) {
    const parent = entry.parentId === null ? null : entryById.get(entry.parentId) ?? null;
    const stamp = pagesById.get(entry.id)?.updatedAt;
    const claimed = dirFor(build, entry.parentId ?? "").claimed;
    claimed.add(lastSegment(entry.path).toLowerCase());
    claimed.add(lastSegment(dirPathOf(entry)).toLowerCase());
    addEntries(build, { entry, parentDirId: parent === null ? null : dirIdOf(parent), mtimeMs: stamp === undefined ? 0 : new Date(stamp).getTime(), hasChildren: withChildren.has(entry.id) });
  }
  for (const dir of build.dirs.values()) dir.list.sort(compareFacadeEntries);
  return { all: build.all, dirs: build.dirs, byId: build.byId };
}
