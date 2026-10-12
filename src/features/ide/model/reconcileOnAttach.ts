/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   reconcileOnAttach.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { isFsError } from "../vfs/errors";
import { collectBytes, textToBytes } from "../vfs/bytes";
import { buildVPath, type VPath } from "../vfs/vpath";
import type { FsProvider } from "../vfs/types";
import { sha16 } from "./ideFsEcho";
import { recordOutboundWrite, recordSyncedHash, syncedHashOf } from "./ideSyncEngine";

// Attach-time three-way reconcile between a desired file set (ours) and what a
// provider already holds (theirs), against the sync ledger (the last content
// both sides agreed on). It replaces the blind push that overwrote shell edits
// made while the app was closed. Generic: it knows paths and text, not pages.
// Files the provider holds that are not desired are never touched.
//
// Cost for N desired files of B total bytes: O(N) provider calls (one ranged
// read, at most one write, parent mkdirs memoized per run), O(B) hashing, at
// most `maxConcurrent` files in flight; memory O(B) because the inbound and
// conflicting copies are returned to the caller.

// Ponytail: files past the 500th (in desired order) and files over 512 KiB on
// either side are skipped, not reconciled: a shell edit to one is neither
// imported nor overwritten until the caps move. Both surface in `skipped`.
export const MAX_ATTACH_FILES = 500;
export const MAX_ATTACH_FILE_BYTES = 512 * 1024;
export const ATTACH_FILE_CAP_REASON = `past the ${MAX_ATTACH_FILES}-file attach cap, not reconciled`;
const BYTE_CAP = `${MAX_ATTACH_FILE_BYTES / 1024} KiB`;
// Ponytail: 8 parallel files is a guess at what the bridge's exec ops absorb,
// not a measurement; callers with a better number pass maxConcurrent.
const DEFAULT_MAX_CONCURRENT = 8;

export type DesiredFile = { path: string; content: string };
export type TiebreakSide = "ours" | "theirs" | null;

export type ReconcileOptions = {
  workspaceId: string;
  desired: readonly DesiredFile[];
  provider: FsProvider;
  /** Content hash; must match the ledger's (default sha16, the fs-agent's). */
  hash?: (content: string) => Promise<string>;
  /** Consulted only when the ledger has no entry and both sides differ. */
  tiebreak?: (path: string, theirs: string) => TiebreakSide;
  maxConcurrent?: number;
};

export type ReconcileReport = {
  /** Ours written to the provider; the ledger now records it. */
  written: string[];
  /** Already identical on both sides; only the ledger was refreshed. */
  recorded: string[];
  /** Only the provider side changed: nothing written, ledger untouched (the caller applies, then records). */
  inbound: { path: string; content: string }[];
  /** Both sides changed, or no ledger and no tiebreak: nothing written. */
  conflicts: { path: string; ours: string; theirs: string }[];
  skipped: { path: string; reason: string }[];
};

type Verdict = "write" | "record" | "inbound" | "conflict";
type Run = { opts: ReconcileOptions; hash: (content: string) => Promise<string>; report: ReconcileReport; dirs: Map<string, Promise<void>> };
type Target = { relPath: string; path: VPath; bytes: Uint8Array; hash: string };

export const emptyReconcileReport = (): ReconcileReport =>
  ({ written: [], recorded: [], inbound: [], conflicts: [], skipped: [] });

/** The decision table. `theirsHash` null = the provider has no such file. */
function decideAttach(input: { oursHash: string; theirsHash: string | null; ledgerHash: string | null; tiebreak: () => TiebreakSide }): Verdict {
  // Absent despite a ledger entry: recreate, never archive — a wiped volume is not "delete all pages".
  if (input.theirsHash === null) return "write";
  if (input.theirsHash === input.oursHash) return "record";
  if (input.ledgerHash === input.theirsHash) return "write"; // only ours moved since the agreement
  if (input.ledgerHash === input.oursHash) return "inbound"; // only theirs moved (shell edit while away)
  if (input.ledgerHash !== null) return "conflict"; // both moved
  const side = input.tiebreak();
  return side === "ours" ? "write" : side === "theirs" ? "inbound" : "conflict";
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Theirs as text, or null when absent. A ranged read bounds the transfer. */
async function readTheirs(provider: FsProvider, path: VPath): Promise<string | null> {
  let bytes: Uint8Array;
  try {
    bytes = await collectBytes(await provider.read(path, { length: MAX_ATTACH_FILE_BYTES + 1 }));
  } catch (error) {
    if (isFsError(error) && error.code === "NotFound") return null;
    throw error;
  }
  if (bytes.length > MAX_ATTACH_FILE_BYTES) throw new Error(`sandbox copy over the ${BYTE_CAP} cap, not reconciled`);
  try {
    return strictUtf8.decode(bytes); // ignoreBOM keeps bytes ↔ text exact, so hashes match the fs-agent's
  } catch {
    throw new Error("sandbox copy is not UTF-8 text, not reconciled");
  }
}

/** mkdir once per directory per run; concurrent writers await the same call. */
function ensureDir(run: Run, dir: VPath): Promise<void> {
  let pending = run.dirs.get(dir.compareKey);
  if (!pending) {
    pending = run.opts.provider.mkdir(dir).catch((error: unknown) => {
      if (!(isFsError(error) && error.code === "AlreadyExists")) throw error;
    });
    run.dirs.set(dir.compareKey, pending);
  }
  return pending;
}

/** Write; on a missing parent, create the ancestors and retry once. */
async function writeCreatingParents(run: Run, path: VPath, bytes: Uint8Array): Promise<void> {
  try {
    await run.opts.provider.write(path, bytes);
    return;
  } catch (error) {
    if (!(isFsError(error) && error.code === "NotFound")) throw error;
  }
  for (let depth = 1; depth < path.segments.length; depth += 1) {
    await ensureDir(run, buildVPath(path.scheme, path.authority, path.segments.slice(0, depth)));
  }
  await run.opts.provider.write(path, bytes);
}

async function writeOurs(run: Run, target: Target): Promise<void> {
  const undo = recordOutboundWrite(run.opts.workspaceId, target.relPath, target.hash);
  try {
    await writeCreatingParents(run, target.path, target.bytes);
  } catch (error) {
    undo();
    throw error;
  }
  run.report.written.push(target.relPath);
}

/** Classify one file and act on it; every failure becomes a `skipped` entry. */
async function reconcileFile(run: Run, file: DesiredFile): Promise<void> {
  const { opts, report } = run;
  try {
    const path = buildVPath(opts.provider.scheme, opts.workspaceId, file.path.split("/"));
    const bytes = textToBytes(file.content);
    if (bytes.length > MAX_ATTACH_FILE_BYTES) throw new Error(`over the ${BYTE_CAP} cap, not reconciled`);
    const theirs = await readTheirs(opts.provider, path);
    const target: Target = { relPath: file.path, path, bytes, hash: await run.hash(file.content) };
    const verdict = decideAttach({
      oursHash: target.hash,
      theirsHash: theirs === null ? null : await run.hash(theirs),
      ledgerHash: syncedHashOf(opts.workspaceId, file.path),
      tiebreak: () => (theirs === null ? null : opts.tiebreak?.(file.path, theirs) ?? null),
    });
    if (verdict === "write") await writeOurs(run, target);
    else if (verdict === "record") {
      recordSyncedHash(opts.workspaceId, file.path, target.hash);
      report.recorded.push(file.path);
    } else if (theirs !== null) {
      if (verdict === "inbound") report.inbound.push({ path: file.path, content: theirs });
      else report.conflicts.push({ path: file.path, ours: file.content, theirs });
    }
  } catch (error) {
    report.skipped.push({ path: file.path, reason: error instanceof Error ? error.message : String(error) });
  }
}

/** Run `worker` over `items` with at most `limit` in flight. */
async function runBounded<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/** Reconcile `desired` into `provider` (see the file header for the rules). */
export async function reconcileOnAttach(opts: ReconcileOptions): Promise<ReconcileReport> {
  const run: Run = { opts, hash: opts.hash ?? sha16, report: emptyReconcileReport(), dirs: new Map() };
  const seen = new Set<string>();
  const accepted: DesiredFile[] = [];
  for (const file of opts.desired) {
    if (seen.has(file.path)) run.report.skipped.push({ path: file.path, reason: "duplicate path, first entry wins" });
    else if (accepted.length >= MAX_ATTACH_FILES) run.report.skipped.push({ path: file.path, reason: ATTACH_FILE_CAP_REASON });
    else {
      seen.add(file.path);
      accepted.push(file);
    }
  }
  const limit = opts.maxConcurrent !== undefined && opts.maxConcurrent >= 1 ? Math.floor(opts.maxConcurrent) : DEFAULT_MAX_CONCURRENT;
  await runBounded(accepted, limit, (file) => reconcileFile(run, file));
  return run.report;
}
