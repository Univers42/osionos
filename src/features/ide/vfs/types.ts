/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { VPath } from "./vpath";

export type FsEntryKind = "file" | "dir" | "symlink" | "other";

export type FsStat = {
  kind: FsEntryKind;
  sizeBytes: number;
  /** null when the backend cannot report a timestamp. */
  mtimeMs: number | null;
  readOnly: boolean;
  /** Symlink target in the provider's native form, when kind === "symlink". */
  target?: string;
};

/** Queried, never assumed (ADR-001 §3) — consumers branch on THIS, not on the
 *  provider's identity. */
export type FsCapabilities = {
  caseSensitivity: "sensitive" | "insensitive-preserving" | "insensitive";
  symlinks: boolean;
  hardlinks: boolean;
  atomicRename: boolean;
  /** "poll"/"none" providers still satisfy watch(); pollIntervalMs is the
   *  provider's honest suggestion so the UI can degrade visibly. */
  watch: "native" | "poll" | "none";
  pollIntervalMs?: number;
  maxNameBytes: number;
  maxPathBytes: number;
  unicodeForm: "nfc" | "nfd" | "opaque-bytes";
  streamingReads: boolean;
  permissionsModel: "posix" | "readonly" | "none";
  sparse: boolean;
  xattrs: boolean;
};

export type WatchEvent = {
  type: "create" | "write" | "delete" | "rename";
  path: VPath;
  renamedFrom?: VPath;
  /** Coalesced event count folded into this one (>= 1). */
  coalesced: number;
};

export type ReadOptions = { offset?: number; length?: number; signal?: AbortSignal };
/** Defaults are POSIX truncate-create: { create: true, overwrite: true }. */
export type WriteOptions = { create?: boolean; overwrite?: boolean; signal?: AbortSignal };
export type ListedEntry = { name: string; kind: FsEntryKind };

/** The whole provider contract (ADR-001). Adding a backend = implementing
 *  this and passing the conformance corpus — zero consumer changes. */
export type FsProvider = {
  readonly scheme: string;
  capabilities(): FsCapabilities;
  stat(path: VPath, signal?: AbortSignal): Promise<FsStat>;
  list(path: VPath, signal?: AbortSignal): Promise<ListedEntry[]>;
  /** Ranged + streaming: a 4 GB file must never be materialized whole. */
  read(path: VPath, opts?: ReadOptions): Promise<ReadableStream<Uint8Array>>;
  write(path: VPath, data: ReadableStream<Uint8Array> | Uint8Array, opts?: WriteOptions): Promise<void>;
  mkdir(path: VPath, signal?: AbortSignal): Promise<void>;
  delete(path: VPath, opts?: { recursive?: boolean; signal?: AbortSignal }): Promise<void>;
  rename(from: VPath, to: VPath, opts?: { overwrite?: boolean; signal?: AbortSignal }): Promise<void>;
  /** Long-lived; resolves when `signal` aborts. Events coalesce per capabilities. */
  watch(path: VPath, onEvent: (event: WatchEvent) => void, signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
};

export type MountTable = {
  resolve(uri: string): { provider: FsProvider; path: VPath };
  mounts(): ReadonlyArray<{ scheme: string; authority: string; provider: FsProvider }>;
};
