// A folder on this computer as an FsProvider (devil verdict 2026-11-01 editor on disk, F7), over the
// node's socket. It runs only on the node's own page, so the tree and the editor treat the disk as
// any other filesystem while no byte of it passes through the app.
// Caveat: the node watches each folder separately (F12), and this provider has no signal for a
// collapsed one, so the folders it watches are the 128 listed last, not exactly the expanded ones.
import { baseFromVPath, encodeBase64, decodeBase64 } from "./diskBytes";
import { fsError } from "./errors";
import type { NodeFsClient } from "./nodeFsClient";
import type { FsCapabilities, FsEntryKind, FsProvider, FsStat, ListedEntry, ReadOptions, WatchEvent, WriteOptions } from "./types";
import type { VPath } from "./vpath";

export const DISK_SCHEME = "disk";
const CHUNK_BYTES = 512 * 1024;
const MAX_WATCHED_FOLDERS = 128;
// Version control's own folders: never shown, so never opened, edited or dragged by accident.
const HIDDEN_NAMES = new Set([".git", ".hg", ".svn"]);

const CAPABILITIES: FsCapabilities = {
  caseSensitivity: "sensitive", symlinks: true, hardlinks: true, atomicRename: true, watch: "native",
  maxNameBytes: 255, maxPathBytes: 4096, unicodeForm: "opaque-bytes", streamingReads: false,
  permissionsModel: "posix", sparse: false, xattrs: false,
};

export type DiskProvider = FsProvider & {
  /** Saves over exactly the bytes `expect` hashes to; a different file answers DiskConflict. */
  saveOver(rel: string, bytes: Uint8Array, expect: string | "any"): Promise<void>;
  /** Follows one folder for an open file; the answer stops following it. */
  follow(rel: string, onChange: () => void): Promise<() => void>;
};

export function createDiskProvider(client: NodeFsClient, rootId: string): DiskProvider {
  const relOf = baseFromVPath;
  const listeners = new Set<(event: WatchEvent) => void>();
  const watched = new Map<string, { id: number; stop(): void }>();

  async function follow(rel: string, onChange: () => void): Promise<() => void> {
    const { watch } = await client.request("watch", { root: rootId, rel }) as unknown as { watch: number };
    const stopListening = client.onWatch(watch, onChange);
    return () => {
      stopListening();
      void client.request("unwatch", { watch }).catch(() => undefined);
    };
  }

  async function watchListed(path: VPath): Promise<void> {
    const rel = relOf(path);
    const known = watched.get(rel);
    if (known) {
      watched.delete(rel);
      watched.set(rel, known);
      return;
    }
    if (watched.size >= MAX_WATCHED_FOLDERS) {
      const [oldest, entry] = watched.entries().next().value as [string, { stop(): void }];
      watched.delete(oldest);
      entry.stop();
    }
    const stop = await follow(rel, () => {
      for (const listener of listeners) listener({ type: "write", path, coalesced: 1 });
    }).catch(() => null);
    if (stop) watched.set(rel, { id: 0, stop });
  }

  async function writeChunks(rel: string, bytes: Uint8Array, flags: { expect: string | null; create: boolean; overwrite: boolean }): Promise<void> {
    const total = bytes.length;
    let offset = 0;
    do {
      const data = encodeBase64(bytes.subarray(offset, offset + CHUNK_BYTES));
      await client.request("write", { root: rootId, rel, data, offset, total, ...flags });
      offset += CHUNK_BYTES;
    } while (offset < total);
  }

  async function readAll(rel: string): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let offset = 0;
    for (;;) {
      const answer = await client.request("read", { root: rootId, rel, offset, length: CHUNK_BYTES }) as unknown as { data: string; size: number };
      const chunk = decodeBase64(answer.data);
      chunks.push(chunk);
      offset += chunk.length;
      if (offset >= answer.size || chunk.length === 0) break;
    }
    const all = new Uint8Array(offset);
    let at = 0;
    for (const chunk of chunks) { all.set(chunk, at); at += chunk.length; }
    return all;
  }

  return {
    scheme: DISK_SCHEME,
    capabilities: () => CAPABILITIES,
    async stat(path) {
      const info = await client.request("stat", { root: rootId, rel: relOf(path) }) as unknown as { kind: FsEntryKind; size: number; mtimeMs: number };
      return { kind: info.kind, sizeBytes: info.size, mtimeMs: info.mtimeMs, readOnly: false } satisfies FsStat;
    },
    async list(path) {
      const { entries } = await client.request("list", { root: rootId, rel: relOf(path) }) as unknown as { entries: ListedEntry[] };
      void watchListed(path);
      return entries.filter((entry) => !HIDDEN_NAMES.has(entry.name));
    },
    async read(path, opts?: ReadOptions) {
      if (opts?.offset !== undefined || opts?.length !== undefined) throw fsError("Unsupported", path.uri, "ranged reads are not needed by the tree");
      const bytes = await readAll(relOf(path));
      return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    },
    async write(path, data, opts?: WriteOptions) {
      if (!(data instanceof Uint8Array)) throw fsError("Unsupported", path.uri, "the disk takes whole files");
      await writeChunks(relOf(path), data, { expect: opts?.overwrite === false ? null : "any", create: opts?.create ?? true, overwrite: opts?.overwrite ?? true });
    },
    async mkdir(path) { await client.request("mkdir", { root: rootId, rel: relOf(path) }); },
    async delete(path, opts) { await client.request("delete", { root: rootId, rel: relOf(path), recursive: opts?.recursive ?? false }); },
    async rename(from, to, opts) { await client.request("rename", { root: rootId, rel: relOf(from), to: relOf(to), overwrite: opts?.overwrite ?? false }); },
    watch(_path, onEvent, signal) {
      listeners.add(onEvent);
      return new Promise((resolve) => {
        signal.addEventListener("abort", () => { listeners.delete(onEvent); resolve(); }, { once: true });
      });
    },
    async close() {
      for (const entry of watched.values()) entry.stop();
      watched.clear();
    },
    saveOver: (rel, bytes, expect) => writeChunks(rel, bytes, { expect, create: false, overwrite: true }),
    follow,
  };
}
