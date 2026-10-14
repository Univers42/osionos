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
import { clearSyncedHash, markShellArchived, recordSyncedHash, syncedHashOf, unmarkShellArchived } from "./ideSyncEngine";

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
  const state = ctx.view.pageState(ticket.pageId);
  if (state?.status !== "live" || state.path !== ticket.path) return null;
  const own = await (state.isFolder ? ctx.statDir : ctx.stat)(ticket.path);
  if (own === "present") return null;
  if (own === "unknown") return `${ticket.path}: could not confirm the delete in the sandbox; the page stays`;
  const childrenDir = ctx.view.childrenDirOf(ticket.pageId);
  if (childrenDir === undefined) return undefined;
  const children = await ctx.statDir(childrenDir);
  if (children === "absent") return undefined;
  return children === "present"
    ? `${ticket.path}: deleted, but ${childrenDir}/ still holds its sub-pages; the page stays (delete that directory to archive it)`
    : `${ticket.path}: could not check ${childrenDir}/ in the sandbox; the page stays`;
}

/**
 * B2: the ledger forgets the path, the restore memory keeps its last agreed hash.
 * Both happen BEFORE the store is asked, so no writer round can see the page archived
 * first: the page and every page under it — the store's archive cascades onto children
 * whose own check kept them — are marked as deleted in the shell, which the writer never
 * removes (outboundRun), since `git clone` puts the same bytes back at the same paths. The
 * store toasts a failed archive and keeps the pages (pageStore.actions applyCascadeOperation):
 * every page still live afterwards loses its mark, and a root still live gets its
 * agreement back while Output says the archive did not happen.
 * Caveat: only the root's agreement is cleared; a cascaded child keeps its own. A clone of
 * that child's bytes within 15 s of the editor saving the same bytes (ideFsEcho ECHO_TTL_MS)
 * reads as an echo: the file is in the sandbox but has no page until the next attach.
 */
async function archiveNow(ticket: ArchiveTicket, ctx: ExecContext): Promise<void> {
  const state = ctx.view.pageState(ticket.pageId);
  if (state?.status !== "live" || state.path !== ticket.path) return;
  const syncedHash = syncedHashOf(ctx.workspaceId, state.filePath);
  const subtree = ctx.view.subtreeOf(ticket.pageId);
  clearSyncedHash(ctx.workspaceId, state.filePath);
  markShellArchived(ctx.workspaceId, subtree);
  await ctx.facade.archive(ticket.pageId);
  unmarkShellArchived(ctx.workspaceId, subtree.filter((id) => ctx.view.pageState(id)?.status === "live"));
  if (ctx.view.pageState(ticket.pageId)?.status === "live") {
    if (syncedHash !== null && syncedHashOf(ctx.workspaceId, state.filePath) === null) {
      recordSyncedHash(ctx.workspaceId, state.filePath, syncedHash);
    }
    ideOutput("fs-sync", `${ticket.path}: deleted in the shell, but the page could not be moved to the trash; it stays`);
    return;
  }
  ctx.pending.rememberArchived(ticket.pageId, { syncedHash, path: state.path });
  ideOutput("fs-sync", `${ticket.path}: deleted in the shell — the page is in the trash`);
}
