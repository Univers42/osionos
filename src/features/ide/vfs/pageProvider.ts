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

import { fsError } from "./errors";
import { collectBytes, bytesToStream, textToBytes } from "./bytes";
import type { VPath } from "./vpath";
import type { FsProvider, ListedEntry } from "./types";

/** One page as the provider sees it — the osionos:// backend (a file IS a
 *  page). The facade is injected so the provider stays store-agnostic and
 *  node-testable; the real adapter wires usePageStore behind this shape. */
export type PageFacadeEntry = {
  id: string;
  title: string;
  parentId: string | null;
  kind: "file" | "dir";
  /** null = content not loaded yet (lazy pages) — stat loads on demand. */
  sizeBytes: number | null;
  mtimeMs: number;
};

export type PageFacade = {
  /** Every live (non-archived) IDE page in the workspace. */
  list(): PageFacadeEntry[];
  /** Load (or return cached) file content — lazy pages never load eagerly. */
  readContent(id: string): Promise<string>;
  create(input: { title: string; parentId: string | null; kind: "file" | "dir"; content?: string }): Promise<PageFacadeEntry>;
  writeContent(id: string, content: string): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  move(id: string, parentId: string | null): Promise<void>;
  /** Archive semantics — osionos "delete" is the trash, never a hard erase. */
  archive(id: string): Promise<void>;
  /** Title → path segment. Inject the ONE sanitizer (idePaths.sanitizeSegment)
   *  so this provider owns the title↔segment boundary without duplicating it. */
  toSegment(title: string): string;
};

/** Children of a parent page, deterministically ordered (title, then id). */
export function facadeChildren(facade: PageFacade, parentId: string | null): PageFacadeEntry[] {
  return facade.list()
    .filter((page) => page.parentId === parentId)
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : 1));
}

function facadeChildByName(facade: PageFacade, parentId: string | null, name: string): PageFacadeEntry | undefined {
  return facadeChildren(facade, parentId).find((page) => facade.toSegment(page.title) === name);
}

/** Resolve sanitized path segments to the page entry — the ONE walk the
 *  provider, the fsync engine and the search panel all share. */
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

/** The page-backed provider: the workspace-default mount (ADR-001 addendum) —
 *  offline-capable, ACL'd, synced, presented POSIX-style. */
export function createPageProvider(scheme: string, facade: PageFacade): FsProvider {
  const childrenOf = (parentId: string | null): PageFacadeEntry[] => facadeChildren(facade, parentId);
  const childByName = (parentId: string | null, name: string): PageFacadeEntry | undefined =>
    facadeChildByName(facade, parentId, name);
  const resolveEntry = (path: VPath): PageFacadeEntry | undefined => resolveFacadePath(facade, path.segments);

  const resolveParent = (path: VPath): { parentId: string | null; name: string } => {
    if (path.segments.length === 0) throw fsError("IsADirectory", path.uri, "the mount root");
    let parentId: string | null = null;
    for (const segment of path.segments.slice(0, -1)) {
      const dir = childByName(parentId, segment);
      if (!dir) throw fsError("NotFound", path.uri, "missing parent");
      if (dir.kind !== "dir") throw fsError("NotADirectory", path.uri);
      parentId = dir.id;
    }
    return { parentId, name: path.segments[path.segments.length - 1] };
  };

  const assertRepresentable = (name: string, uri: string): void => {
    if (facade.toSegment(name) !== name) throw fsError("Unsupported", uri, "name not representable as a page title");
  };

  return {
    scheme,
    capabilities() {
      return {
        caseSensitivity: "sensitive", symlinks: false, hardlinks: false, atomicRename: true,
        watch: "poll", pollIntervalMs: 1000, maxNameBytes: 512, maxPathBytes: 8192,
        unicodeForm: "opaque-bytes", streamingReads: true, permissionsModel: "none",
        sparse: false, xattrs: false,
      };
    },
    async stat(path) {
      if (path.segments.length === 0) return { kind: "dir", sizeBytes: 0, mtimeMs: null, readOnly: false };
      const entry = resolveEntry(path);
      if (!entry) throw fsError("NotFound", path.uri);
      const sizeBytes = entry.kind !== "file" ? 0
        : entry.sizeBytes ?? textToBytes(await facade.readContent(entry.id)).length;
      return { kind: entry.kind, mtimeMs: entry.mtimeMs, readOnly: false, sizeBytes };
    },
    async list(path) {
      let parentId: string | null = null;
      if (path.segments.length > 0) {
        const entry = resolveEntry(path);
        if (!entry) throw fsError("NotFound", path.uri);
        if (entry.kind !== "dir") throw fsError("NotADirectory", path.uri);
        parentId = entry.id;
      }
      const seen = new Set<string>();
      const entries: ListedEntry[] = [];
      for (const page of childrenOf(parentId)) {
        const name = facade.toSegment(page.title);
        if (seen.has(name)) continue; // title-collision: deterministic first-wins
        seen.add(name);
        entries.push({ name, kind: page.kind });
      }
      return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
    async read(path, opts) {
      const entry = resolveEntry(path);
      if (!entry) throw fsError("NotFound", path.uri);
      if (entry.kind !== "file") throw fsError("IsADirectory", path.uri);
      return bytesToStream(textToBytes(await facade.readContent(entry.id)), opts?.offset ?? 0, opts?.length);
    },
    async write(path, data, opts) {
      const { parentId, name } = resolveParent(path);
      const existing = childByName(parentId, name);
      if (existing?.kind === "dir") throw fsError("IsADirectory", path.uri);
      if (existing && opts?.overwrite === false) throw fsError("AlreadyExists", path.uri);
      if (!existing && opts?.create === false) throw fsError("NotFound", path.uri);
      const text = new TextDecoder().decode(await collectBytes(data));
      if (existing) await facade.writeContent(existing.id, text);
      else {
        assertRepresentable(name, path.uri);
        await facade.create({ title: name, parentId, kind: "file", content: text });
      }
    },
    async mkdir(path) {
      const { parentId, name } = resolveParent(path);
      if (childByName(parentId, name)) throw fsError("AlreadyExists", path.uri);
      assertRepresentable(name, path.uri);
      await facade.create({ title: name, parentId, kind: "dir" });
    },
    async delete(path, opts) {
      const entry = resolveEntry(path);
      if (!entry) throw fsError("NotFound", path.uri);
      if (entry.kind === "dir" && childrenOf(entry.id).length > 0 && !opts?.recursive) throw fsError("NotEmpty", path.uri);
      await facade.archive(entry.id);
    },
    async rename(from, to, opts) {
      const entry = resolveEntry(from);
      if (!entry) throw fsError("NotFound", from.uri);
      const target = resolveParent(to);
      const existing = childByName(target.parentId, target.name);
      if (existing && existing.id !== entry.id) {
        if (!opts?.overwrite) throw fsError("AlreadyExists", to.uri);
        if (existing.kind !== "file" || entry.kind !== "file") throw fsError("AlreadyExists", to.uri, "only file-onto-file overwrite");
        await facade.archive(existing.id);
      }
      assertRepresentable(target.name, to.uri);
      if (entry.parentId !== target.parentId) await facade.move(entry.id, target.parentId);
      if (facade.toSegment(entry.title) !== target.name) await facade.rename(entry.id, target.name);
    },
    async watch(_path, _onEvent, signal) {
      return new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
    async close() {
      /* stateless over the facade */
    },
  };
}
