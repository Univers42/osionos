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
  recordSyncedHash(workspaceId, relPath, hash);
  return () => {
    if (syncedHashOf(workspaceId, relPath) !== hash) return; // superseded since: keep the newer agreement
    if (previous === null) clearSyncedHash(workspaceId, relPath);
    else recordSyncedHash(workspaceId, relPath, previous);
  };
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
 */
export function decideInboundWrite(input: {
  inboundHash: string | null;
  isEcho: (hash: string) => boolean;
  localContent: string | null;
  localHash: string | null;
  inboundContent: string;
  lastSyncedHash: string | null;
}): InboundDecision {
  const { lastSyncedHash } = input;
  if (input.inboundHash && input.isEcho(input.inboundHash)) return { action: "echo" };
  if (input.localContent === null) return { action: "create" };
  // theirs === base: the file has not moved since the agreement, only the page has.
  // Nothing of the shell's is lost (its bytes ARE the base). Ours reaches the file
  // through the outbound writer for a block page; a code page, a failed writer run
  // (never retried) and a page whose body never loaded wait for the next attach.
  if (input.inboundHash !== null && lastSyncedHash !== null && input.inboundHash === lastSyncedHash) return { action: "ignore" };
  if (input.localContent === input.inboundContent) return { action: "ignore" };
  if (lastSyncedHash !== null && input.localHash === lastSyncedHash) return { action: "apply" };
  if (lastSyncedHash === null && input.localContent === "") return { action: "apply" };
  return { action: "conflict" };
}
