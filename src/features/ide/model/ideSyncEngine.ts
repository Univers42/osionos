/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideSyncEngine.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { recordEditorHash } from "./ideFsEcho";
import { syncLedgerStore } from "./syncLedgerPersist";

// The three-way inbound-write decision (ADR-001 §7): a conflict is BOTH sides
// moving since the last agreed state — and it is SURFACED, never silently
// last-writer-wins. Pure decision + a ledger free of app imports (the ideFsEcho
// pattern) so the matrix unit-tests without the store or the socket.

// The ledger (relPath → content hash both sides last agreed on) is persisted per
// workspace by syncLedgerPersist and hydrated on first access, so a reload keeps
// its merge base instead of turning every differing file into a conflict.

export function recordSyncedHash(workspaceId: string, relPath: string, hash: string): void {
  syncLedgerStore().set(workspaceId, relPath, hash);
}

export function clearSyncedHash(workspaceId: string, relPath: string): void {
  syncLedgerStore().delete(workspaceId, relPath);
}

/** A directory renamed in the sandbox: every agreement under it follows. */
export function moveSyncedDir(workspaceId: string, fromDir: string, toDir: string): void {
  syncLedgerStore().moveDir(workspaceId, fromDir, toDir);
}

export function syncedHashOf(workspaceId: string, relPath: string): string | null {
  return syncLedgerStore().get(workspaceId, relPath) ?? null;
}

// Pages the inbound side archived because the shell deleted their files, with every
// descendant the store's archive cascades onto (inboundArchive archiveNow). The writer never
// removes their files: what is at those paths now, the shell put there, and a `git clone`
// over an `rm -rf` puts the same bytes back — an agreement left at a cascaded child's path
// matched them, and the writer deleted the clone (devil C1, 2026-10-14). The writer takes a
// mark when it skips that remove; a restore from the shell drops the marks of its subtree.
// In memory, in the tab that applies shell events, the only one whose writer removes
// (inboundPipeline leadsInbound): a reload starts the writer with no baseline.
// Ponytail: a mark the writer never takes stays until the tab reloads — a page restored from
// the trash in the app before any writer round, or one whose path a new page owned first
// (devil A5: its remove is never planned). Archiving such a page in the app later leaves its
// file in the sandbox: a leftover, never a loss. O(marks) memory, one id per shell delete.
const shellArchived = new Map<string, Set<string>>();

export function markShellArchived(workspaceId: string, pageIds: Iterable<string>): void {
  let marks = shellArchived.get(workspaceId);
  if (marks === undefined) shellArchived.set(workspaceId, (marks = new Set()));
  for (const id of pageIds) marks.add(id);
}

export function unmarkShellArchived(workspaceId: string, pageIds: Iterable<string>): void {
  const marks = shellArchived.get(workspaceId);
  if (marks !== undefined) for (const id of pageIds) marks.delete(id);
}

/** True once for a marked page; the mark is gone after. */
export function takeShellArchived(workspaceId: string, pageId: string): boolean {
  return shellArchived.get(workspaceId)?.delete(pageId) ?? false;
}

/**
 * The ONE bookkeeping for a write we push into the sandbox (ideFsWrite, the
 * attach reconcile): the echo hash, so the fs-agent's re-emission is suppressed,
 * and the ledger, so this content is the new agreed state. Call the returned
 * undo when the write fails: a ledger claiming agreement on content the sandbox
 * never got would later read the stale sandbox copy as a shell edit and import
 * it over the page.
 */
export function recordOutboundWrite(workspaceId: string, relPath: string, hash: string): () => void {
  const previous = syncedHashOf(workspaceId, relPath);
  recordEditorHash(hash);
  rememberOwnWrite(`${workspaceId}\0${relPath}`, hash);
  recordSyncedHash(workspaceId, relPath, hash);
  return () => {
    if (syncedHashOf(workspaceId, relPath) !== hash) return; // superseded since: keep the newer agreement
    if (previous === null) clearSyncedHash(workspaceId, relPath);
    else recordSyncedHash(workspaceId, relPath, previous);
  };
}

// Ponytail: the last OWN_WRITES_KEPT hashes per path, for the tab's life (no TTL, one
// entry per path ever written). A path written more often than that before an old
// write's fs event arrives forgets it, and inboundLanded may then apply that stale
// write over a newer shell save (C3b5 R5). Raise the count if the writer ever loops.
const OWN_WRITES_KEPT = 8;
const ownWrites = new Map<string, string[]>();

function rememberOwnWrite(key: string, hash: string): void {
  const kept = (ownWrites.get(key) ?? []).filter((seen) => seen !== hash);
  kept.push(hash);
  ownWrites.set(key, kept.slice(-OWN_WRITES_KEPT));
}

/** `hash` is a write of ours at `relPath` that the ledger has since moved past:
 *  its fs event is stale, whatever the page looks like now (C3b5 C3.3). O(kept). */
export function isStaleOwnWrite(workspaceId: string, relPath: string, hash: string): boolean {
  if (syncedHashOf(workspaceId, relPath) === hash) return false;
  return ownWrites.get(`${workspaceId}\0${relPath}`)?.includes(hash) ?? false;
}

export type InboundDecision =
  | { action: "echo" }
  | { action: "ignore" }
  | { action: "apply" }
  | { action: "create" }
  | { action: "conflict" };

/**
 * Decide what an inbound sandbox write means against the local page state.
 *   echo     — our own write bouncing back (suppressed upstream hash match)
 *   ignore   — contents already identical, or the file is still the agreed base
 *   create   — no local page exists yet (shell/git created a new file)
 *   apply    — local side unchanged since the last agreement → fast-forward
 *   conflict — BOTH sides changed → surface, never clobber
 * `agreedPageHash`: what the page hashed to right after the last inbound apply or
 * create at this path, while the ledger still holds that shell text (inboundLanded):
 * "ours unchanged since the agreement" also accepts it.
 */
export function decideInboundWrite(input: {
  inboundHash: string | null;
  isEcho: (hash: string) => boolean;
  localContent: string | null;
  localHash: string | null;
  inboundContent: string;
  lastSyncedHash: string | null;
  agreedPageHash?: string | null;
}): InboundDecision {
  const { lastSyncedHash, localHash } = input;
  const agreed = input.agreedPageHash ?? null;
  if (input.inboundHash && input.isEcho(input.inboundHash)) return { action: "echo" };
  if (input.localContent === null) return { action: "create" };
  // theirs === base: the file has not moved since the agreement, only the page has.
  // Nothing of the shell's is lost (its bytes ARE the base). Ours reaches the file
  // through the outbound writer for a block page; a code page, a failed writer run
  // (never retried) and a page whose body never loaded wait for the next attach.
  if (input.inboundHash !== null && lastSyncedHash !== null && input.inboundHash === lastSyncedHash) return { action: "ignore" };
  if (input.localContent === input.inboundContent) return { action: "ignore" };
  if (lastSyncedHash !== null && (localHash === lastSyncedHash || (agreed !== null && localHash === agreed))) return { action: "apply" };
  if (lastSyncedHash === null && input.localContent === "") return { action: "apply" };
  return { action: "conflict" };
}
