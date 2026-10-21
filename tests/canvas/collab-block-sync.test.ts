/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-block-sync.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Engine-first proof for the live block sync (model/blockSync.ts). These tests
 * are why the design converges: two replicas that receive the same ops in
 * OPPOSITE orders end on the same tree, because every register is a max over
 * the same (v, actor) stream and materialize() is a pure function of
 * (tree, winners). Also covers the collabEvent.schema boundary for the new
 * content-plane events and the 60 KB payload splitter.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import {
  absorbBlockClock,
  applyBlockOps,
  BLOCK_EVENT_BUDGET,
  blockRegisterKey,
  diffBlocks,
  nextBlockClock,
  orderRegisterKey,
  recordBlockOps,
  splitBlockEvents,
  type BlockOp,
  type BlockRegisterTable,
} from "../../src/features/collab/model/blockSync.ts";
import { validateCollabEvent } from "../../src/features/collab/model/collabEvent.schema.ts";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function block(id: string, content = "", extra: Partial<Block> = {}): Block {
  return { id, type: "paragraph", content, ...extra };
}

/** root: [x, y, z, p1[c1]] — enough tree for all the diff cases. */
function baseTree(): Block[] {
  return [block("x", "x"), block("y", "y"), block("z", "z"), { ...block("p1", "p1"), children: [block("c1", "c1")] }];
}

interface Replica {
  blocks: Block[] | undefined;
  table: BlockRegisterTable;
}

function replica(tree: Block[]): Replica {
  return { blocks: structuredClone(tree), table: {} };
}

/** Stamp a diff with fresh Lamport versions, record it, and move the replica to `next`. */
function authorWrite(user: Replica, prev: Block[] | undefined, next: Block[], actor: string): BlockOp[] {
  const ops = diffBlocks(prev, next).map((op) => ({ ...op, v: nextBlockClock() })) as BlockOp[];
  user.table = recordBlockOps(user.table, ops, actor);
  user.blocks = next;
  return ops;
}

/** Deliver one batch (an event's ops) to a replica and keep fold results. */
function receive(user: Replica, ops: BlockOp[], actor: string): { changed: boolean; sameRef: boolean } {
  const before = user.blocks;
  const result = applyBlockOps(user.blocks, ops, actor, user.table);
  if (result.changed) user.blocks = result.blocks;
  user.table = result.registers;
  return { changed: result.changed, sameRef: result.blocks === before };
}

// ── diff side ────────────────────────────────────────────────────────────────

test("diff: editing one block's text emits exactly one put", () => {
  const prev = baseTree();
  const next = structuredClone(prev);
  (next[0] as Block).content = "typed a marker";
  const ops = diffBlocks(prev, next);
  assert.equal(ops.length, 1, "one edit → exactly one op");
  assert.equal(ops[0].k, "put");
  assert.equal((ops[0] as { id: string }).id, "x");
  assert.equal((ops[0] as { parentId: string | null }).parentId, null);
});

test("diff: adding a block emits put + order", () => {
  const prev = baseTree();
  const next = structuredClone(prev);
  next.push(block("w", "new"));
  const ops = diffBlocks(prev, next);
  assert.deepEqual(ops.map((op) => op.k), ["put", "order"]);
  assert.deepEqual(ops[1] as { parentId: string | null; ids: string[] }, { k: "order", parentId: null, ids: ["x", "y", "z", "p1", "w"] });
});

test("diff: deleting a block emits del + order", () => {
  const prev = baseTree();
  const next = structuredClone(prev).filter((b) => b.id !== "z");
  const ops = diffBlocks(prev, next);
  assert.equal(ops.length, 2);
  assert.deepEqual(ops[0], { k: "del", id: "z" });
  assert.deepEqual(ops[1] as { ids: string[] }, { k: "order", parentId: null, ids: ["x", "y", "p1"] });
});

test("diff: moving a block between parents emits one put + two orders", () => {
  const prev = baseTree();
  const next = structuredClone(prev);
  const position = next.findIndex((b) => b.id === "x");
  const [moved] = next.splice(position, 1); // detach from the top level
  const parent = next.find((b) => b.id === "p1") as Block;
  (parent.children as Block[]).push(moved); // re-attach under p1
  const ops = diffBlocks(prev, next);
  assert.deepEqual(
    ops.map((op) => op.k),
    ["put", "order", "order"],
    "one put (parent changed) + one order per affected parent",
  );
  assert.equal(ops[0].k, "put");
  assert.equal((ops[0] as { id: string }).id, "x");
  assert.equal((ops[0] as { parentId: string | null }).parentId, "p1");
  assert.deepEqual((ops[0] as { block: Record<string, unknown> }).block, { id: "x", type: "paragraph", content: "x" });
  const roots = ops.filter((op) => op.k === "order" && (op as { parentId: string | null }).parentId === null);
  const underP1 = ops.filter((op) => op.k === "order" && (op as { parentId: string | null }).parentId === "p1");
  assert.equal(roots.length, 1);
  assert.equal(underP1.length, 1);
  assert.deepEqual((underP1[0] as { ids: string[] }).ids, ["c1", "x"]);
});

test("diff: identical trees (even by content, not reference) emit nothing", () => {
  assert.deepEqual(diffBlocks(baseTree(), structuredClone(baseTree())), []);
});

test("clock helpers: next bumps, absorb takes the max", () => {
  const local = nextBlockClock();
  assert.equal(nextBlockClock(), local + 1, "nextBlockClock increments");
  absorbBlockClock(local + 50);
  assert.ok(nextBlockClock() > local + 50, "a later stamp outranks the absorbed v");
});

// ── fold side ────────────────────────────────────────────────────────────────

test("apply: ops from diff(prev,next) applied to prev give a tree deep-equal to next", () => {
  const prev = baseTree();

  // 1. edit x, move it under p1, add w under p1 (three kinds of diff in one).
  const edited: Block[] = [
    block("y", "y"), block("z", "z"),
    { ...block("p1", "p1"), children: [block("c1", "c1"), block("x", "ed"), block("w", "new under p1")] },
  ];
  // 2. append a top-level block.
  const added: Block[] = [...structuredClone(edited), block("n1", "top level")];
  // 3. delete a top-level block.
  const removed: Block[] = added.filter((b) => b.id !== "y");

  const cases: Array<[Block[] | undefined, Block[]]> = [
    [prev, edited], [edited, added], [added, removed],
  ];
  for (const [statePrev, stateNext] of cases) {
    const ops = diffBlocks(statePrev, stateNext).map((op) => ({ ...op, v: nextBlockClock() })) as BlockOp[];
    const result = applyBlockOps(structuredClone(statePrev), ops, "writer", {});
    assert.ok(result.changed, "the ops must take effect");
    assert.deepEqual(result.blocks, stateNext, "folded tree equals the author's copy");
  }
});

test("apply: nothing to win → the SAME blocks reference, changed=false", () => {
  const tree = baseTree();
  const result = applyBlockOps(tree, [], "A", {});
  assert.equal(result.blocks, tree, "same reference, no copy");
  assert.equal(result.changed, false);
});

test("a stale op (lower v) does not overwrite", () => {
  const first = applyBlockOps(
    baseTree(),
    [{ k: "put", id: "x", parentId: null, block: { id: "x", type: "paragraph", content: "fresh" }, v: 9 }],
    "A",
    {},
  );
  assert.ok(first.changed);
  const stale = [{ k: "put", id: "x", parentId: null, block: { id: "x", type: "paragraph", content: "stale" }, v: 4 }] as BlockOp[];
  const again = applyBlockOps(first.blocks as Block[], stale, "B", first.registers);
  assert.equal(again.changed, false, "lost op keeps the tree as it was");
  assert.equal((again.blocks as Block[])[0].content, "fresh");
});

test("a put after a newer del does not resurrect the block", () => {
  const t = baseTree();
  const killed = applyBlockOps(t, [{ k: "del", id: "z", v: 9 }], "A", {});
  assert.ok(killed.changed);
  const sequel = applyBlockOps(
    killed.blocks as Block[],
    [{ k: "put", id: "z", parentId: null, block: { id: "z", type: "paragraph", content: "ghost" }, v: 7 }],
    "B",
    killed.registers,
  );
  assert.equal(sequel.changed, false, "the tombstone register rejects the older put");
  assert.ok(!(sequel.blocks as Block[]).some((b) => b.id === "z"));
});

test("registers recorded by applyBlockOps/recordBlockOps use the documented keys", () => {
  const t = baseTree();
  const result = applyBlockOps(
    t,
    [
      { k: "put", id: "x", parentId: null, block: { id: "x", type: "paragraph", content: "n" }, v: 3 },
      { k: "order", parentId: null, ids: ["y", "x", "z", "p1"], v: 4 },
    ],
    "A",
    {},
  );
  assert.deepEqual(result.registers[blockRegisterKey("x")], { v: 3, actor: "A" });
  assert.deepEqual(result.registers[orderRegisterKey(null)], { v: 4, actor: "A" });
  assert.deepEqual(recordBlockOps({}, [], "B"), {}, "no ops → same table");
});

// ── convergence (the proof) ──────────────────────────────────────────────────

/**
 * Concurrent writers on DIFFERENT blocks: A edits x and appends w; B edits y
 * and deletes z. Deliver the streams in opposite orders on two replicas and
 * require one final tree.
 */
test("convergence: concurrent edits on different blocks converge in either order", () => {
  const base = baseTree();

  const nextA = structuredClone(base);
  (nextA[0] as Block).content = "A marker";
  nextA.push(block("w", "appended by A"));
  const nextB = structuredClone(base);
  (nextB[1] as Block).content = "B marker";
  const droppedB = nextB.filter((b) => b.id !== "z");

  const a = replica(base);
  const opsA = authorWrite(a, base, nextA, "A");
  const b = replica(base);
  const opsB = authorWrite(b, base, droppedB, "B");

  // Replica pair R: receives A's ops then B's ops.
  const rAFirst = replica(base);
  receive(rAFirst, opsA, "A");
  receive(rAFirst, opsB, "B");
  // Replica pair S: receives them in the opposite order.
  const rBFirst = replica(base);
  receive(rBFirst, opsB, "B");
  receive(rBFirst, opsA, "A");

  assert.deepEqual(rAFirst.blocks, rBFirst.blocks, "opposite delivery orders converge");
  // Expected final tree: B's root order register won (its batch carried a
  // higher (v, actor) on the shared clock), A's w appended after it sorted.
  assert.deepEqual(rAFirst.blocks, [
    block("x", "A marker"),
    block("y", "B marker"),
    { ...block("p1", "p1"), children: [block("c1", "c1")] },
    block("w", "appended by A"),
  ]);
  const tree = rAFirst.blocks as Block[];
  assert.equal(tree.find((entry) => entry.id === "w")?.content, "appended by A");
  assert.equal(tree.find((entry) => entry.id === "x")?.content, "A marker");
  assert.equal(tree.find((entry) => entry.id === "y")?.content, "B marker");
  assert.ok(!tree.some((entry) => entry.id === "z"), "B's tombstone won everywhere");
});

test("convergence: equal v is broken by actor, identically on both replicas", () => {
  const base = baseTree();
  const opA: BlockOp = { k: "put", id: "x", parentId: null, block: { id: "x", type: "paragraph", content: "A text" }, v: 42 };
  const opB: BlockOp = { k: "put", id: "x", parentId: null, block: { id: "x", type: "paragraph", content: "B text" }, v: 42 };

  const a = applyBlockOps(base, [opA], "A", {});
  const b = applyBlockOps(base, [opB], "B", {});
  const aThenB = applyBlockOps(a.blocks, [opB], "B", a.registers);
  const bThenA = applyBlockOps(b.blocks, [opA], "A", b.registers);

  assert.deepEqual(aThenB.blocks, bThenA.blocks, "actor tie-break converges");
  assert.equal((aThenB.blocks as Block[]).find((entry) => entry.id === "x")?.content, "B text");
  assert.equal(bThenA.changed, false, "the lower actor loses on the replica that already has B");
});

test("an order op alone reorders; live blocks missing from its list append sorted", () => {
  const tree = baseTree();
  const result = applyBlockOps(
    tree,
    [{ k: "order", parentId: null, ids: ["z", "x"], v: 5 }],
    "A",
    {},
  );
  assert.ok(result.changed);
  assert.deepEqual((result.blocks as Block[]).map((entry) => entry.id), ["z", "x", "p1", "y"]);
});

test("convergence: both editing the SAME block — higher (v, actor) wins on both", () => {
  const base = baseTree();
  const nextA = structuredClone(base);
  (nextA[0] as Block).content = "A text";
  const nextB = structuredClone(base);
  (nextB[0] as Block).content = "B text";

  const a = replica(base);
  const opsA = authorWrite(a, base, nextA, "A");
  const b = replica(base);
  const opsB = authorWrite(b, base, nextB, "B");

  const rAFirst = replica(base);
  receive(rAFirst, opsA, "A");
  receive(rAFirst, opsB, "B");
  const rBFirst = replica(base);
  receive(rBFirst, opsB, "B");
  receive(rBFirst, opsA, "A");

  assert.deepEqual(rAFirst.blocks, rBFirst.blocks, "one winner on both replicas");
  // The shared module clock stamps B's batch after A's, so B is the later
  // writer and B's (v, actor) beats A's on both replicas.
  assert.equal((rAFirst.blocks as Block[])[0].content, "B text");
});

// ── boundary schema for the content plane ────────────────────────────────────

const putOp = { k: "put", id: "b1", parentId: null, block: { id: "b1", type: "paragraph", content: "he" }, v: 1 };
const orderOp = { k: "order", parentId: null, ids: ["b1"], v: 2 };

test("schema: valid blocks and pages events pass", () => {
  assert.ok(validateCollabEvent({ t: "blocks", actor: "A", seq: 1, pageId: "p1", ops: [putOp, orderOp] }));
  assert.ok(validateCollabEvent({ t: "pages", actor: "A", seq: 1, workspaceId: "w1" }));
});

test("schema: children inside block, 501 ops, non-finite v, 129-char id, bad kind → null", () => {
  const blocksWithChildren = {
    t: "blocks", actor: "A", seq: 1, pageId: "p1",
    ops: [{ ...putOp, block: { ...putOp.block, children: [{ id: "k", type: "paragraph", content: "" }] } }],
  };
  assert.equal(validateCollabEvent(blocksWithChildren), null, "block payload may not smuggle children");

  const tooMany = {
    t: "blocks", actor: "A", seq: 1, pageId: "p1",
    ops: Array.from({ length: 501 }, (_, i) => ({ ...putOp, id: `b${i}`, block: { ...putOp.block, id: `b${i}` } })),
  };
  assert.equal(validateCollabEvent(tooMany), null, "ops cap is 500");

  const notFinite = {
    t: "blocks", actor: "A", seq: 1, pageId: "p1",
    ops: [{ ...putOp, v: Number.NaN }],
  };
  assert.equal(validateCollabEvent(notFinite), null, "v must be finite");

  const longId = { k: "put", id: "a".repeat(129), parentId: null, block: { id: "x".repeat(129), type: "paragraph", content: "" }, v: 1 };
  assert.equal(validateCollabEvent({ t: "blocks", actor: "A", seq: 1, pageId: "p1", ops: [longId] }), null, "ids ≤ 128 chars");

  assert.equal(
    validateCollabEvent({ t: "blocks", actor: "A", seq: 1, pageId: "p1", ops: [{ ...putOp, k: "swap" }] }),
    null,
    "unknown op kind → null",
  );
  assert.equal(validateCollabEvent({ t: "blocks", actor: "A", seq: 1, pageId: "p1", ops: [] }), null, "empty ops → null");
  assert.equal(validateCollabEvent({ t: "pages", actor: "A", seq: 1 }), null, "missing workspaceId → null");
});

// ── payload split (requirement 1) ────────────────────────────────────────────

test("split: a diff over 60 KB yields several events, each under budget, ops in order", () => {
  let seq = 0;
  const ops: BlockOp[] = [];
  for (let index = 0; index < 9; index += 1) {
    ops.push({ k: "put", id: `big${index}`, parentId: null, block: { id: `big${index}`, type: "code", content: "a".repeat(15000) }, v: index + 1 });
  }
  const events = splitBlockEvents("page-1", "A", ops, () => (seq += 1));
  assert.ok(events.length >= 3, `${events.length} events for ~135 KB of ops`);
  const flat: BlockOp[] = [];
  for (const event of events) {
    assert.equal(event.t, "blocks");
    assert.ok(event.ops.length > 0 && event.ops.length <= 500, "each event carries ops");
    assert.ok(
      JSON.stringify(event).length <= BLOCK_EVENT_BUDGET,
      `serialized event ${JSON.stringify(event).length} ≤ ${BLOCK_EVENT_BUDGET}`,
    );
    flat.push(...event.ops);
  }
  assert.deepEqual(flat.map(op => op.id), ops.map(op => op.id), "ops kept in order, none dropped");
});

test("split: a single op over the budget is dropped (Caveat), the rest still flow", () => {
  let seq = 0;
  const huge = { k: "put", id: "huge", parentId: null, block: { id: "huge", type: "draw", content: "s".repeat(70000) }, v: 1 } as BlockOp;
  const ok = { k: "put", id: "ok", parentId: null, block: { id: "ok", type: "paragraph", content: "x" }, v: 2 } as BlockOp;
  const events = splitBlockEvents("page-1", "A", [huge, ok], () => (seq += 1));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].ops.map(op => op.id), ["ok"], "the oversized op is not sent");
});

test("split: an event never carries more than 500 ops", () => {
  let seq = 0;
  const ops: BlockOp[] = [];
  for (let index = 0; index < 510; index += 1) {
    ops.push({ k: "put", id: `s${index}`, parentId: null, block: { id: `s${index}`, type: "paragraph", content: "x" }, v: index + 1 });
  }
  const events = splitBlockEvents("page-1", "A", ops, () => (seq += 1));
  for (const event of events) {
    assert.ok(event.ops.length <= 500, "ops-per-event cap respected");
  }
  assert.equal(events.reduce((sum, event) => sum + event.ops.length, 0), 510);
});
