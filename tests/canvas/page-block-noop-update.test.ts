import assert from "node:assert/strict";
import { test } from "node:test";
import { blockUpdateIsNoop } from "../../src/store/pageStore.blockNoop.ts";

// #262: a canvas that re-announced the state it already held went through
// updateBlock, was stamped as an edit and PATCHed. Viewing wrote pages, and
// "Edited 1 min ago" stopped meaning anything.
const cells = [{ id: "a", colSpan: 12, rowSpan: 2 }];
const blocks = [
  { id: "root", type: "layout", content: "", layoutCells: cells, children: [
    { id: "child", type: "paragraph", content: "hello" },
  ] },
] as never[];

test("the same values are a no-op, whatever key order they arrive in", () => {
  assert.equal(blockUpdateIsNoop(blocks, "root", { layoutCells: [{ rowSpan: 2, colSpan: 12, id: "a" }] } as never), true);
  assert.equal(blockUpdateIsNoop(blocks, "child", { content: "hello" } as never), true);
});

test("a changed value in a nested block is a real edit", () => {
  assert.equal(blockUpdateIsNoop(blocks, "child", { content: "hello!" } as never), false);
  assert.equal(blockUpdateIsNoop(blocks, "root", { layoutCells: [{ id: "a", colSpan: 6, rowSpan: 2 }] } as never), false);
});

test("an empty update and an unknown block change nothing or stay the store's call", () => {
  assert.equal(blockUpdateIsNoop(blocks, "root", {} as never), true);
  assert.equal(blockUpdateIsNoop(blocks, "missing", { content: "x" } as never), false);
});

test("the whole-page path compares what the server would hold", async () => {
  const { persistedValueIsUnchanged } = await import("../../src/store/pageStore.blockNoop.ts");
  assert.equal(persistedValueIsUnchanged([{ a: 1, b: undefined }], [{ a: 1 }]), true);
  assert.equal(persistedValueIsUnchanged([{ a: 1, b: 2 }], [{ b: 2, a: 1 }]), true);
  assert.equal(persistedValueIsUnchanged([{ a: 1 }], [{ a: 2 }]), false);
  assert.equal(persistedValueIsUnchanged(undefined, []), false);
});
