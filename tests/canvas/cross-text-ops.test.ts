/* ************************************************************************** */
/*  cross-text-ops.test.ts — cross-block selection slicing/clipboard/collapse */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import {
  collapseCrossText,
  crossTextSegments,
  plainTextOfInlineSource,
  serializeCrossText,
  sliceInlineSource,
} from "../../src/features/block-editor/model/crossTextOps.ts";

const block = (id: string, content: string, type: Block["type"] = "paragraph", children?: Block[]): Block =>
  ({ id, type, content, ...(children ? { children } : {}) }) as Block;

const tree = (): Block[] => [
  block("a", "alpha **bold** end"),
  block("b", "middle *ital*"),
  block("c", "tail text", "heading_2"),
];

test("cross-text: sliceInlineSource keeps formatting tokens", () => {
  // The serializer emits the editor's CANONICAL tagged source ([b]…[/b]) —
  // lossless round-trip through parseInline in both syntaxes.
  assert.equal(sliceInlineSource("alpha **bold** end", 6), "[b]bold[/b] end");
  assert.equal(sliceInlineSource("alpha **bold** end", 0, 5), "alpha");
  // slicing THROUGH a bold span keeps the wrapper on the kept half
  assert.equal(sliceInlineSource("alpha **bold** end", 0, 8), "alpha [b]bo[/b]");
  // out-of-bounds clamps
  assert.equal(sliceInlineSource("ab", 0, 99), "ab");
  assert.equal(sliceInlineSource("ab", 5), "");
});

test("cross-text: plain text strips markup", () => {
  assert.equal(plainTextOfInlineSource("alpha **bold** `code` $x$"), "alpha bold code x");
});

test("cross-text: segments = partial start, whole middles, partial end", () => {
  const segments = crossTextSegments(tree(), {
    start: { blockId: "a", offset: 6 },
    end: { blockId: "c", offset: 4 },
    middleIds: ["b"],
  });
  assert.deepEqual(
    segments.map((s) => s.source),
    ["[b]bold[/b] end", "middle *ital*", "tail"],
  );
  assert.equal(segments[2].type, "heading_2");
});

test("cross-text: clipboard flavors — markdown keeps format, plain strips it", () => {
  const payload = serializeCrossText(tree(), {
    start: { blockId: "a", offset: 6 },
    end: { blockId: "c", offset: 4 },
    middleIds: ["b"],
  });
  assert.ok(payload.markdown.includes("[b]bold[/b] end"));
  assert.ok(payload.markdown.includes("## tail"), "heading prefix preserved");
  assert.ok(payload.html.includes("<strong>") || payload.html.includes("<b>"), "html carries bold");
  assert.ok(payload.html.includes("<h2"), "html carries the heading");
  assert.equal(payload.plain, "bold end\nmiddle ital\ntail");
  const parsed = JSON.parse(payload.json);
  assert.equal(parsed.segments.length, 3);
});

test("cross-text: collapse merges head + tail into the start block", () => {
  const result = collapseCrossText(tree(), {
    start: { blockId: "a", offset: 6 },
    end: { blockId: "c", offset: 5 },
    middleIds: ["b"],
  });
  assert.ok(result);
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].id, "a");
  assert.equal(result.blocks[0].content, "alpha text");
  assert.equal(result.caretBlockId, "a");
  assert.equal(result.caretOffset, 6, "caret sits at the seam");
});

test("cross-text: collapse with typed text inserts at the seam", () => {
  const result = collapseCrossText(tree(), {
    start: { blockId: "a", offset: 5 },
    end: { blockId: "c", offset: 9 },
    middleIds: ["b"],
  }, "X");
  assert.ok(result);
  assert.equal(result.blocks[0].content, "alphaX");
  assert.equal(result.caretOffset, 6);
});

test("cross-text: same-block range collapses within the block", () => {
  const result = collapseCrossText(tree(), {
    start: { blockId: "b", offset: 0 },
    end: { blockId: "b", offset: 7 },
    middleIds: [],
  });
  assert.ok(result);
  assert.equal(result.blocks.length, 3, "no blocks removed");
  assert.equal(result.blocks[1].content, "[i]ital[/i]");
});

test("cross-text: uncovered children of a removed end block promote", () => {
  const blocks = [
    block("a", "start here"),
    block("p", "parent tail", "paragraph", [block("kid", "survives")]),
  ];
  const result = collapseCrossText(blocks, {
    start: { blockId: "a", offset: 5 },
    end: { blockId: "p", offset: 11 },
    middleIds: [],
  });
  assert.ok(result);
  assert.equal(result.blocks[0].content, "start");
  const ids = result.blocks.map((b) => b.id);
  assert.ok(ids.includes("kid"), "uncovered child promoted, not deleted");
  assert.ok(!ids.includes("p"));
});
