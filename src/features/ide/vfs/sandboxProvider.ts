/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sandboxProvider.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { fsError } from "./errors";
import { collectBytes, bytesToStream } from "./bytes";
import { buildVPath, type VPath } from "./vpath";
import type { FsProvider } from "./types";
import {
  outputOrThrow, parseListOutput, parseStatOutput, bytesToBase64, base64ToBytes,
  type FsOpTransport,
} from "./sandboxFsOps";

/** Generic change feed a host may inject (production: the fsync socket's event
 *  bus) — kept structural so the vfs layer never imports app modules. */
export type SandboxEventFeed = {
  subscribe(listener: (event: { event: string; path: string }) => void): () => void;
};

/** The sandbox:// provider — the remote POSIX tree behind the bridge exec ops
 *  (ADR-001: closes the write-only hole). The transport is injected: production
 *  = the bridge fetch; the conformance corpus = the SAME specs through a real
 *  local sh — so the semantics are proven without a live stack. With an event
 *  feed injected, watch() is native (one fsync socket, many watchers). */
export function createSandboxProvider(scheme: string, transport: FsOpTransport, events?: SandboxEventFeed): FsProvider {
  const rel = (path: VPath): string => {
    for (const segment of path.segments) {
      if (/[\n\r\t\0]/.test(segment)) {
        throw fsError("Unsupported", path.uri, "name not representable on this backend");
      }
    }
    return path.segments.join("/");
  };

  return {
    scheme,
    capabilities() {
      return {
        caseSensitivity: "sensitive", symlinks: true, hardlinks: false, atomicRename: true,
        watch: events ? "native" : "none", maxNameBytes: 255, maxPathBytes: 4096,
        unicodeForm: "opaque-bytes", streamingReads: true, permissionsModel: "posix",
        sparse: false, xattrs: false,
      };
    },
    async stat(path) {
      const result = await transport("stat", { path: rel(path) });
      const parsed = parseStatOutput(outputOrThrow(result, path.uri), path.uri);
      return { kind: parsed.kind, sizeBytes: parsed.sizeBytes, mtimeMs: parsed.mtimeMs, readOnly: false };
    },
    async list(path) {
      const result = await transport("list", { path: rel(path) });
      return parseListOutput(outputOrThrow(result, path.uri));
    },
    async read(path, opts) {
      const params = { path: rel(path), ...(opts?.offset !== undefined ? { offset: opts.offset } : {}), ...(opts?.length !== undefined ? { length: opts.length } : {}) };
      const result = await transport("read", params);
      return bytesToStream(base64ToBytes(outputOrThrow(result, path.uri)));
    },
    async write(path, data, opts) {
      if (path.segments.length === 0) throw fsError("IsADirectory", path.uri, "the mount root");
      if (opts?.overwrite === false || opts?.create === false) {
        const exists = await this.stat(path).then(() => true, () => false);
        if (exists && opts.overwrite === false) throw fsError("AlreadyExists", path.uri);
        if (!exists && opts.create === false) throw fsError("NotFound", path.uri);
      }
      const bytes = await collectBytes(data);
      const result = await transport("write", { path: rel(path), contentBase64: bytesToBase64(bytes) });
      outputOrThrow(result, path.uri);
    },
    async mkdir(path) {
      outputOrThrow(await transport("mkdir", { path: rel(path) }), path.uri);
    },
    async delete(path, opts) {
      outputOrThrow(await transport("delete", { path: rel(path), recursive: opts?.recursive === true }), path.uri);
    },
    async rename(from, to, opts) {
      const result = await transport("rename", { path: rel(from), to: rel(to), overwrite: opts?.overwrite === true });
      outputOrThrow(result, from.uri);
    },
    async watch(path, onEvent, signal) {
      const unsubscribe = events?.subscribe((raw) => {
        if (raw.event !== "write" && raw.event !== "delete") return;
        const segments = raw.path.split("/").filter(Boolean);
        const prefix = path.segments;
        if (segments.length < prefix.length) return;
        if (!prefix.every((name, i) => segments[i] === name)) return;
        try {
          onEvent({
            type: raw.event === "delete" ? "delete" : "write",
            path: buildVPath(scheme, path.authority, segments),
            coalesced: 1,
          });
        } catch {
          /* unrepresentable agent path — dropped, the fsync engine handles it */
        }
      });
      return new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => { unsubscribe?.(); resolve(); }, { once: true });
      });
    },
    async close() {
      /* transport-owned */
    },
  };
}
