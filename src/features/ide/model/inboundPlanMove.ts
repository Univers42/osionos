/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundPlanMove.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The MOVE rows and the endings every write row shares. A write naming a page by
// id means the page was renamed, a directory above it was renamed, or neither (a
// `cp`): `relocate` tells them apart; `decide`, `copyOf` and the skips end them.

import { isFolderMetaName, isPageFileName } from "@/features/page-file/model/pageFileCodec";
import { decideInboundWrite } from "./ideSyncEngine";
import { sha16 } from "./ideFsEcho";

import type { InboundStep, InboundView, LivePage, MoveEvidence } from "./inboundPlan";

/** What one write event carries into the rows. */
export interface WriteContext {
  readonly path: string;
  readonly text: string;
  readonly hash: string;
  readonly view: InboundView;
}

type DirEvidence = Extract<MoveEvidence, { kind: "dir" }>;

export function skipLoud(reason: string): InboundStep {
  return { op: "skip", reason, quiet: false };
}

/** R7's refusal, shared with relocate: a `_folder.omd` never becomes a page of its own. */
export function noFolderSkip(path: string): InboundStep {
  return skipLoud(`${path}: no folder here; create the folder from the app or with a page inside it`);
}

/**
 * relocate(Q, ev): the write at the event path names page Q by id, and `ev` says
 * Q's file or a directory above it was deleted. A page the user may not delete is
 * never moved (A8); a write that matches no move ends as a copy. O(depth) plus
 * one sha16 for the decide.
 *
 * Ponytail: `mv Roadmap Roadmap.omd X/` (directory argument first) moves each
 * child ALONE (R13 left it pending, so its evidence is "own") into `X/Roadmap/`,
 * a folder the executor creates, before Roadmap's own file arrives; Roadmap's
 * move to `X/Roadmap.omd` then collides with that folder at its children
 * directory, so the documented end state is the children in the new folder and
 * Roadmap at the root. No loss, no duplicate; file-first order is exact.
 */
export async function relocate(subject: string, evidence: MoveEvidence, ctx: WriteContext): Promise<InboundStep[]> {
  const live = livePageOf(ctx.view, subject);
  if (live === undefined || !ctx.view.canDelete(subject)) return notAMove(subject, ctx);
  const head = evidence.kind === "own" ? ownHead(subject, live, ctx) : dirHead(subject, live, evidence, ctx);
  if (head === null) return notAMove(subject, ctx);
  head.push(...(await decide(subject, ctx.view.syncedHashOf(live.filePath), ctx)));
  return head;
}

/** A8 and every write that is not a move: keep Q (drop its pending archive), then copy. */
function notAMove(subject: string, ctx: WriteContext): InboundStep[] {
  const steps: InboundStep[] = ctx.view.hasOwnPending(subject) ? [{ op: "cancel-archive", pageId: subject }] : [];
  steps.push(isFolderMetaName(ctx.path.slice(ctx.path.lastIndexOf("/") + 1)) ? noFolderSkip(ctx.path) : copyOf(ctx));
  return steps;
}

function moveHead(pageId: string, fromPath: string, toPath: string, dir: boolean): InboundStep[] {
  return [{ op: "cancel-archive", pageId }, { op: "move", pageId, fromPath, toPath, dir }];
}

/** The plain rename: Q's own file went away and reappears here (a folder's
 *  `_folder.omd` names its new directory). A root `_folder.omd` names none. */
function ownHead(subject: string, live: LivePage, ctx: WriteContext): InboundStep[] | null {
  const toPath = live.isFolder ? ctx.path.slice(0, Math.max(ctx.path.lastIndexOf("/"), 0)) : ctx.path;
  return toPath === "" ? null : moveHead(subject, live.path, toPath, live.isFolder);
}

/**
 * R6b (A2): a directory D above Q was deleted and Q's file reappears as
 * `X/<the tail it had under D>`, so D was renamed to X. The whole directory moves
 * once — the folder that owned D, or the page A directly inside D on Q's parent
 * chain — when that page's archive is pending and nothing holds its new place.
 * Otherwise Q moves alone on its own pending archive, or the write is a copy.
 */
function dirHead(subject: string, live: LivePage, ev: DirEvidence, ctx: WriteContext): InboundStep[] | null {
  const tail = live.filePath.startsWith(`${ev.dir}/`) ? live.filePath.slice(ev.dir.length) : undefined;
  if (tail === undefined || !ctx.path.endsWith(tail) || ctx.path.length === tail.length) return null;
  const target = ctx.path.slice(0, ctx.path.length - tail.length);
  const head = ev.role === "folder-dir" ? folderHead(ev.ownerId, target, ctx.view) : childrenHead(subject, ev, target, ctx.view);
  if (head !== null) return head;
  return ctx.view.hasOwnPending(subject) ? ownHead(subject, live, ctx) : null;
}

/** Folder-dir evidence: the folder F that owned D moves to X. O(depth) for the one entryAt. */
function folderHead(ownerId: string, target: string, view: InboundView): InboundStep[] | null {
  const owner = livePageOf(view, ownerId);
  if (owner === undefined || !view.hasOwnPending(ownerId) || isTaken(view, target)) return null;
  return moveHead(ownerId, owner.path, target, true);
}

/** Children-dir evidence: page A (directly inside D, on Q's chain) moves to the
 *  same place under X. O(depth) for the parent walk and the one entryAt. */
function childrenHead(subject: string, ev: DirEvidence, target: string, view: InboundView): InboundStep[] | null {
  const child = childOfOwner(subject, ev.ownerId, view);
  if (child === undefined || !view.hasOwnPending(child.id) || !child.page.path.startsWith(`${ev.dir}/`)) return null;
  const toPath = target + child.page.path.slice(ev.dir.length);
  return isTaken(view, toPath) ? null : moveHead(child.id, child.page.path, toPath, child.page.isFolder);
}

/** A case-insensitive match counts as taken: on a case-folding disk it is. */
function isTaken(view: InboundView, path: string): boolean {
  return view.entryAt(path.split("/").filter((segment) => segment.length > 0)) !== undefined;
}

/**
 * The page on Q's parent chain (Q included) whose parent is `ownerId`: the one
 * sitting directly inside the renamed children directory. The seen-set stops a
 * corrupt (cyclic) parent chain. O(depth).
 */
function childOfOwner(subject: string, ownerId: string, view: InboundView): { id: string; page: LivePage } | undefined {
  const seen = new Set<string>();
  for (let id: string | undefined = subject; id !== undefined && !seen.has(id); ) {
    seen.add(id);
    const page = livePageOf(view, id);
    if (page === undefined) return undefined;
    if (page.parentId === ownerId) return { id, page };
    id = page.parentId;
  }
  return undefined;
}

function livePageOf(view: InboundView, pageId: string): LivePage | undefined {
  const state = view.pageState(pageId);
  return state?.status === "live" ? state : undefined;
}

/**
 * The three-way merge from ideSyncEngine. Echo is settled by R2 and the local
 * text is never null, so only ignore/apply/conflict are reachable; the rest
 * record. `agreedPageHash` only for a page's own path (inboundLanded); a move or
 * a restore decides on the ledger alone. O(len(local) + len(text)).
 */
export async function decide(pageId: string, lastSynced: string | null, ctx: WriteContext, agreedPageHash: string | null = null): Promise<InboundStep[]> {
  const localContent = await ctx.view.localText(pageId);
  const verdict = decideInboundWrite({
    inboundHash: ctx.hash,
    isEcho: () => false,
    localContent,
    localHash: await sha16(localContent),
    inboundContent: ctx.text,
    lastSyncedHash: lastSynced,
    agreedPageHash,
  });
  if (verdict.action === "apply") return [{ op: "apply", pageId, path: ctx.path, text: ctx.text, hash: ctx.hash }];
  if (verdict.action === "conflict") return [{ op: "conflict", pageId, path: ctx.path, theirs: ctx.text, hash: ctx.hash }];
  return [{ op: "record", path: ctx.path, hash: ctx.hash }];
}

/** The copy: a new page from the text minus its front-matter id line, or a code
 *  page from the bytes as they are (a code file has no front matter). O(len(text)). */
export function copyOf(ctx: WriteContext): InboundStep {
  const isPage = isPageFileName(ctx.path.slice(ctx.path.lastIndexOf("/") + 1));
  return { op: "create", path: ctx.path, text: isPage ? withoutIdLine(ctx.text) : ctx.text, hash: ctx.hash, kind: isPage ? "page" : "code" };
}

/**
 * Drops the `id` line(s) between the opening and closing `---`, keeping every
 * other byte — re-serializing would reorder keys and lose the user's layout.
 * Exact for any text splitFrontMatter accepted (the only texts that reach a
 * copy): same opening fence, same closing-line test, and its key grammar makes
 * an id line start with exactly "id: ". O(len(text)).
 */
function withoutIdLine(text: string): string {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return text;
  const lines = text.split("\n");
  const close = lines.findIndex((line, at) => at > 0 && (line === "---" || line === "---\r"));
  const end = close === -1 ? lines.length : close;
  return lines.filter((line, at) => at === 0 || at >= end || !line.startsWith("id: ")).join("\n");
}
