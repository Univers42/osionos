// Slash "Sections": the chosen section lands where "/" was typed, as one content
// replacement (one undo step), with ids of its own.

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block/model/types";
import { firstLeafId, placeSection } from "@/features/slash-commands/model/sectionInsert";

const para = (id: string, content = ""): Block => ({ id, type: "paragraph", content });
const section = (): Block[] => [
  { id: "s1", type: "heading_2", content: "Title" },
  { id: "s2", type: "column_list", content: "", style: { layout: "grid" }, children: [{ id: "s3", type: "column", content: "", children: [para("s4", "Card")] }] },
];
const ids = (blocks: Block[]): string[] => JSON.stringify(blocks).match(/"id":"[^"]+"/g) ?? [];

test("an emptied trigger paragraph is replaced by the section", () => {
  const next = placeSection([para("a", "Before"), para("t"), para("z", "After")], "t", "", section()).content;
  assert.deepEqual(next.map((block) => block.type), ["paragraph", "heading_2", "column_list", "paragraph"]);
  assert.equal(next[0].content, "Before");
  assert.equal(next[3].content, "After");
});

test("a trigger with text left keeps its text, and the section follows it", () => {
  const next = placeSection([para("t", "Intro /hero")], "t", "Intro", section()).content;
  assert.deepEqual(next.map((block) => [block.type, block.content]), [["paragraph", "Intro"], ["heading_2", "Title"], ["column_list", ""]]);
});

test("a trigger inside a column receives the section in that column", () => {
  const page: Block[] = [{ id: "cl", type: "column_list", content: "", children: [{ id: "c", type: "column", content: "", children: [para("t")] }] }];
  const next = placeSection(page, "t", "", section()).content;
  assert.deepEqual(next[0].children?.[0].children?.map((block) => block.type), ["heading_2", "column_list"]);
});

test("a missing trigger appends the section at the end", () => {
  const next = placeSection([para("a", "Only")], "gone", "", section()).content;
  assert.deepEqual(next.map((block) => block.type), ["paragraph", "heading_2", "column_list"]);
});

test("the placed blocks get fresh ids, children included, and keep their style", () => {
  const source = section();
  const next = placeSection([para("t")], "t", "", source).content;
  const before = new Set(ids(source));
  assert.equal(ids(next).filter((id) => before.has(id)).length, 0);
  assert.deepEqual(next[1].style, { layout: "grid" });
  assert.equal(next[1].children?.[0].children?.[0].content, "Card");
});

test("the caret goes to the first placed leaf", () => {
  const { placed } = placeSection([para("t")], "t", "", section());
  assert.equal(firstLeafId(placed), placed[0].id);
  assert.equal(firstLeafId(placed.slice(1)), placed[1].children?.[0].children?.[0].id);
  assert.equal(firstLeafId([]), null);
});
