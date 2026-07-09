/* ************************************************************************** */
/*  block-clipboard-internal.test.ts — in-memory copy → lossless paste match  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import { copyBlocks, matchInternalCopy } from "../../src/features/block-editor/model/blockClipboard.ts";
import { serializeSelectionToClipboard } from "../../src/services/page-actions/blockClipboardSerialize.ts";

test("copyBlocks → matchInternalCopy round-trips the subtree losslessly with fresh ids", () => {
  const callout: Block = {
    id: "c1",
    type: "callout",
    content: "keep my type",
    calloutType: "warning",
    children: [{ id: "c1a", type: "paragraph", content: "child rides along" }],
  } as Block;
  const content: Block[] = [callout, { id: "p2", type: "paragraph", content: "not copied" }];

  copyBlocks(content, ["c1"]);
  const markdown = serializeSelectionToClipboard([callout]).markdown;

  const pasted = matchInternalCopy(markdown);
  assert.ok(pasted, "the copied markdown flavour matches the internal payload");
  assert.equal(pasted?.length, 1);
  // Lossless: block type + non-markdown props + children survive…
  assert.equal(pasted?.[0].type, "callout");
  assert.equal((pasted?.[0] as Block & { calloutType?: string }).calloutType, "warning");
  assert.equal(pasted?.[0].children?.[0].content, "child rides along");
  // …with regenerated ids so a paste never collides with the source.
  assert.notEqual(pasted?.[0].id, "c1");
  assert.notEqual(pasted?.[0].children?.[0].id, "c1a");
});

test("matchInternalCopy rejects text that is not the internal copy", () => {
  const paragraph: Block = { id: "p1", type: "paragraph", content: "hello" };
  copyBlocks([paragraph], ["p1"]);
  assert.equal(matchInternalCopy("something else entirely"), null);
});
