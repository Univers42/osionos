/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdown-fidelity.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import { parseMarkdownToBlocks } from "../../packages/markdown-engine/markdown/shortcuts.ts";
import { fileToPage, pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";
import { MARKERS, findMismatch, randomTree } from "./markdown-fidelity-fixtures.ts";

let seq = 0;
const make = (block: Partial<Block> & { type: Block["type"] }): Block => ({
  id: `t${seq++}`,
  content: "",
  ...block,
});
const KEEP = { keepEmptyParagraphs: true } as const;
const roundTrip = (blocks: Block[]): Block[] => parseMarkdownToBlocks(serializeBlocksToMarkdown(blocks, KEEP), KEEP);

test("defect 1a: a toggle inside a toggle keeps its nesting", () => {
  const tree = [make({ type: "toggle", content: "outer", children: [make({ type: "toggle", content: "inner", children: [make({ type: "paragraph", content: "deep" })] })] })];
  const back = roundTrip(tree);
  assert.equal(back[0]?.type, "toggle");
  assert.equal(back[0]?.children?.[0]?.type, "toggle");
  assert.equal(back[0]?.children?.[0]?.children?.[0]?.content, "deep");
});

test("defect 1b: a list inside a toggle inside a list keeps its nesting", () => {
  const tree = [make({ type: "bulleted_list", content: "outer", children: [make({ type: "toggle", content: "T", children: [make({ type: "bulleted_list", content: "inner" })] })] })];
  const back = roundTrip(tree);
  assert.equal(back[0]?.type, "bulleted_list");
  assert.equal(back[0]?.children?.[0]?.type, "toggle");
  assert.equal(back[0]?.children?.[0]?.children?.[0]?.type, "bulleted_list");
  assert.equal(back[0]?.children?.[0]?.children?.[0]?.content, "inner");
});

test("defect 1c: two paragraphs inside a toggle stay two blocks", () => {
  const tree = [make({ type: "toggle", content: "T", children: [make({ type: "paragraph", content: "A" }), make({ type: "paragraph", content: "B" })] })];
  const back = roundTrip(tree);
  assert.deepEqual(back[0]?.children?.map((b) => b.content), ["A", "B"]);
});

test("defect 2: empty paragraphs survive first, middle and last (page and toggle)", () => {
  const page: Block[] = [make({ type: "paragraph", content: "" }), make({ type: "paragraph", content: "A" }), make({ type: "paragraph", content: "" }), make({ type: "paragraph", content: "B" }), make({ type: "paragraph", content: "" })];
  assert.equal(findMismatch(page, roundTrip(page)), null);
  const inner: Block[] = [make({ type: "paragraph", content: "" }), make({ type: "paragraph", content: "A" }), make({ type: "paragraph", content: "" })];
  const tree = [make({ type: "toggle", content: "T", children: inner })];
  assert.equal(findMismatch(tree, roundTrip(tree)), null);
});

test("defect 3: tables keep 1 to 5 columns", () => {
  for (const cols of [1, 2, 5]) {
    const cells = Array.from({ length: cols }, (_, index) => `c${index}`);
    const tree = [make({ type: "table_block", tableData: [cells, cells.map((c) => `${c}2`)] })];
    const back = roundTrip(tree);
    assert.deepEqual(back[0]?.tableData, [cells, cells.map((c) => `${c}2`)]);
  }
});

for (const marker of MARKERS) {
  test(`line-start marker survives as a paragraph: ${JSON.stringify(marker)}`, () => {
    const text = `${marker} tail`;
    const back = roundTrip([make({ type: "paragraph", content: text })]);
    assert.equal(back.length, 1);
    assert.equal(back[0]?.type, "paragraph");
    assert.equal(back[0]?.content, text);
  });
}

test("line-start backslash text survives: existing backslash is not eaten", () => {
  for (const text of ["\\- x", "\\\\- x", "\\hello"]) {
    const back = roundTrip([make({ type: "paragraph", content: text })]);
    assert.equal(back[0]?.content, text);
  }
});

test("property: 500 seeded trees round-trip (ids excluded)", () => {
  for (let seed = 1; seed <= 500; seed++) {
    const tree = randomTree(seed);
    const markdown = serializeBlocksToMarkdown(tree, KEEP);
    const back = parseMarkdownToBlocks(markdown, KEEP);
    const mismatch = findMismatch(tree, back);
    assert.equal(mismatch, null, `seed ${seed}: ${mismatch}\n${markdown}`);
  }
});

test("pinned: without the option an empty paragraph still disappears", () => {
  const tree = [make({ type: "paragraph", content: "A" }), make({ type: "paragraph", content: "" }), make({ type: "paragraph", content: "B" })];
  const back = parseMarkdownToBlocks(serializeBlocksToMarkdown(tree));
  assert.deepEqual(back.map((b) => b.content), ["A", "B"]);
});

test("codec: an empty paragraph before a nested toggle keeps every block id", () => {
  const page: PageEntry = {
    _id: "p-r1", workspaceId: "ws", title: "R1", content: [
      make({ type: "paragraph", content: "A" }),
      make({ type: "paragraph", content: "" }),
      make({ type: "toggle", content: "outer", children: [make({ type: "toggle", content: "inner", children: [make({ type: "paragraph", content: "deep" })] })] }),
    ],
  };
  const done = fileToPage(pageToFile(page));
  const collect = (blocks: Block[]): string[] => blocks.flatMap((b) => [b.id, ...collect(b.children ?? [])]);
  assert.deepEqual(collect(done.content), collect(page.content ?? []));
  assert.equal(done.content[1]?.type, "paragraph");
  assert.equal(done.content[1]?.content, "");
  assert.equal(done.content[2]?.children?.[0]?.type, "toggle");
});

test("clipboard form: a nested list stays tight and round-trips", () => {
  const list = [make({ type: "bulleted_list", content: "a", children: [
    make({ type: "bulleted_list", content: "b" }), make({ type: "bulleted_list", content: "c" }),
    make({ type: "to_do", content: "d", checked: true }),
  ] })];
  const markdown = serializeBlocksToMarkdown(list);
  assert.equal(markdown, "- a\n  - b\n  - c\n\n  - [x] d");
  const back = parseMarkdownToBlocks(markdown);
  assert.deepEqual(back[0]?.children?.map((child) => child.type), ["bulleted_list", "bulleted_list", "to_do"]);
  assert.equal(back[0]?.children?.[2]?.checked, true);
});

test("clipboard form: paragraphs inside a toggle and under a list item stay separate", () => {
  const toggle = make({ type: "toggle", content: "t", children: [make({ type: "paragraph", content: "p1" }), make({ type: "paragraph", content: "p2" })] });
  const item = make({ type: "bulleted_list", content: "item", children: [make({ type: "paragraph", content: "note" })] });
  const back = parseMarkdownToBlocks(serializeBlocksToMarkdown([toggle, item]));
  assert.deepEqual(back[0]?.children?.map((child) => child.content), ["p1", "p2"]);
  assert.equal(back[1]?.content, "item");
  assert.equal(back[1]?.children?.[0]?.content, "note");
});
