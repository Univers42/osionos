/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   memProvider.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError } from "./errors";
import { collectBytes, bytesToStream } from "./bytes";
import type { VPath } from "./vpath";
import type { FsProvider, FsStat, ListedEntry, WatchEvent } from "./types";

type MemFile = { kind: "file"; data: Uint8Array; mtimeMs: number };
type MemDir = { kind: "dir"; children: Map<string, MemNode>; mtimeMs: number };
type MemNode = MemFile | MemDir;
type Watcher = { prefix: string; emit: (event: WatchEvent) => void };

/** In-memory reference provider: full fidelity (case-sensitive, atomic rename,
 *  native watch) — exists so the abstraction is proven by more than one
 *  implementation and so the conformance corpus has a gold standard. */
export function createMemProvider(scheme = "mem"): FsProvider {
  const root: MemDir = { kind: "dir", children: new Map(), mtimeMs: Date.now() };
  const watchers = new Set<Watcher>();

  const notify = (type: WatchEvent["type"], path: VPath, renamedFrom?: VPath): void => {
    for (const watcher of watchers) {
      const inScope = watcher.prefix === "" || path.compareKey === watcher.prefix
        || path.compareKey.startsWith(`${watcher.prefix}/`);
      if (inScope) watcher.emit(renamedFrom ? { type, path, renamedFrom, coalesced: 1 } : { type, path, coalesced: 1 });
    }
  };

  const lookup = (path: VPath): MemNode | undefined => {
    let node: MemNode = root;
    for (const segment of path.segments) {
      if (node.kind !== "dir") return undefined;
      const next = node.children.get(segment);
      if (!next) return undefined;
      node = next;
    }
    return node;
  };

  const parentDirOf = (path: VPath): { dir: MemDir; name: string } => {
    if (path.segments.length === 0) throw fsError("IsADirectory", path.uri, "the mount root");
    let node: MemNode = root;
    for (const segment of path.segments.slice(0, -1)) {
      if (node.kind !== "dir") throw fsError("NotADirectory", path.uri);
      const next = node.children.get(segment);
      if (!next) throw fsError("NotFound", path.uri, "missing parent");
      node = next;
    }
    if (node.kind !== "dir") throw fsError("NotADirectory", path.uri);
    return { dir: node, name: path.segments[path.segments.length - 1] };
  };

  return {
    scheme,
    capabilities() {
      return {
        caseSensitivity: "sensitive", symlinks: false, hardlinks: false, atomicRename: true,
        watch: "native", maxNameBytes: 255, maxPathBytes: 4096, unicodeForm: "opaque-bytes",
        streamingReads: true, permissionsModel: "none", sparse: false, xattrs: false,
      };
    },
    async stat(path) {
      const node = lookup(path);
      if (!node) throw fsError("NotFound", path.uri);
      return {
        kind: node.kind, mtimeMs: node.mtimeMs, readOnly: false,
        sizeBytes: node.kind === "file" ? node.data.length : 0,
      } satisfies FsStat;
    },
    async list(path) {
      const node = lookup(path);
      if (!node) throw fsError("NotFound", path.uri);
      if (node.kind !== "dir") throw fsError("NotADirectory", path.uri);
      const entries: ListedEntry[] = [...node.children.entries()]
        .map(([name, child]) => ({ name, kind: child.kind }));
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return entries;
    },
    async read(path, opts) {
      const node = lookup(path);
      if (!node) throw fsError("NotFound", path.uri);
      if (node.kind !== "file") throw fsError("IsADirectory", path.uri);
      return bytesToStream(node.data, opts?.offset ?? 0, opts?.length);
    },
    async write(path, data, opts) {
      const { dir, name } = parentDirOf(path);
      const existing = dir.children.get(name);
      if (existing?.kind === "dir") throw fsError("IsADirectory", path.uri);
      if (existing && opts?.overwrite === false) throw fsError("AlreadyExists", path.uri);
      if (!existing && opts?.create === false) throw fsError("NotFound", path.uri);
      const bytes = await collectBytes(data);
      dir.children.set(name, { kind: "file", data: bytes, mtimeMs: Date.now() });
      dir.mtimeMs = Date.now();
      notify(existing ? "write" : "create", path);
    },
    async mkdir(path) {
      const { dir, name } = parentDirOf(path);
      if (dir.children.has(name)) throw fsError("AlreadyExists", path.uri);
      dir.children.set(name, { kind: "dir", children: new Map(), mtimeMs: Date.now() });
      notify("create", path);
    },
    async delete(path, opts) {
      const { dir, name } = parentDirOf(path);
      const node = dir.children.get(name);
      if (!node) throw fsError("NotFound", path.uri);
      if (node.kind === "dir" && node.children.size > 0 && !opts?.recursive) throw fsError("NotEmpty", path.uri);
      dir.children.delete(name);
      dir.mtimeMs = Date.now();
      notify("delete", path);
    },
    async rename(from, to, opts) {
      const source = parentDirOf(from);
      const node = source.dir.children.get(source.name);
      if (!node) throw fsError("NotFound", from.uri);
      const target = parentDirOf(to);
      const existing = target.dir.children.get(target.name);
      if (existing) {
        if (!opts?.overwrite) throw fsError("AlreadyExists", to.uri);
        if (existing.kind !== "file" || node.kind !== "file") throw fsError("AlreadyExists", to.uri, "only file-onto-file overwrite");
      }
      source.dir.children.delete(source.name);
      target.dir.children.set(target.name, node);
      node.mtimeMs = Date.now();
      notify("rename", to, from);
    },
    async watch(path, onEvent, signal) {
      const watcher: Watcher = { prefix: path.compareKey, emit: onEvent };
      watchers.add(watcher);
      return new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => { watchers.delete(watcher); resolve(); }, { once: true });
      });
    },
    async close() {
      watchers.clear();
    },
  };
}
