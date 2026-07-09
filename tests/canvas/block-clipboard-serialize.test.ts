/* ************************************************************************** */
/*  block-clipboard-serialize.test.ts — selection clipboard (de)serialize    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import {
  lastSelectionRootId,
  parseBlocksJson,
  plainTextToParagraphs,
  selectionRoots,
  serializeSelectionToClipboard,
} from "../../src/services/page-actions/blockClipboardSerialize.ts";

function block(id: string, content: string, children?: Block[]): Block {
  return { id, type: "paragraph", content, ...(children ? { children } : {}) };
}

test("serialize → JSON parse is a lossless round-trip with fresh ids", () => {
  const source = [block("p1", "hello", [block("p1a", "child")]), block("p2", "world")];
  const payload = serializeSelectionToClipboard(source);
  const parsed = parseBlocksJson(payload.json);
  assert.ok(parsed, "JSON payload parses back to blocks");
  // Structure + content preserved…
  assert.deepEqual(parsed?.map((b) => [b.content, b.children?.map((c) => c.content) ?? []]), [
    ["hello", ["child"]],
    ["world", []],
  ]);
  // …but every id is regenerated so a paste never collides with the source.
  const sourceIds = new Set(["p1", "p1a", "p2"]);
  const walk = (blocks: Block[]): void => {
    for (const b of blocks) {
      assert.ok(!sourceIds.has(b.id), `pasted id ${b.id} must differ from source`);
      if (b.children) walk(b.children);
    }
  };
  walk(parsed ?? []);
});

test("parseBlocksJson rejects foreign / malformed payloads", () => {
  assert.equal(parseBlocksJson(null), null);
  assert.equal(parseBlocksJson("not json"), null);
  assert.equal(parseBlocksJson(JSON.stringify({ kind: "something-else", blocks: [] })), null);
});

test("plainTextToParagraphs splits on blank lines and never parses markdown", () => {
  const blocks = plainTextToParagraphs("# heading stays literal\n\n- bullet stays literal");
  assert.equal(blocks.length, 2);
  assert.ok(blocks.every((b) => b.type === "paragraph"));
  assert.equal(blocks[0].content, "# heading stays literal");
  assert.equal(blocks[1].content, "- bullet stays literal");
  // Empty input still yields one (empty) paragraph rather than nothing.
  assert.deepEqual(plainTextToParagraphs("").map((b) => b.content), [""]);
});

test("selectionRoots returns top-most selected blocks; a parent absorbs its children", () => {
  const blocks = [block("A", "a", [block("A1", "a1"), block("A2", "a2")]), block("B", "b")];
  // Selecting A + A1 + B → A is a root (A1 rides along inside it), B is a root; A1 is not a separate root.
  const roots = selectionRoots(blocks, new Set(["A", "A1", "B"]));
  assert.deepEqual(roots.map((b) => b.id), ["A", "B"]);
  assert.equal(lastSelectionRootId(blocks, new Set(["A", "A1", "B"])), "B");
  assert.equal(lastSelectionRootId(blocks, new Set()), null);
});
