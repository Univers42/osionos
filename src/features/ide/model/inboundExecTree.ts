/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundExecTree.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The steps that change the page TREE — a move (rename and/or reparent, with
// the missing folders on the way created), a create, a restore. All of them go
// through the page-file facade, so a shell `mv` meets the same access and
// name-collision rules as a rename in the workbench.

import { isFsError } from "../vfs/errors";
import { clearSyncedHash, moveSyncedDir, recordSyncedHash, unmarkShellArchived } from "./ideSyncEngine";

import type { ExecContext } from "./inboundExec";
import type { InboundStep } from "./inboundPlan";

type MoveStep = Extract<InboundStep, { op: "move" }>;
type CreateStep = Extract<InboundStep, { op: "create" }>;
type Placement = { parentId: string | null; parentNow: string | null; name: string; nameNow: string };

/** "a/b/c.omd" → { dir: "a/b", name: "c.omd" }. O(len). */
export function splitPath(path: string): { dir: string; name: string } {
  const cut = path.lastIndexOf("/");
  return { dir: cut < 0 ? "" : path.slice(0, cut), name: path.slice(cut + 1) };
}

/**
 * The page whose directory is `dir` (null = the root). A directory no page owns
 * is created as a folder, outermost first (condition 17) — but `Roadmap/` next to
 * `Roadmap.omd` already IS Roadmap's children directory, even before Roadmap has
 * children, so a file written there lands under Roadmap. O(depth) lookups plus
 * one create per missing level.
 */
export async function ensureDirPage(dir: string, ctx: ExecContext): Promise<string | null> {
  if (dir === "") return null;
  const owner = ctx.view.ownerOfDir(dir);
  if (owner !== undefined) return owner;
  const { dir: parent, name } = splitPath(dir);
  const parentId = await ensureDirPage(parent, ctx);
  return (await ctx.facade.create({ title: name, parentId, kind: "dir" })).id;
}

/**
 * Rename and/or reparent through the facade. Moving first keeps a plain `mv a/X b/`
 * one step; when the OLD name is taken in the target directory but the new one is
 * free, the rename has to go first. O(depth + n + s log s) per facade call.
 */
async function place(ctx: ExecContext, pageId: string, target: Placement): Promise<void> {
  const renaming = target.name !== target.nameNow;
  if (target.parentId !== target.parentNow) {
    try {
      await ctx.facade.move(pageId, target.parentId);
    } catch (error) {
      if (!renaming || !isFsError(error) || error.code !== "AlreadyExists") throw error;
      await ctx.facade.rename(pageId, target.name);
      await ctx.facade.move(pageId, target.parentId);
      return;
    }
  }
  if (renaming) await ctx.facade.rename(pageId, target.name);
}

/**
 * The page at `fromPath` becomes the one at `toPath`. Refused when the page is no
 * longer where the plan saw it. The ledger follows only after the move landed
 * (B2): a directory move re-keys every agreement under it, a file move drops its
 * old path — the decide that needed the old hash already ran in the planner.
 */
export async function movePage(step: MoveStep, ctx: ExecContext): Promise<void> {
  const state = ctx.view.pageState(step.pageId);
  if (state?.status !== "live" || state.path !== step.fromPath || state.isFolder !== step.dir) {
    throw new Error(`the page is no longer at ${step.fromPath}`);
  }
  const to = splitPath(step.toPath);
  const parentId = await ensureDirPage(to.dir, ctx);
  await place(ctx, step.pageId, { parentId, parentNow: state.parentId ?? null, name: to.name, nameNow: splitPath(step.fromPath).name });
  if (step.dir) moveSyncedDir(ctx.workspaceId, step.fromPath, step.toPath);
  else clearSyncedHash(ctx.workspaceId, step.fromPath);
}

/** A new page from a shell file; recorded, so the writer may replace the file with
 *  its canonical form (that is how a hand-written file gets its id). */
export async function createPage(step: CreateStep, ctx: ExecContext): Promise<void> {
  const { dir, name } = splitPath(step.path);
  const parentId = await ensureDirPage(dir, ctx);
  const created = await ctx.facade.create({ title: name, parentId, kind: "file", content: step.text });
  recordSyncedHash(ctx.workspaceId, step.path, step.hash);
  await ctx.landed.remember(step.path, step.hash, created.id);
}

/** Back from the trash; the restore memory is spent once the page is live again. */
export async function restorePage(pageId: string, ctx: ExecContext): Promise<void> {
  await ctx.restore(pageId);
  if (ctx.view.pageState(pageId)?.status !== "live") throw new Error("the page could not be restored");
  ctx.pending.forgetArchived(pageId);
  unmarkShellArchived(ctx.workspaceId, ctx.view.subtreeOf(pageId));
}
