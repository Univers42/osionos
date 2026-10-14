/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundArchive.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
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
import type { LivePage } from "./inboundPlan";

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
 * At most two sandbox stats plus the deferred batch, and O(subtree) ledger work to archive.
 */
export async function archiveIfGone(ticket: ArchiveTicket, ctx: ExecContext): Promise<void> {
  if (!ctx.pending.claim(ticket)) return;
  try {
    await ctx.settle();
    if (awaitsAncestorArchive(ticket, ctx)) {
      ctx.pending.schedule(ticket.pageId, ticket.path, (next) => archiveIfGone(next, ctx));
      return;
    }
    const keep = await keepReason(ticket, ctx);
    if (keep === undefined) await archiveNow(ticket, ctx);
    else if (keep !== null) ideOutput("fs-sync", keep);
  } catch (error) {
    ideOutput("fs-sync", `${ticket.path}: the page was not archived — ${messageOf(error)}`);
  }
}

/**
 * `rm -rf` deletes bottom-up, so every page under a removed folder came due before the folder
 * and was archived alone: ~840 PATCHes at ~21/s held the serial queue, and a file created
 * right after waited 9.9 s to become a page (C5 run 4, 2026-10-14). A page with a live
 * ancestor whose own delete is still pending waits one more window instead: that archive
 * cascades onto the whole subtree in one request (archiveNow cancels the waiting tickets),
 * and when that ancestor is kept, the page is checked alone as before. O(depth).
 * An ancestor this user may not delete stops the walk: the server's cascade stops there too
 * (another member's page), so a page under it is checked alone (devil C1 on 3bb4956).
 * Ponytail: only an ancestor whose delete has ARRIVED counts. A tree whose `rm` outlasts the
 * window archives its earliest-deleted pages one by one; an ancestor deleted again and again
 * (a loop) keeps its subtree waiting, a window per round. A cascade over more than 50 pages
 * is not atomic on the server: a partial one leaves pages live, and those fall back to their
 * own checks, page by page (estimated at most 1.3% of runs at N=840, not measured).
 */
function awaitsAncestorArchive(ticket: ArchiveTicket, ctx: ExecContext): boolean {
  const state = placeOf(ctx, ticket.pageId)?.state;
  if (state === undefined || state.path !== ticket.path) return false;
  const seen = new Set<string>();
  for (let id = state.parentId; id !== undefined && !seen.has(id);) {
    if (!ctx.view.canDelete(id)) return false;
    if (ctx.pending.hasOwn(id)) return true;
    seen.add(id);
    const parent = ctx.view.pageState(id);
    id = parent?.status === "live" ? parent.parentId : undefined;
  }
  return false;
}

/** undefined = archive; null = keep quietly (moved, or the file came back); text = keep and say why. */
async function keepReason(ticket: ArchiveTicket, ctx: ExecContext): Promise<string | null | undefined> {
  const place = placeOf(ctx, ticket.pageId);
  if (place === undefined || place.state.path !== ticket.path) return null;
  const own = await (place.state.isFolder ? ctx.statDir : ctx.stat)(ticket.path);
  if (own === "present") return null;
  if (own === "unknown") return `${ticket.path}: could not confirm the delete in the sandbox; the page stays`;
  const { childrenDir } = place;
  if (childrenDir === undefined) return undefined;
  const children = await ctx.statDir(childrenDir);
  if (children === "absent") return undefined;
  return children === "present"
    ? `${ticket.path}: deleted, but ${childrenDir}/ still holds its sub-pages; the page stays (delete that directory to archive it)`
    : `${ticket.path}: could not check ${childrenDir}/ in the sandbox; the page stays`;
}

/**
 * B2: every page under the root and the root itself lose their agreement and are marked as
 * deleted in the shell BEFORE the store is asked, so no writer round can see one archived
 * first: the store's archive cascades onto children whose own check kept them, the writer
 * never removes a marked page (outboundRun), and with no agreement left it never removes the
 * same bytes a `git clone` puts back at the same path, nor skips writing a child restored in
 * the app (devil A6). The store toasts a failed archive and keeps the pages (pageStore.actions
 * applyCascadeOperation), or throws: either way every page still live gets its mark and its
 * agreement back, and Output says the archive did not happen. The root's hash is remembered
 * for a restore from the shell.
 * Ponytail: a clone of a cascaded child's bytes within 15 s of the editor saving the same
 * bytes (ideFsEcho ECHO_TTL_MS) reads as an echo: the file is in the sandbox but has no page
 * until the shell writes it again (an attach adopts no file, reconcileOnAttach).
 */
async function archiveNow(ticket: ArchiveTicket, ctx: ExecContext): Promise<void> {
  const place = placeOf(ctx, ticket.pageId);
  if (place === undefined || place.state.path !== ticket.path) return;
  const syncedHash = place.syncedHash !== undefined ? place.syncedHash : syncedHashOf(ctx.workspaceId, place.state.filePath);
  const held = holdSubtree(ctx, ctx.view.subtreeOf(ticket.pageId));
  try {
    await ctx.facade.archive(ticket.pageId);
  } finally {
    giveBackLive(ctx, held);
  }
  if (ctx.view.pageState(ticket.pageId)?.status !== "archived") {
    ideOutput("fs-sync", `${ticket.path}: deleted in the shell, but the page could not be moved to the trash; it stays`);
    return;
  }
  // What the store shows archived after the cascade: no waiting ticket of it may run, and each
  // page is restorable from the shell as if archived alone. The root goes last, the LRU's newest. A page the
  // server left live (another member's, or skipped) keeps its ticket and its own check.
  for (const page of held) {
    if (page.pageId === ticket.pageId) continue;
    const now = ctx.view.pageState(page.pageId);
    if (now === undefined) detachedOf(ctx).set(page.pageId, page);
    if (now?.status !== "archived") continue;
    ctx.pending.cancel(page.pageId);
    ctx.pending.rememberArchived(page.pageId, { syncedHash: page.syncedHash, path: page.state.path });
  }
  ctx.pending.rememberArchived(ticket.pageId, { syncedHash, path: place.state.path });
  ideOutput("fs-sync", `${ticket.path}: deleted in the shell — the page is in the trash`);
}

/** `syncedHash` only on a detached page: its agreement then, kept here and not in the ledger. */
type Place = { state: LivePage; childrenDir: string | undefined; syncedHash?: string | null };
type HeldPage = Place & { pageId: string; syncedHash: string | null };

/**
 * A folder's cascade stops at a page the server refuses (another member's) or skips, and keeps
 * it live; under an archived parent it has no place in the view (pageState undefined), so its
 * own check kept it quietly and the shell's delete was lost (devil C1 on 3bb4956, probe P-C).
 * Such a page is checked at the place it had when its parent was archived. Its agreement stays
 * in its entry, never back in the ledger: that is keyed by path and outlives this tab's writer,
 * so a new page made at the path later would have read it as a match and overwritten a file
 * holding the old page's bytes (devil C5, 2026-10-14). Per pending set.
 * Ponytail: only the page itself; its own sub-pages are archived by its cascade, not each
 * remembered for a restore from the shell. An entry outlives a page restored or archived
 * elsewhere only until that page's next check (placeOf drops it).
 */
const detachedByPending = new WeakMap<object, Map<string, HeldPage>>();

function detachedOf(ctx: ExecContext): Map<string, HeldPage> {
  let detached = detachedByPending.get(ctx.pending);
  if (detached === undefined) {
    detached = new Map();
    detachedByPending.set(ctx.pending, detached);
  }
  return detached;
}

/** Live in the view, or detached (above); undefined when archived, unknown or out of reach. */
function placeOf(ctx: ExecContext, pageId: string): Place | undefined {
  const state = ctx.view.pageState(pageId);
  if (state !== undefined) detachedOf(ctx).delete(pageId);
  if (state?.status === "live") return { state, childrenDir: ctx.view.childrenDirOf(pageId) };
  return state === undefined ? detachedOf(ctx).get(pageId) : undefined;
}

type Held = HeldPage[];

function holdSubtree(ctx: ExecContext, pageIds: readonly string[]): Held {
  const held: Held = [];
  for (const pageId of pageIds) {
    const place = placeOf(ctx, pageId);
    if (place === undefined) continue;
    held.push({ ...place, pageId, syncedHash: syncedHashOf(ctx.workspaceId, place.state.filePath) });
    clearSyncedHash(ctx.workspaceId, place.state.filePath);
  }
  markShellArchived(ctx.workspaceId, held.map(({ pageId }) => pageId));
  return held;
}

/** A page the store kept: its mark goes, and when it is live in the view its agreement comes
 *  back unless one was recorded meanwhile (a detached one keeps it in its entry, above). */
function giveBackLive(ctx: ExecContext, held: Held): void {
  const kept = held.filter(({ pageId }) => ctx.view.pageState(pageId)?.status !== "archived");
  unmarkShellArchived(ctx.workspaceId, kept.map(({ pageId }) => pageId));
  for (const { pageId, state, syncedHash } of kept) {
    if (ctx.view.pageState(pageId)?.status !== "live" || syncedHash === null) continue;
    if (syncedHashOf(ctx.workspaceId, state.filePath) === null) recordSyncedHash(ctx.workspaceId, state.filePath, syncedHash);
  }
}
