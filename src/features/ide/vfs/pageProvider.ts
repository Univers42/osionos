/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageProvider.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError, isFsError } from "./errors";
import { collectBytes, bytesToStream, textToBytes } from "./bytes";
import type { VPath } from "./vpath";
import type { FsCapabilities, FsProvider, FsStat, ListedEntry, ReadOptions, WatchEvent, WriteOptions } from "./types";

/** One page as the provider sees it; the injected facade keeps the provider store-agnostic and node-testable. */
export type PageFacadeEntry = {
  id: string;
  title: string;
  parentId: string | null;
  kind: "file" | "dir";
  /** null = content not loaded yet (lazy pages) — stat loads on demand. */
  sizeBytes: number | null;
  mtimeMs: number;
  /** Listed name; absent = derived from `title` (a page is both a file and a dir in the page-file facade). */
  name?: string;
};

export type PageFacade = {
  list(): PageFacadeEntry[];
  readContent(id: string): Promise<string>;
  create(input: { title: string; parentId: string | null; kind: "file" | "dir"; content?: string }): Promise<PageFacadeEntry>;
  writeContent(id: string, content: string): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  move(id: string, parentId: string | null): Promise<void>;
  /** Archive semantics — osionos "delete" is the trash, never a hard erase. */
  archive(id: string): Promise<void>;
  /** Title → path segment (idePaths.sanitizeSegment), the ONE sanitizer. */
  toSegment(title: string): string;
  /** Optional fast paths (pageFileFacade has them): O(children) listing,
   *  O(depth) walk, change events without polling. Absent = the list()
   *  fallback, which stays correct, just slower. */
  children?(parentId: string | null): readonly PageFacadeEntry[];
  childByName?(parentId: string | null, name: string): PageFacadeEntry | undefined;
  /** Fires when the entry set changes — never for a body edit. */
  subscribe?(onChange: () => void): () => void;
  /** Absent = "sensitive". The page index keeps the given case but collides names case-insensitively. */
  caseSensitivity?: FsCapabilities["caseSensitivity"];
};

/** (title, id) order — the one order the tables and the fallback both produce. */
export function compareFacadeEntries(a: PageFacadeEntry, b: PageFacadeEntry): number {
  return a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : 1;
}

function nameOf(facade: PageFacade, entry: PageFacadeEntry): string {
  return entry.name ?? facade.toSegment(entry.title);
}
/** Children of a parent, deterministically ordered (title, then id). O(children) via the table, O(n log n) via the scan. */
export function facadeChildren(facade: PageFacade, parentId: string | null): readonly PageFacadeEntry[] {
  const listed = facade.children;
  if (listed) return listed(parentId);
  return facade.list().filter((page) => page.parentId === parentId).sort(compareFacadeEntries);
}
/** By name inside one directory: the facade's table when it has one, else a scan. O(1) via the table, O(children) via the scan. */
export function facadeChildByName(facade: PageFacade, parentId: string | null, name: string): PageFacadeEntry | undefined {
  const byName = facade.childByName;
  if (byName) return byName(parentId, name);
  return facadeChildren(facade, parentId).find((page) => nameOf(facade, page) === name);
}
/** Resolve sanitized path segments to the page entry — the ONE walk the provider, the fsync engine and the search panel all share. O(depth) map hits when the facade has the by-name table, O(depth × children) else. */
export function resolveFacadePath(facade: PageFacade, segments: readonly string[]): PageFacadeEntry | undefined {
  let parentId: string | null = null;
  let found: PageFacadeEntry | undefined;
  for (const segment of segments) {
    found = facadeChildByName(facade, parentId, segment);
    if (!found) return undefined;
    parentId = found.id;
  }
  return found;
}

/** The parent of the last segment of `path`, walking directories only. O(depth). */
function parentOf(facade: PageFacade, path: VPath): { parentId: string | null; name: string } {
  if (path.segments.length === 0) throw fsError("IsADirectory", path.uri, "the mount root");
  let parentId: string | null = null;
  for (const segment of path.segments.slice(0, -1)) {
    const dir = facadeChildByName(facade, parentId, segment);
    if (!dir) throw fsError("NotFound", path.uri, "missing parent");
    if (dir.kind !== "dir") throw fsError("NotADirectory", path.uri);
    parentId = dir.id;
  }
  return { parentId, name: path.segments[path.segments.length - 1] };
}
/** A name the page tree cannot hold verbatim is refused, never mangled. */
function assertRepresentable(facade: PageFacade, name: string, uri: string): void {
  if (facade.toSegment(name) !== name) throw fsError("Unsupported", uri, "name not representable as a page title");
}
function entryAt(facade: PageFacade, path: VPath): PageFacadeEntry {
  const entry = resolveFacadePath(facade, path.segments);
  if (!entry) throw fsError("NotFound", path.uri);
  return entry;
}
async function statOf(facade: PageFacade, path: VPath): Promise<FsStat> {
  if (path.segments.length === 0) return { kind: "dir", sizeBytes: 0, mtimeMs: null, readOnly: false };
  const entry = entryAt(facade, path);
  const sizeBytes = entry.kind !== "file" ? 0 : entry.sizeBytes ?? textToBytes(await facade.readContent(entry.id)).length;
  return { kind: entry.kind, mtimeMs: entry.mtimeMs, readOnly: false, sizeBytes };
}
/** The directory's entries, name-deduped (first wins) and name-sorted. O(children log children). */
async function listOf(facade: PageFacade, path: VPath): Promise<ListedEntry[]> {
  let parentId: string | null = null;
  if (path.segments.length > 0) {
    const entry = entryAt(facade, path);
    if (entry.kind !== "dir") throw fsError("NotADirectory", path.uri);
    parentId = entry.id;
  }
  const seen = new Set<string>();
  const entries: ListedEntry[] = [];
  for (const page of facadeChildren(facade, parentId)) {
    const name = nameOf(facade, page);
    if (seen.has(name)) continue; // title-collision: deterministic first-wins
    seen.add(name);
    entries.push({ name, kind: page.kind });
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
async function readOf(facade: PageFacade, path: VPath, opts?: ReadOptions): Promise<ReadableStream<Uint8Array>> {
  const entry = entryAt(facade, path);
  if (entry.kind !== "file") throw fsError("IsADirectory", path.uri);
  return bytesToStream(textToBytes(await facade.readContent(entry.id)), opts?.offset ?? 0, opts?.length);
}
async function writeOf(facade: PageFacade, path: VPath, data: ReadableStream<Uint8Array> | Uint8Array, opts?: WriteOptions): Promise<void> {
  const { parentId, name } = parentOf(facade, path);
  const existing = facadeChildByName(facade, parentId, name);
  if (existing?.kind === "dir") throw fsError("IsADirectory", path.uri);
  if (existing && opts?.overwrite === false) throw fsError("AlreadyExists", path.uri);
  if (!existing && opts?.create === false) throw fsError("NotFound", path.uri);
  const text = new TextDecoder().decode(await collectBytes(data));
  if (existing) return facade.writeContent(existing.id, text);
  assertRepresentable(facade, name, path.uri);
  // A writer racing us between lookup and create (the data stream read is the window) makes the loser overwrite, unless exclusive.
  try { await facade.create({ title: name, parentId, kind: "file", content: text }); } catch (error) {
    const raced = isFsError(error) && error.code === "AlreadyExists" ? facadeChildByName(facade, parentId, name) : undefined;
    if (raced?.kind !== "file" || opts?.overwrite === false) throw error;
    await facade.writeContent(raced.id, text);
  }
}
async function mkdirOf(facade: PageFacade, path: VPath): Promise<void> {
  const { parentId, name } = parentOf(facade, path);
  if (facadeChildByName(facade, parentId, name)) throw fsError("AlreadyExists", path.uri);
  assertRepresentable(facade, name, path.uri);
  await facade.create({ title: name, parentId, kind: "dir" });
}
async function deleteOf(facade: PageFacade, path: VPath, opts?: { recursive?: boolean }): Promise<void> {
  const entry = entryAt(facade, path);
  if (entry.kind === "dir" && facadeChildren(facade, entry.id).length > 0 && !opts?.recursive) throw fsError("NotEmpty", path.uri);
  await facade.archive(entry.id);
}
async function renameOf(facade: PageFacade, from: VPath, to: VPath, opts?: { overwrite?: boolean }): Promise<void> {
  const entry = entryAt(facade, from);
  const target = parentOf(facade, to);
  const existing = facadeChildByName(facade, target.parentId, target.name);
  if (existing && existing.id !== entry.id) {
    if (!opts?.overwrite) throw fsError("AlreadyExists", to.uri);
    if (existing.kind !== "file" || entry.kind !== "file") throw fsError("AlreadyExists", to.uri, "only file-onto-file overwrite");
    await facade.archive(existing.id);
  }
  assertRepresentable(facade, target.name, to.uri);
  if (entry.parentId !== target.parentId) await facade.move(entry.id, target.parentId);
  if (facade.toSegment(entry.title) !== target.name) await facade.rename(entry.id, target.name);
}
/** One coarse event per change: WatchEvent has no "changed" type and the facade never says WHAT changed, so every change reads as a write. */
function watchOf(facade: PageFacade, path: VPath, onEvent: (event: WatchEvent) => void, signal: AbortSignal): Promise<void> {
  const off = facade.subscribe?.(() => onEvent({ type: "write", path, coalesced: 1 }));
  return new Promise<void>((resolve) => signal.addEventListener("abort", () => { off?.(); resolve(); }, { once: true }));
}

/** The page-backed provider: the workspace-default mount (ADR-001 addendum): offline-capable, ACL'd, synced, POSIX-style. */
export function createPageProvider(scheme: string, facade: PageFacade): FsProvider {
  return {
    scheme,
    capabilities: () => ({
      caseSensitivity: facade.caseSensitivity ?? "sensitive", symlinks: false, hardlinks: false, atomicRename: true,
      watch: "poll", pollIntervalMs: 1000, maxNameBytes: 512, maxPathBytes: 8192,
      unicodeForm: "opaque-bytes", streamingReads: true, permissionsModel: "none", sparse: false, xattrs: false,
    }),
    stat: (path) => statOf(facade, path),
    list: (path) => listOf(facade, path),
    read: (path, opts) => readOf(facade, path, opts),
    write: (path, data, opts) => writeOf(facade, path, data, opts),
    mkdir: (path) => mkdirOf(facade, path),
    delete: (path, opts) => deleteOf(facade, path, opts),
    rename: (from, to, opts) => renameOf(facade, from, to, opts),
    watch: (path, onEvent, signal) => watchOf(facade, path, onEvent, signal),
    async close() { /* stateless over the facade */ },
  };
}
