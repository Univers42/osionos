/* ************************************************************************** */
/*  blockTree-select.test.ts — hierarchical multi-select tree helpers        */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import {
  collectDescendantIds,
  expandSelectionWithDescendants,
  removeBlocksFromTree,
} from "../../src/entities/block/model/blockTreeUtils.ts";

function block(id: string, children?: Block[]): Block {
  return { id, type: "paragraph", content: id, ...(children ? { children } : {}) };
}

/** A ( A1, A2 ( A2a ) ), B — a two-level tree used by every case. */
function tree(): Block[] {
  return [block("A", [block("A1"), block("A2", [block("A2a")])]), block("B")];
}

test("collectDescendantIds: every descendant, self excluded", () => {
  const a = tree()[0];
  assert.deepEqual(collectDescendantIds(a).sort(), ["A1", "A2", "A2a"]);
  assert.deepEqual(collectDescendantIds(block("leaf")), []);
});

test("expandSelectionWithDescendants: selecting a parent takes its whole subtree", () => {
  const blocks = tree();
  assert.deepEqual([...expandSelectionWithDescendants(blocks, ["A"])].sort(), ["A", "A1", "A2", "A2a"]);
  assert.deepEqual([...expandSelectionWithDescendants(blocks, ["A2"])].sort(), ["A2", "A2a"]);
  // A leaf expands to just itself; unknown ids are kept but add nothing.
  assert.deepEqual([...expandSelectionWithDescendants(blocks, ["B", "ghost"])].sort(), ["B", "ghost"]);
});

test("removeBlocksFromTree: drops the whole branch (children ride along)", () => {
  const blocks = tree();
  const afterA = removeBlocksFromTree(blocks, new Set(["A"]));
  assert.deepEqual(afterA.map((b) => b.id), ["B"]); // A + A1 + A2 + A2a all gone

  const afterA2 = removeBlocksFromTree(blocks, new Set(["A2"]));
  const a = afterA2.find((b) => b.id === "A");
  assert.deepEqual(a?.children?.map((c) => c.id), ["A1"]); // A2 + A2a gone, A1 kept
});

test("removeBlocksFromTree is immutable: it drops the subtree without promoting children up", () => {
  const blocks = tree();
  const snapshot = JSON.stringify(blocks);
  const dropped = removeBlocksFromTree(blocks, new Set(["A2"]));
  assert.equal(JSON.stringify(blocks), snapshot, "input tree not mutated");
  // Contrast with the promotion semantics of a single-block delete: the removed
  // parent's descendant A2a must NOT survive at the grandparent level.
  const droppedA = dropped.find((b) => b.id === "A");
  assert.ok(!droppedA?.children?.some((c) => c.id === "A2a"), "A2a is dropped with its parent, not orphan-promoted");
});
