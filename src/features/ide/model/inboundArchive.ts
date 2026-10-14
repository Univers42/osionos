/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundArchive.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The end of a delete's window: archive only what the shell really removed.
// Everything here runs as a queued task (the timer only enqueues), so no event
// interleaves with the re-check.

import { isFsError } from "../vfs/errors";
import { buildVPath } from "../vfs/vpath";
import { sandboxHashes, type FsOpTransport } from "../vfs/sandboxFsOps";
import { ideOutput } from "./ideOutputBus";
import { clearSyncedHash, syncedHashOf } from "./ideSyncEngine";

import type { FsProvider } from "../vfs/types";
import type { ExecContext } from "./inboundExec";
import type { ArchiveTicket } from "./inboundPending";

/** What a sandbox `stat` told us; "unknown" (offline, refused) never archives. */
export type StatResult = "present" | "absent" | "unknown";

/** Only NotFound counts as gone: any other failure (offline, refused) is "unknown". */
export async function statInProvider(provider: FsProvider, workspaceId: string, path: string): Promise<StatResult> {
  try {
    await provider.stat(buildVPath(provider.scheme, workspaceId, path.split("/")));
    return "present";
  } catch (error) {
    return isFsError(error) && error.code === "NotFound" ? "absent" : "unknown";
  }
}

/** The hashes op as a stat: absent, or present (a file, a directory, an unreadable
 *  file). A path the bridge would refuse as a whole batch (`..`, a control
 *  character) is left out of the request and of the answer, so it is asked alone. */
export async function statManyInSandbox(transport: FsOpTransport, paths: readonly string[]): Promise<Map<string, StatResult>> {
  const asked = paths.filter((path) => path !== "" && !path.startsWith("/") && !path.includes("..") && !/[\n\r\t\0]/.test(path));
  const hashes = asked.length > 0 ? await sandboxHashes(transport, asked) : new Map<string, string | null>();
  return new Map(asked.map((path) => [path, hashes.get(path) === null ? "absent" : "present"]));
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * B1. Archive a due page only when its path is the one the delete named, the
 * sandbox says that path is gone, and — when the page has sub-pages — their
 * directory is gone too. `rm Roadmap.omd` alone must not cascade onto children
 * whose files are still there. A child create still deferred in the drain counts:
 * the batch is made first (C3b5 R4). Any doubt keeps the page; nothing throws.
 * O(1) plus at most two sandbox stats, plus the deferred batch.
 */
export async function archiveIfGone(ticket: ArchiveTicket, ctx: ExecContext): Promise<void> {
  if (!ctx.pending.claim(ticket)) return;
  try {
    await ctx.settle();
    const keep = await keepReason(ticket, ctx);
    if (keep === undefined) await archiveNow(ticket, ctx);
    else if (keep !== null) ideOutput("fs-sync", keep);
  } catch (error) {
    ideOutput("fs-sync", `${ticket.path}: the page was not archived — ${messageOf(error)}`);
  }
}

/** undefined = archive; null = keep quietly (moved, or the file came back); text = keep and say why. */
async function keepReason(ticket: ArchiveTicket, ctx: ExecContext): Promise<string | null | undefined> {
  if (!stillAt(ticket, ctx)) return null;
  const own = await ctx.stat(ticket.path);
  if (own === "present") return null;
  if (own === "unknown") return `${ticket.path}: could not confirm the delete in the sandbox; the page stays`;
  const childrenDir = ctx.view.childrenDirOf(ticket.pageId);
  if (childrenDir === undefined) return undefined;
  const children = await ctx.stat(childrenDir);
  if (children === "absent") return undefined;
  return children === "present"
    ? `${ticket.path}: deleted, but ${childrenDir}/ still holds its sub-pages; the page stays (delete that directory to archive it)`
    : `${ticket.path}: could not check ${childrenDir}/ in the sandbox; the page stays`;
}

function stillAt(ticket: ArchiveTicket, ctx: ExecContext): boolean {
  const state = ctx.view.pageState(ticket.pageId);
  return state?.status === "live" && state.path === ticket.path;
}

/** B2: the ledger forgets the path, the restore memory keeps its last agreed hash. */
async function archiveNow(ticket: ArchiveTicket, ctx: ExecContext): Promise<void> {
  const state = ctx.view.pageState(ticket.pageId);
  if (state?.status !== "live" || state.path !== ticket.path) return;
  const syncedHash = syncedHashOf(ctx.workspaceId, state.filePath);
  await ctx.facade.archive(ticket.pageId);
  clearSyncedHash(ctx.workspaceId, state.filePath);
  ctx.pending.rememberArchived(ticket.pageId, { syncedHash, path: state.path });
  ideOutput("fs-sync", `${ticket.path}: deleted in the shell — the page is in the trash`);
}
