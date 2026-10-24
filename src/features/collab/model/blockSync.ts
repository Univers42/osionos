/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockSync.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure last-writer-wins engine that carries page-block trees over the collab
 * realtime channel.
 *
 * WHY: a page body only ever travelled as a whole-page PATCH /api/pages/:id
 * (store/sync/pageOutbox.ts, debounced by the outbox), so nothing told the
 * other browsers and the next writer's stale PATCH overwrote the first
 * writer's text — measured 2026-10-21: none of four members saw a typed
 * marker within 45 s. The channel is already measured: a BROADCAST on
 * `collab:<spaceId>` reaches every member in 0.5 ms in-server, ~10–43 ms on
 * the internet. This engine turns a block tree (Block.children) into two
 * kinds of LWW registers so any two clients that received the same ops hold
 * the same tree:
 *
 *   `b:<blockId>`        — the block's OWN fields (everything `children`
 *                          travels positionally) plus its `parentId`
 *                          (`null` = top level). A delete is a tombstone.
 *   `o:<parentId|root>`  — the ordered child-id list of one parent.
 *
 * Every op carries `v`: a Lamport clock (local op `v = ++clock`; on receive
 * `clock = max(clock, v)` — nextBlockClock/absorbBlockClock). An op wins iff
 * `(v, actor)` is strictly greater than what the register holds (`v` numeric,
 * `actor` as string — equal stamps are the same op re-delivered and lose, so
 * application is idempotent). The per-page register table is versioning
 * metadata only — `{key → {v, actor}}`, never persisted; a page loaded fresh
 * starts empty and loses to it.
 *
 * Materialize: the tree is rebuilt from the CURRENT tree plus just the ops
 * that won this batch — for each parent, its (winning-`order` or existing)
 * child-id list filtered to live blocks, with a live block missing from the
 * list appended after the listed ones sorted by id; a block whose parent is
 * missing or dead (tombstoned) goes to the top level the same way. The pure
 * function (tree, ops-that-won) → tree converges because the register table
 * is itself a max-register over the same op stream on every replica.
 *
 * No React, no store, no I/O — hooks diff and fold; tests are the proof.
 */

import type { Block } from '@/entities/block';
import type { BlockOp, CollabEvent } from './realtimeTransport.port';

/** The wire op shape is re-exported so tests/callers can use one engine import. */
export type { BlockOp } from './realtimeTransport.port';

/** Register key of one block's own fields + parent value ('b:<blockId>'). */
export function blockRegisterKey(id: string): string {
  return `b:${id}`;
}

/** Register key of one parent's ordered child list ('o:<parentId|root>'). */
export function orderRegisterKey(parentId: string | null): string {
  return `o:${parentId ?? 'root'}`;
}

/** The version metadata held per register key — LWW compare is (v, actor). */
export interface BlockRegister {
  v: number;
  actor: string;
}

/** Per-page register table, keyed `b:<id>` / `o:<parentId|root>` (in-memory). */
export type BlockRegisterTable = Record<string, BlockRegister>;

/** A diff op without its version stamp — the caller stamps `v` at flush time. */
export type BlockDiffOp =
  | { k: 'put'; id: string; parentId: string | null; block: Record<string, unknown> }
  | { k: 'del'; id: string }
  | { k: 'order'; parentId: string | null; ids: string[] };

// ── Lamport clock ─────────────────────────────────────────────────────────────

let clock = 0;

/** Stamp a local op: `v = ++clock`, never reused (a reconnect can't rewind). */
export function nextBlockClock(): number {
  return (clock += 1);
}

/** On receive: `clock = max(clock, v)`, so future local ops outrank what arrived. */
export function absorbBlockClock(value: number): void {
  if (Number.isFinite(value) && value > clock) clock = value;
}

// ── Canonical serialization (key-order independent) ──────────────────────────

/**
 * A stable JSON rendering: object keys sorted, so two structurally equal
 * blocks always hash to the same string however their keys were ordered on
 * the way in. `undefined` renders as `null` so a key dropped over the wire
 * never looks like a change (the materialized copy can be re-hydrated later).
 */
function canonicalJson(value: unknown): string {
  if (value === undefined || value === null || typeof value === 'bigint') return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return 'null'; // a function/symbol value can never travel or compare — fail closed
}

/** The block's own fields minus `children` (which is handled positionally). */
function ownFields(block: Record<string, unknown>): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const key in block) {
    if (key === 'children') continue;
    rest[key] = block[key];
  }
  return rest;
}

function ownFieldsJson(block: Record<string, unknown>): string {
  return canonicalJson(ownFields(block));
}

// ── diff side (the local author's store → ops) ───────────────────────────────

interface FlatTree {
  byId: Map<string, { parentId: string | null; own: string; block: Record<string, unknown> }>;
  childrenOf: Map<string | null, string[]>;
}

/**
 * One flatten O(n) per call: id → own-fields key, each block's parent, and
 * every parent's ordered child-id list (top level under key `null`). No
 * O(n²) over the block count, no other algorithmic copies.
 */
function flattenTree(blocks: Block[]): FlatTree {
  const byId = new Map<string, { parentId: string | null; own: string; block: Record<string, unknown> }>();
  const childrenOf = new Map<string | null, string[]>();
  const stack: Array<{ block: Block; parentId: string | null }> = [];
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    stack.push({ block: blocks[index] as Block, parentId: null });
  }
  while (stack.length > 0) {
    const { block, parentId } = stack.pop() as { block: Block; parentId: string | null };
    const list = childrenOf.get(parentId) ?? [];
    list.push(block.id);
    childrenOf.set(parentId, list);
    byId.set(block.id, { parentId, own: ownFieldsJson(block), block });
    const children = block.children;
    if (children) {
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({ block: children[index] as Block, parentId: block.id });
      }
    }
  }
  return { byId, childrenOf };
}

/** The put payload: the block's own fields, `children` travelling separately. */
function blockPayload(block: Block): Record<string, unknown> {
  return ownFields(block as unknown as Record<string, unknown>);
}

function sameIdList(left: string[] | undefined, right: string[]): boolean {
  if (!left || left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

/**
 * Diff one author's partition between two tree states into ops:
 * a `put` for every added block and every block whose own fields or parent
 * changed (own fields compared with a stable JSON of the block minus
 * `children`), a `del` for every removed id (a removed subtree tombstones
 * each of its members, and live blocks move to the top level or die
 * materialization-side), an `order` for every parent whose child-id list
 * changed — including a parent that was just added. `[]` when identical.
 */
export function diffBlocks(prev: Block[] | undefined, next: Block[]): BlockDiffOp[] {
  if (prev === next) return [];
  const after = flattenTree(next);
  const before = prev ? flattenTree(prev) : { byId: new Map<string, { parentId: string | null; own: string; block: Record<string, unknown> }>(), childrenOf: new Map<string | null, string[]>() };
  const ops: BlockDiffOp[] = [];

  for (const [id, flat] of after.byId) {
    const was = before.byId.get(id);
    if (!was || was.parentId !== flat.parentId || was.own !== flat.own) {
      ops.push({ k: 'put', id, parentId: flat.parentId, block: blockPayload(flat.block as Block) });
    }
  }
  for (const id of before.byId.keys()) {
    if (!after.byId.has(id)) ops.push({ k: 'del', id });
  }
  const parents = new Set<string | null>([...after.childrenOf.keys(), ...before.childrenOf.keys()]);
  for (const parent of parents) {
    const listed = after.childrenOf.get(parent) ?? [];
    if (sameIdList(before.childrenOf.get(parent), listed)) continue;
    ops.push({ k: 'order', parentId: parent, ids: listed });
  }
  return ops;
}

// ── fold side (a validated `blocks` event → registers + materialized tree) ───

/** Op wins iff `(v, actor)` is strictly greater than what the register holds. */
function wins(op: BlockOp, actor: string, current: BlockRegister | undefined): boolean {
  if (!current) return true; // empty table — a fresh page loses everything
  if (op.v !== current.v) return op.v > current.v;
  return actor > current.actor;
}

function registerKeyOf(op: BlockOp): string {
  return op.k === 'order' ? orderRegisterKey(op.parentId) : blockRegisterKey(op.id);
}

/**
 * Record the caller's OWN ops (already stamped) in a register table, exactly
 * like applyBlockOps does for remote winners. The outbox hook feeds its
 * broadcast batch through this so a replica's register state always covers
 * what it authored. Folding through the max keeps the table right even if a
 * caller hands over ops out of order.
 */
export function recordBlockOps(
  registers: BlockRegisterTable,
  ops: BlockOp[],
  actor: string,
): BlockRegisterTable {
  if (ops.length === 0) return registers;
  let next = registers;
  for (const op of ops) {
    const key = registerKeyOf(op);
    if (!wins(op, actor, next[key])) continue;
    if (next === registers) next = { ...registers };
    next[key] = { v: op.v, actor };
  }
  return next;
}

export interface BlockSyncResult {
  blocks: Block[] | undefined;
  registers: BlockRegisterTable;
  changed: boolean;
}

/**
 * Fold validated ops into one replica: LWW per register (strictly greater
 * `(v, actor)` wins), then materialize the tree from the current tree plus
 * the winners. Returns the SAME `blocks` reference when nothing won — call
 * sites skip their whole store write on that.
 */
export function applyBlockOps(
  blocks: Block[] | undefined,
  ops: BlockOp[],
  actor: string,
  registers: BlockRegisterTable,
): BlockSyncResult {
  // Fold in one pass: each op is compared against the table as updated by the
  // previous ops of THIS batch too, so an out-of-order duplicate inside one
  // event still ends on the highest (v, actor) on every replica.
  const winners: BlockOp[] = [];
  let nextTable = registers;
  for (const op of ops) {
    const key = registerKeyOf(op);
    if (!wins(op, actor, nextTable[key])) continue;
    if (nextTable === registers) nextTable = { ...registers };
    nextTable[key] = { v: op.v, actor };
    winners.push(op);
  }
  if (winners.length === 0) return { blocks, registers, changed: false };
  const tree = materialize(blocks, winners);
  if (treeFingerprint(tree) === treeFingerprint(blocks)) {
    return { blocks, registers: nextTable, changed: false };
  }
  return { blocks: tree, registers: nextTable, changed: true };
}

/**
 * Deterministic materialization: rebuild the whole tree from the flat live
 * map seeded with the current tree and overlaid with the winners' puts/dels,
 * then for each parent take its child-id list from a winning `order` op when
 * one exists, else from the current tree's own order; live blocks missing
 * from a list are appended sorted by id; a block whose parent is missing or
 * dead goes to the top level the same way.
 *
 * O(n): the live map, every effective parent and every parent's base list are
 * each walked once, then the missing blocks are bucketed by parent (one sort
 * per bucket) — never a full live-map scan per parent.
 */
function materialize(blocks: Block[] | undefined, winners: BlockOp[]): Block[] | undefined {
  const live = new Map<string, { parentId: string | null; block: Record<string, unknown> }>();
  const treeChildren = new Map<string | null, string[]>();
  if (blocks) {
    const stack: Array<{ block: Block; parentId: string | null }> = [...blocks].reverse().map((block) => ({ block, parentId: null }));
    while (stack.length > 0) {
      const { block, parentId } = stack.pop() as { block: Block; parentId: string | null };
      live.set(block.id, { parentId, block });
      const list = treeChildren.get(parentId) ?? [];
      list.push(block.id);
      treeChildren.set(parentId, list);
      if (block.children) {
        for (let index = block.children.length - 1; index >= 0; index -= 1) {
          stack.push({ block: block.children[index] as Block, parentId: block.id });
        }
      }
    }
  }

  const batchOrder = new Map<string | null, string[]>();
  for (const op of winners) {
    if (op.k === 'del') live.delete(op.id);
    else if (op.k === 'put') live.set(op.id, { parentId: op.parentId, block: op.block });
    else batchOrder.set(op.parentId, op.ids);
  }

  // A block only shows under its effective parent: the parent its register
  // names while that parent is live, else the top level (design invariant).
  const effective = new Map<string, string | null>();
  for (const [id, entry] of live) {
    effective.set(id, entry.parentId !== null && live.has(entry.parentId) ? entry.parentId : null);
  }

  // Base order of each parent: this batch's winning `order`, else the tree's.
  const nextChildren = new Map<string | null, string[]>();
  const listed = new Set<string>();
  const parents = new Set<string | null>([...treeChildren.keys(), ...batchOrder.keys()]);
  for (const parent of parents) {
    const base = batchOrder.get(parent) ?? treeChildren.get(parent) ?? [];
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of base) {
      if (seen.has(id) || !live.has(id) || effective.get(id) !== parent) continue;
      seen.add(id);
      ids.push(id);
      listed.add(id);
    }
    nextChildren.set(parent, ids);
  }

  // Live blocks missing from their parent's list are appended after it, sorted.
  const missing = new Map<string | null, string[]>();
  for (const id of live.keys()) {
    if (listed.has(id)) continue;
    const parent = effective.get(id) ?? null;
    const bucket = missing.get(parent);
    if (bucket) bucket.push(id);
    else missing.set(parent, [id]);
  }
  for (const [parent, ids] of missing) {
    ids.sort();
    const list = nextChildren.get(parent);
    if (list) list.push(...ids);
    else nextChildren.set(parent, ids);
  }

  const nodeOf = (id: string, building: Set<string>): Block => {
    const entry = live.get(id) as { block: Record<string, unknown> };
    const base = ownFields(entry.block); // never trust a payload's stray `children`
    base.id = id;
    if (building.has(id)) return base as unknown as Block; // corrupt cycle: keep it childless
    building.add(id);
    const kids = (nextChildren.get(id) ?? []).map((childId) => nodeOf(childId, building));
    building.delete(id);
    return (kids.length > 0 ? { ...base, children: kids } : base) as unknown as Block;
  };

  const building = new Set<string>();
  return (nextChildren.get(null) ?? []).map((id) => nodeOf(id, building));
}

/** Whole-tree fingerprint: own-fields JSON of every node in traversal order. */
function treeFingerprint(blocks: Block[] | undefined): string {
  if (!blocks) return '∅';
  const parts: string[] = [];
  const stack: Array<{ block: Block; depth: number }> = [];
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    stack.push({ block: blocks[index] as Block, depth: 0 });
  }
  while (stack.length > 0) {
    const { block, depth } = stack.pop() as { block: Block; depth: number };
    parts.push(`${depth}:`, ownFieldsJson(block), '[');
    const children = block.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ block: children[index] as Block, depth: depth + 1 });
    }
  }
  return parts.join('');
}

// ── outbound framing (requirements 1: a payload stays under 60 KB) ───────────

/** Serialized-payload budget of ONE `blocks` event (the wire frame's body). */
export const BLOCK_EVENT_BUDGET = 60 * 1024;

/** The boundary validator caps `ops` at 500 per event — the splitter obeys it. */
export const MAX_OPS_PER_EVENT = 500;

/**
 * Split stamped ops into `blocks` events of ≤ BLOCK_EVENT_BUDGET serialized
 * (and ≤ MAX_OPS_PER_EVENT ops each), ops kept in order.
 * Caveat: a single op that alone exceeds a fresh event's budget (a huge code
 * block or draw scene) is not sent — it stays in the author's register table
 * and tree; remote replicas see it only after their next page hydrate.
 */
export function splitBlockEvents(
  pageId: string,
  actor: string,
  ops: BlockOp[],
  nextSeq: () => number,
): CollabEvent[] {
  // Serialized length of the event wrapper around `ops: []` (a 10-digit seq
  // placeholder is an upper bound; real counters start at 1). Adding the first
  // op replaces the two brackets, each further op costs one comma.
  const base = JSON.stringify({ t: 'blocks', actor, seq: 1_000_000_000, pageId, ops: [] }).length;
  const events: CollabEvent[] = [];
  let chunk: BlockOp[] = [];
  let size = base;
  const flush = (): void => {
    if (chunk.length === 0) return;
    events.push({ t: 'blocks', actor, seq: nextSeq(), pageId, ops: chunk });
    chunk = [];
    size = base;
  };

  for (const op of ops) {
    const opSize = JSON.stringify(op).length;
    if (chunk.length >= MAX_OPS_PER_EVENT) flush();
    if (chunk.length > 0) {
      const candidate = size + 1 + opSize;
      if (candidate <= BLOCK_EVENT_BUDGET) {
        chunk.push(op);
        size = candidate;
        continue;
      }
      flush(); // this op may still fit a fresh event
    }
    const alone = base - 2 + opSize;
    if (alone > BLOCK_EVENT_BUDGET) {
      // Caveat: this op alone does not fit any event (huge code block / draw
      // scene) — it is not broadcast; it still holds the author's register, so
      // the local replica stays authoritative until the others re-hydrate.
      continue;
    }
    chunk.push(op);
    size = alone;
  }
  flush();
  return events;
}
