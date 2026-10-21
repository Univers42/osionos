/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mergePageContent.blocks.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the merge decides about the blocks: which survive, where they sit, what they hold, and
// which of them the two sides fought over. The round lives here because the rules apply inside
// every container, so the recursion never leaves this file.
// Ponytail: the own fields of a block are taken as a WHOLE from one side: a block the two
// sides changed differently is a conflict, not a field-by-field patch.

import type { Block, LayoutCell } from "@/entities/block/model/types";
import {
  cellContainer,
  childrenContainer,
  collectIds,
  contentOf,
  deepEqual,
  flattenTree,
  mergeOrder,
  ownFields,
  ROOT_CONTAINER,
  sameBlock,
  shortHash,
  stableStringify,
  type FlatTree,
} from "./mergePageContent.tree";

interface MergeContext {
  base: FlatTree;
  local: FlatTree;
  server: FlatTree;
  /** The block ids that survive the merge; the others were deleted on both sides. */
  kept: Set<string>;
  /** The container each kept block ends up in. */
  home: Map<string, string>;
  conflicted: boolean;
  conflictIds: string[];
}

const noteConflict = (ctx: MergeContext, id: string): void => {
  ctx.conflicted = true;
  if (!ctx.conflictIds.includes(id)) ctx.conflictIds.push(id);
};

/** Which blocks survive. A block the other side deleted dies only when this side never
 *  touched it; a block one side deleted and the other side changed is kept (the changed
 *  one) and reported. Ponytail: "touched" is the whole block, nested content included.
 *  O(blocks). */
function decideFates(ctx: MergeContext): void {
  const ids = new Set<string>([
    ...ctx.base.blocks.keys(),
    ...ctx.local.blocks.keys(),
    ...ctx.server.blocks.keys(),
  ]);
  for (const id of ids) {
    const base = ctx.base.blocks.get(id);
    const local = ctx.local.blocks.get(id);
    const server = ctx.server.blocks.get(id);
    if (local && server) {
      ctx.kept.add(id);
      continue;
    }
    // Deleted on one side: it dies only when the other side never touched it.
    const only = local ?? server;
    if (!only) continue;
    if (!base) {
      ctx.kept.add(id);
      continue;
    }
    if (sameBlock(base, only)) continue;
    ctx.kept.add(id);
    noteConflict(ctx, id);
  }
}

/** The container each kept block ends up in. A block that moved on one side only takes that
 *  side's place; a block both sides moved takes the local's. A block whose container went
 *  with a parent that is gone comes back to the page's list. O(blocks). */
function decideHomes(ctx: MergeContext): void {
  for (const id of ctx.kept) {
    const base = ctx.base.home.get(id);
    const local = ctx.local.home.get(id);
    const server = ctx.server.home.get(id);
    let home: string;
    if (local === undefined) home = server ?? base ?? ROOT_CONTAINER;
    else if (server === undefined || base === undefined) home = local;
    else {
      const localMoved = local !== base;
      const serverMoved = server !== base;
      home = localMoved ? local : serverMoved ? server : local;
    }
    const parent = parentOf(home);
    if (parent !== null && !ctx.kept.has(parent)) home = ROOT_CONTAINER;
    ctx.home.set(id, home);
  }
}

/** Two sides can drag blocks into each other: the local puts a block inside another one and
 *  the server puts that other one inside the first. The merged tree would then hold a cycle,
 *  which no tree can hold. The block the cycle turns on goes back to the page's list. */
function breakCycles(ctx: MergeContext): void {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string): void => {
    const mark = state.get(id);
    if (mark === "done") return;
    if (mark === "visiting") {
      ctx.home.set(stack[stack.indexOf(id)] ?? id, ROOT_CONTAINER);
      return;
    }
    state.set(id, "visiting");
    stack.push(id);
    const parent = parentOf(ctx.home.get(id) ?? ROOT_CONTAINER);
    if (parent !== null && ctx.kept.has(parent)) visit(parent);
    stack.pop();
    state.set(id, "done");
  };
  for (const id of ctx.kept) visit(id);
}

/** The block that owns a container: the parent of a block's children or of a cell's blocks. */
function parentOf(container: string): string | null {
  if (container === ROOT_CONTAINER) return null;
  if (!container.startsWith("b:") && !container.startsWith("c:")) return null;
  const rest = container.slice(2);
  const colon = rest.indexOf(":");
  return colon < 0 ? rest : rest.slice(0, colon);
}

/** Put an id right after its nearest preceding sibling that is already in the list (or first).
 *  O(list) per call: it scans the list for the sibling and for the id's own place. */
function placeNear(list: string[], id: string, siblings: string[]): void {
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1);
  const index = siblings.indexOf(id);
  for (let i = index - 1; i >= 0; i -= 1) {
    const pos = list.indexOf(siblings[i]);
    if (pos < 0) continue;
    list.splice(pos + 1, 0, id);
    return;
  }
  list.unshift(id);
}

/**
 * The merged blocks of one container: the page's list, a block's children, or a layout cell's
 * blocks. The order comes from the three sides, the content from the block merge below.
 */
function mergeContainer(ctx: MergeContext, key: string): Block[] {
  const keptIn = (ids: string[]): string[] =>
    ids.filter((id) => ctx.kept.has(id) && ctx.home.get(id) === key);
  const baseList = keptIn(ctx.base.containers.get(key) ?? []);
  const localList = keptIn(ctx.local.containers.get(key) ?? []);
  const serverList = keptIn(ctx.server.containers.get(key) ?? []);
  const order = mergeOrder(baseList, localList, serverList);
  // The ids the order holds, in a Set: the membership test is O(1) per block, where a scan
  // of the order was O(n) — one side pasting a thousand blocks made the merge quadratic.
  const placed = new Set(order);
  const serverSet = new Set(serverList);
  // A block the server added lands next to its server siblings, never at the end of nowhere.
  for (const id of serverList) {
    if (ctx.base.blocks.has(id) || ctx.local.blocks.has(id)) continue;
    placeNear(order, id, serverList);
    placed.add(id);
  }
  // Nothing kept may vanish: a block the order dropped goes back next to its siblings.
  for (const id of [...serverList, ...localList]) {
    if (placed.has(id)) continue;
    placeNear(order, id, serverSet.has(id) ? serverList : localList);
    placed.add(id);
  }
  const out: Block[] = [];
  for (const id of order) {
    const merged = mergeBlock(ctx, id);
    if (!merged) continue;
    out.push(merged.block);
    if (merged.copy) out.push(merged.copy);
  }
  return out;
}

interface MergedBlock {
  block: Block;
  /** The server's variant of a block both sides changed: a copy right after the original. */
  copy: Block | null;
}

/**
 * One block, merged. The own fields come from one side (or from both when they agree); the
 * children and the layout cells' blocks are merged on their own, leaf by leaf.
 */
function mergeBlock(ctx: MergeContext, id: string): MergedBlock | null {
  const base = ctx.base.blocks.get(id);
  const local = ctx.local.blocks.get(id);
  const server = ctx.server.blocks.get(id);
  if (!local && !server) return null;
  const ownBase = base ? ownFields(base) : null;
  const ownLocal = local ? ownFields(local) : null;
  const ownServer = server ? ownFields(server) : null;
  let source: Block;
  let conflict = false;
  if (!local) source = server as Block;
  else if (!server) source = local;
  else if (ownBase && deepEqual(ownLocal, ownBase)) source = server;
  else if (ownBase && deepEqual(ownServer, ownBase)) source = local;
  else if (deepEqual(ownLocal, ownServer)) source = local;
  else {
    source = local;
    conflict = true;
  }
  const block = buildBlock(ctx, id, source);
  if (!conflict) return { block, copy: null };
  noteConflict(ctx, id);
  return { block, copy: conflictCopy(ctx, id, server as Block) };
}

/** A block with its nested containers merged. The key set of the source is kept, so a merge
 *  that changes nothing is byte-for-byte the block it came from. */
function buildBlock(ctx: MergeContext, id: string, source: Block): Block {
  const block: Block = { ...source };
  const base = ctx.base.blocks.get(id);
  const local = ctx.local.blocks.get(id);
  const server = ctx.server.blocks.get(id);
  if (base?.children || local?.children || server?.children) {
    const children = mergeContainer(ctx, childrenContainer(id));
    // The source's own shape is kept: a block that had no children does not grow an empty
    // list, so a merge that changes nothing is the block it came from.
    if (children.length > 0 || "children" in source) block.children = children;
  }
  if (source.layoutCells) {
    block.layoutCells = source.layoutCells.map((cell) => {
      const merged = mergeContainer(ctx, cellContainer(id, cell.id));
      const next: LayoutCell = { ...cell };
      if ("blocks" in cell) next.blocks = merged;
      else if (merged.length > 0) next.blocks = merged;
      return next;
    });
  }
  return block;
}

/**
 * The server's variant of a block both sides changed: a distinct block right after the
 * original, named after the original and the server's own fields, so the same merge twice
 * names it the same and never shows it twice.
 * Ponytail: the copy carries the server's OWN fields; the nested content is merged once and
 * stays with the local's block (repeating the server's children would put one id twice, C27).
 */
function conflictCopy(ctx: MergeContext, id: string, server: Block): Block | null {
  const copyId = `${id}-c-${shortHash(stableStringify(contentOf(server)))}`;
  // The local copy already holds it (a merge that ran before): one block, one id.
  if (ctx.local.blocks.has(copyId) || ctx.server.blocks.has(copyId)) return null;
  const copy: Block = { ...server, id: copyId, conflictOf: id };
  if (copy.children) copy.children = [];
  if (copy.layoutCells) copy.layoutCells = copy.layoutCells.map((cell) => ({ ...cell, blocks: [] }));
  return copy;
}

/** One merge round: the merged tree, the conflicts, and the blocks they are about. */
export function mergeTree(base: Block[], local: Block[], server: Block[]): {
  content: Block[];
  conflicted: boolean;
  conflictIds: string[];
} {
  const ctx: MergeContext = {
    base: flattenTree(base),
    local: flattenTree(local),
    server: flattenTree(server),
    kept: new Set(),
    home: new Map(),
    conflicted: false,
    conflictIds: [],
  };
  decideFates(ctx);
  decideHomes(ctx);
  breakCycles(ctx);
  const content = mergeContainer(ctx, ROOT_CONTAINER);
  // Nothing kept may vanish: a block whose container went with a side that lost it comes
  // back to the page's list rather than disappearing with it.
  const mergedIds = new Set(collectIds(content));
  for (const id of ctx.kept) {
    if (mergedIds.has(id)) continue;
    ctx.home.set(id, ROOT_CONTAINER);
    const merged = mergeBlock(ctx, id);
    if (!merged) continue;
    content.push(merged.block);
    if (merged.copy) content.push(merged.copy);
  }
  return { content, conflicted: ctx.conflicted, conflictIds: ctx.conflictIds };
}
