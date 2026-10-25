/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   raw-mode-save.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import { parseMarkdownToBlocks } from "../../packages/markdown-engine/markdown/shortcuts.ts";
import { rawSourceToBlocks } from "../../src/features/raw-mode/model/rawSave.ts";

function makeCurrent(): Block[] {
  return [
    { id: "p1", type: "paragraph", content: "hello", textColor: "red" },
    {
      id: "t1",
      type: "toggle",
      content: "T",
      collapsed: true,
      children: [{ id: "c1", type: "paragraph", content: "inner", backgroundColor: "blue" }],
    },
  ];
}

test("raw-mode save keeps ids and overlay fields through a markdown round trip", () => {
  const current = makeCurrent();
  const md = serializeBlocksToMarkdown(current);
  const out = rawSourceToBlocks(md, current);
  assert.equal(out[0].id, "p1");
  assert.equal(out[0].textColor, "red");
  assert.equal(out[1].id, "t1");
  assert.equal(out[1].collapsed, true);
  assert.equal(out[1].children?.[0]?.id, "c1");
  assert.equal(out[1].children?.[0]?.backgroundColor, "blue");
});

test("edited text keeps id and textColor and carries the new content", () => {
  const current = makeCurrent();
  const md = serializeBlocksToMarkdown(current);
  const edited = md.replace("hello", "hello world");
  const out = rawSourceToBlocks(edited, current);
  assert.equal(out[0].id, "p1");
  assert.equal(out[0].textColor, "red");
  assert.equal(out[0].content, "hello world");
});

test("changing a paragraph into a heading carries nothing and mints a fresh id", () => {
  const current = makeCurrent();
  const out = rawSourceToBlocks("# hello", current);
  assert.equal(out[0].type, "heading_1");
  assert.equal(out[0].textColor, undefined);
  assert.notEqual(out[0].id, "p1");
});

test("an appended paragraph keeps prior fields and the new one has none", () => {
  const current = makeCurrent();
  const md = serializeBlocksToMarkdown(current);
  const out = rawSourceToBlocks(`${md}\n\nappended`, current);
  assert.equal(out.length, 3);
  assert.equal(out[0].textColor, "red");
  assert.equal(out[1].id, "t1");
  assert.equal(out[2].content, "appended");
  assert.equal(out[2].textColor, undefined);
  assert.equal(out[2].backgroundColor, undefined);
});

test("rawSourceToBlocks empty input yields empty array", () => {
  assert.deepEqual(rawSourceToBlocks("", []), []);
});