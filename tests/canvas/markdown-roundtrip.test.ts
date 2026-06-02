/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdown-roundtrip.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import { parseMarkdownToBlocks } from "../../src/shared/lib/markengine/markdown/shortcuts.ts";

let seq = 0;
const make = (block: Partial<Block> & { type: Block["type"] }): Block => ({
  id: `b${seq++}`,
  content: "",
  ...block,
});

/** Serialize a single block, parse it back, return the first round-tripped block. */
function roundTrip(block: Block): Block {
  const markdown = serializeBlocksToMarkdown([block]);
  const parsed = parseMarkdownToBlocks(markdown);
  assert.equal(parsed.length, 1, `expected one block from:\n${markdown}`);
  return parsed[0];
}

test("every heading level survives the round-trip (incl. h4-h6)", () => {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    const out = roundTrip(make({ type: `heading_${level}`, content: `Title ${level}` }));
    assert.equal(out.type, `heading_${level}`);
    assert.equal(out.content, `Title ${level}`);
  }
});

test("paragraph, quote and divider survive", () => {
  assert.equal(roundTrip(make({ type: "paragraph", content: "Hello world" })).content, "Hello world");
  const quote = roundTrip(make({ type: "quote", content: "A quote" }));
  assert.equal(quote.type, "quote");
  assert.equal(quote.content, "A quote");
  assert.equal(roundTrip(make({ type: "divider" })).type, "divider");
});

test("toggle survives as a toggle (not a quote)", () => {
  const out = roundTrip(make({ type: "toggle", content: "Toggle summary" }));
  assert.equal(out.type, "toggle");
  assert.equal(out.content, "Toggle summary");
  assert.equal(out.headingLevel, undefined);
});

test("a toggle heading keeps its level through the round-trip", () => {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    const out = roundTrip(make({ type: "toggle", content: `Toggle h${level}`, headingLevel: level }));
    assert.equal(out.type, "toggle");
    assert.equal(out.content, `Toggle h${level}`);
    assert.equal(out.headingLevel, level);
  }
});

test("callout survives with its icon and title", () => {
  const out = roundTrip(make({ type: "callout", content: "Heads up", color: "⚠️" }));
  assert.equal(out.type, "callout");
  assert.equal(out.content, "Heads up");
  assert.equal(out.color, "⚠️");
});

test("lists and to-dos survive with checked state", () => {
  assert.equal(roundTrip(make({ type: "bulleted_list", content: "Bullet" })).type, "bulleted_list");
  assert.equal(roundTrip(make({ type: "numbered_list", content: "Number" })).type, "numbered_list");
  const done = roundTrip(make({ type: "to_do", content: "Task", checked: true }));
  assert.equal(done.type, "to_do");
  assert.equal(done.checked, true);
  const open = roundTrip(make({ type: "to_do", content: "Task", checked: false }));
  assert.equal(open.checked, false);
});

test("code keeps its language and body", () => {
  const out = roundTrip(make({ type: "code", content: "const a = 1;", language: "js" }));
  assert.equal(out.type, "code");
  assert.equal(out.content, "const a = 1;");
  assert.equal(out.language, "js");
});

test("equation survives as an equation block", () => {
  const out = roundTrip(make({ type: "equation", content: "E = mc^2" }));
  assert.equal(out.type, "equation");
  assert.equal(out.content, "E = mc^2");
});

test("table survives with its cell data", () => {
  // Editor tables are normalized to a 3-column minimum, so use a realistic shape.
  const out = roundTrip(
    make({ type: "table_block", tableData: [["A", "B", "C"], ["1", "2", "3"]] }),
  );
  assert.equal(out.type, "table_block");
  assert.deepEqual(out.tableData, [["A", "B", "C"], ["1", "2", "3"]]);
});
