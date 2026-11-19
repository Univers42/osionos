// Applying a shell from the empty-page starter: one commit (one undo step), blocks
// with ids of their own, and the caret in the first block.

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block/model/types";
import { applyShell } from "@/features/page-shells/model/applyShell";

const ids = (blocks: Block[]): string[] => (JSON.stringify(blocks).match(/"id":"[^"]+"/g) ?? []);

function target() {
  const calls = { commits: [] as Block[][], focus: [] as string[] };
  return { calls, editor: { commitContent: (b: Block[]) => calls.commits.push(b), focusBlock: (id: string) => calls.focus.push(id) } };
}

test("a known shell lands in one commit and takes the caret", async () => {
  const { calls, editor } = target();
  assert.equal(await applyShell("landing", editor), true);
  assert.equal(calls.commits.length, 1);
  assert.ok(calls.commits[0].length > 0);
  assert.equal(calls.focus.length, 1);
});

test("every block gets a fresh unique id, not a seed counter id", async () => {
  const { calls, editor } = target();
  await applyShell("profile", editor);
  const all = ids(calls.commits[0]);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.some((id) => /"block-\d+"/.test(id)), false);
});

test("an unknown shell commits nothing", async () => {
  const { calls, editor } = target();
  assert.equal(await applyShell("nope", editor), false);
  assert.equal(calls.commits.length, 0);
});
