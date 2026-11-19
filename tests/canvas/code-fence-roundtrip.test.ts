import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import { parseMarkdownToBlocks } from "../../packages/markdown-engine/markdown/shortcuts.ts";

// The longer-fence round-trip cases (README, property, backtick-run fixed cases) left with the
// FF-7 (e) interim and return with the fence fix (a673ffbe5) at FF-17.

test("code without a 3+ backtick run keeps the 3-backtick fence byte for byte", () => {
  const block: Block = { id: "c", type: "code", content: "a `b` ``c``\nd", language: "ts" };
  assert.equal(serializeBlocksToMarkdown([block]), "```ts\na `b` ``c``\nd\n```");
});

test("a code block whose body holds a 3-run is still written with a 3-backtick fence", () => {
  const block: Block = { id: "c", type: "code", content: "```\nx", language: "" };
  assert.equal(serializeBlocksToMarkdown([block]), "```\n```\nx\n```");
});

test("empty code body round-trips", () => {
  const block: Block = { id: "code-1", type: "code", content: "", language: "" };
  const blocks = parseMarkdownToBlocks(serializeBlocksToMarkdown([block]));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.content, "");
});

test("parser: a fence closes only on a fence at least as long as its opener", () => {
  const blocks = parseMarkdownToBlocks("````md\n```\n\n\n\nx\n```\n````\n\nafter");
  assert.equal(blocks[0]?.type, "code");
  assert.equal(blocks[0]?.content, "```\n\n\n\nx\n```");
  assert.equal(blocks.at(-1)?.content, "after");
});
