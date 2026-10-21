/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mergePageContent.tree.ts                            :+:      :+:    :+:   */
/*                                                    +#+ +#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The tree plumbing the page merge needs: what a block's OWN fields are, how a tree flattens
// into containers, and how two orders of the same blocks are reconciled into one.
// Ponytail: nothing here knows about pages, the outbox or the network — it is block trees and
// nothing else, so the merge stays a pure function (a later brief wires it into the 409 path).

import type { Block, LayoutCell } from "@/entities/block/model/types";

/** The container key of the page's own block list. */
export const ROOT_CONTAINER = "";
/** The container key of a block's children. */
export const childrenContainer = (blockId: string): string => `b:${blockId}`;
/** The container key of one layout cell's blocks — the second nesting channel. */
export const cellContainer = (blockId: string, cellId: string): string => `c:${blockId}:${cellId}`;

/** A block's own fields: every field except its children and the blocks inside its layout
 *  cells. The cells' geometry and labels ARE own fields of the layout block; only the blocks
 *  they hold are a nested container. A change inside a toggle's child or inside a cell is
 *  therefore never a change of the parent's own fields. */
export type OwnFields = Record<string, unknown>;

const cellWithoutBlocks = (cell: LayoutCell): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cell)) {
    if (key === "blocks") continue;
    out[key] = value;
  }
  return out;
};

/** The own fields of a block, with the layout cells' blocks cut out. */
export function ownFields(block: Block): OwnFields {
  const out: OwnFields = {};
  for (const [key, value] of Object.entries(block)) {
    if (key === "children") continue;
    if (key === "layoutCells" && Array.isArray(value)) {
      out[key] = value.map((cell) => cellWithoutBlocks(cell));
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** The own fields without the id — the content a conflict copy is named after. */
export function contentOf(block: Block): OwnFields {
  const out = ownFields(block);
  delete out.id;
  return out;
}

/** Deep value equality (the own fields hold plain data: strings, numbers, arrays, objects). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a !== "object") return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]),
  );
}

/** Whether two blocks hold the same content — own fields, children and the cells' blocks. */
export function sameBlock(a: Block, b: Block): boolean {
  if (!deepEqual(ownFields(a), ownFields(b))) return false;
  if (!deepEqual(a.children ?? [], b.children ?? [])) return false;
  return deepEqual(a.layoutCells ?? [], b.layoutCells ?? []);
}

/** JSON with sorted keys, so the same content always hashes the same — whatever order the
 *  server's JSON happened to carry. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

/** A short stable hash (FNV-1a, base 36) — the name of a conflict copy. */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** A block tree flattened into its containers: the page's list, a block's children, a layout
 *  cell's blocks. Two nesting channels, one map. */
export interface FlatTree {
  /** every block of the tree, by id. */
  blocks: Map<string, Block>;
  /** container key -> the block ids it holds, in order. */
  containers: Map<string, string[]>;
  /** block id -> the container key it sits in. */
  home: Map<string, string>;
}

/** Flatten a tree into its containers. O(blocks). */
export function flattenTree(blocks: Block[]): FlatTree {
  const tree: FlatTree = { blocks: new Map(), containers: new Map(), home: new Map() };
  const walk = (list: Block[], key: string): void => {
    const ids: string[] = [];
    for (const block of list) {
      tree.blocks.set(block.id, block);
      tree.home.set(block.id, key);
      ids.push(block.id);
    }
    tree.containers.set(key, ids);
    for (const block of list) {
      if (block.children) walk(block.children, childrenContainer(block.id));
      for (const cell of block.layoutCells ?? []) {
        if (cell.blocks) walk(cell.blocks, cellContainer(block.id, cell.id));
      }
    }
  };
  walk(blocks, ROOT_CONTAINER);
  return tree;
}

/** Every block id of a tree, nested content included. */
export function collectIds(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (list: Block[]): void => {
    for (const block of list) {
      out.push(block.id);
      if (block.children) walk(block.children);
      for (const cell of block.layoutCells ?? []) {
        if (cell.blocks) walk(cell.blocks);
      }
    }
  };
  walk(blocks);
  return out;
}

/** Where a side's ids line up with the base's: the longest common subsequence, as base index ->
 *  side index. */
interface Alignment {
  pos: Map<number, number>;
}

/** The LCS of two id sequences. O(base x side) — the table is the page's blocks squared, which
 *  a page of a few hundred blocks pays for in milliseconds. */
function align(base: string[], side: string[]): Alignment {
  const pos = new Map<number, number>();
  const rows = base.length + 1;
  const cols = side.length + 1;
  if (base.length === 0 || side.length === 0) return { pos };
  const table = new Uint32Array(rows * cols);
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i * cols + j] =
        base[i - 1] === side[j - 1]
          ? table[(i - 1) * cols + (j - 1)] + 1
          : Math.max(table[(i - 1) * cols + j], table[i * cols + (j - 1)]);
    }
  }
  let i = base.length;
  let j = side.length;
  while (i > 0 && j > 0) {
    if (base[i - 1] === side[j - 1]) {
      pos.set(i - 1, j - 1);
      i -= 1;
      j -= 1;
    } else if (table[(i - 1) * cols + j] >= table[i * cols + (j - 1)]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return { pos };
}

/** The side's ids between two base positions: what the side put there instead of the base. */
function gapOf(
  side: string[],
  alignment: Alignment,
  baseLength: number,
  from: number,
  to: number,
): string[] {
  const start = from < 0 ? 0 : (alignment.pos.get(from) ?? 0) + 1;
  const end = to >= baseLength ? side.length : (alignment.pos.get(to) ?? side.length);
  return side.slice(start, Math.max(start, end));
}

/**
 * The order three sides agree on: the base's, the local's and the server's, merged.
 *
 * The blocks both sides kept in the same place are the anchors; between them each side's
 * deviation is compared with the base's. A side that did not move wins the gap alone, a side
 * that did move wins when the other one did not, and when both moved the gap is kept whole
 * (the local's wins; the caller puts the server's blocks back next to their server siblings).
 * O(base x local + base x server).
 */
export function mergeOrder(base: string[], local: string[], server: string[]): string[] {
  const localAlign = align(base, local);
  const serverAlign = align(base, server);
  const common: number[] = [];
  for (const index of [...localAlign.pos.keys()].sort((a, b) => a - b)) {
    if (serverAlign.pos.has(index)) common.push(index);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  const gap = (from: number, to: number): void => {
    const baseGap = base.slice(from + 1, to);
    const localGap = gapOf(local, localAlign, base.length, from, to);
    const serverGap = gapOf(server, serverAlign, base.length, from, to);
    if (deepEqual(localGap, serverGap)) {
      localGap.forEach(push);
      return;
    }
    if (deepEqual(localGap, baseGap)) {
      serverGap.forEach(push);
      return;
    }
    if (deepEqual(serverGap, baseGap)) {
      localGap.forEach(push);
      return;
    }
    // Both sides moved this stretch: the local's wins whole. The server's blocks that are not
    // in it are put back by the caller, next to their server siblings.
    localGap.forEach(push);
  };
  let previous = -1;
  for (const anchor of [...common, base.length]) {
    gap(previous, anchor);
    if (anchor < base.length) push(base[anchor]);
    previous = anchor;
  }
  return out;
}
