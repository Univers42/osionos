import assert from "node:assert/strict";
import test from "node:test";

import { getBlockCategory } from "../../src/entities/block/model/blockCategories.ts";
import { EMBED_BLOCK_TYPES } from "../../src/features/block-editor/model/marqueeGeometry.ts";
import { estimateBlockHeight } from "../../src/entities/block/model/blockVirtualization.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import { parseMarkdownToBlocks } from "../../packages/markdown-engine/markdown/shortcuts.ts";

// `draw` is retired but stays a block type so stored pages keep loading; `whiteboard` is
// its replacement. Both must be treated as void leaves everywhere a list of such types lives.
test("draw and whiteboard are void leaves with the same category", () => {
  assert.deepEqual(getBlockCategory("whiteboard"), getBlockCategory("draw"));
});

test("both are in the marquee embed list", () => {
  assert.equal(EMBED_BLOCK_TYPES.includes("draw"), true);
  assert.equal(EMBED_BLOCK_TYPES.includes("whiteboard"), true);
});

test("both have a virtualization estimate", () => {
  assert.ok(estimateBlockHeight({ id: "x", type: "draw", content: "" }) > 0);
  assert.ok(estimateBlockHeight({ id: "x", type: "whiteboard", content: "" }) > 0);
});

// A fence-looking body must come back byte for byte: the body is data, never markdown.
test("content is byte-identical across serialize and parse", () => {
  const hostile = '{"a":"```","b":"# not a heading","c":"- not a list"}';
  const draw = parseMarkdownToBlocks(serializeBlocksToMarkdown([{ id: "d", type: "draw", content: hostile }]));
  assert.equal(draw[0].type, "draw");
  assert.equal(draw[0].content, hostile);

  const title = "Q3 # plan - draft";
  const board = parseMarkdownToBlocks(serializeBlocksToMarkdown([{ id: "w", type: "whiteboard", content: title, boardSlug: "abc123def456" }]));
  assert.equal(board[0].type, "whiteboard");
  assert.equal(board[0].content, title);
});
