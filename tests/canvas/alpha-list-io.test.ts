/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   alpha-list-io.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Lettered ordered lists (#328) at the boundaries: the .omd overlay (AL8), the
// markdown / clipboard / HTML / PDF exports (AL9) and paste (AL10).

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { applyOverlay, collectOverlay } from "../../src/features/page-file/model/blockOverlay.ts";
import { fileToPage, pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";
import { renderBlocksHtml } from "../../src/features/page-export/model/exportHtml.ts";
import { flattenBlocksToPdfLines } from "../../src/features/page-export/model/exportPdfLines.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import {
  parseMarkdownClipboard,
  serializeSelectionToClipboard,
} from "../../src/services/page-actions/blockClipboardSerialize.ts";

const alpha = (id: string, content = id): Block => ({ id, type: "numbered_list", content, listStyle: "lower-alpha" });
const decimal = (id: string, content = id): Block => ({ id, type: "numbered_list", content });
const pageOf = (content: Block[]): PageEntry => ({ _id: "p-alpha", workspaceId: "ws", title: "Alpha", content });

test("AL8: a lettered list round-trips through the .omd file unchanged", () => {
  const content = [alpha("a1", "x"), alpha("a2", "y"), decimal("d1", "z")];
  assert.deepEqual(fileToPage(pageToFile(pageOf(content))).content, content);
});

test("AL8: the overlay carries listStyle only for numbered_list, only as lower-alpha", () => {
  const overlay = collectOverlay([alpha("a"), { id: "p", type: "paragraph", content: "x", listStyle: "lower-alpha" }]);
  assert.equal(overlay["0"]?.listStyle, "lower-alpha");
  assert.equal(Object.hasOwn(overlay["1"] ?? {}, "listStyle"), false);
  assert.equal(Object.hasOwn(collectOverlay([decimal("d")])["0"] ?? {}, "listStyle"), false, "decimal is never written");
});

test("AL8: a bad value and a type mismatch are dropped on read", () => {
  const parsed = [decimal("a"), decimal("b")];
  const back = applyOverlay(parsed, {
    "0": { t: "numbered_list", id: "a", listStyle: "upper-roman" },
    "1": { t: "bulleted_list", id: "b", listStyle: "lower-alpha" },
  });
  assert.equal(Object.hasOwn(back[0], "listStyle"), false, "bad value");
  assert.equal(Object.hasOwn(back[1], "listStyle"), false, "t mismatch");
  assert.equal(applyOverlay([decimal("c")], { "0": { t: "numbered_list", id: "c", listStyle: "lower-alpha" } })[0].listStyle, "lower-alpha");
});

test("AL9: markdown and clipboard stay '1. ' and come back as a numeric list", () => {
  const blocks = [alpha("a1", "x"), alpha("a2", "y")];
  const asDecimal = blocks.map(({ listStyle: _style, ...rest }) => rest as Block);
  assert.equal(serializeBlocksToMarkdown(blocks), serializeBlocksToMarkdown(asDecimal), "byte-identical to a decimal list");
  assert.match(serializeBlocksToMarkdown(blocks), /^1\. x\n+1\. y$/);
  const back = parseMarkdownClipboard(serializeSelectionToClipboard(blocks).markdown);
  assert.deepEqual(back.map((b) => [b.type, b.content, b.listStyle]), [["numbered_list", "x", undefined], ["numbered_list", "y", undefined]]);
});

test("AL9: HTML emits <ol type=\"a\"> and splits the list on a style change", () => {
  const html = renderBlocksHtml([alpha("a1"), alpha("a2"), decimal("d1"), alpha("a3")], { content: "everything" }, () => null);
  assert.equal(html, '<ol type="a"><li>a1</li><li>a2</li></ol>\n<ol><li>d1</li></ol>\n<ol type="a"><li>a3</li></ol>');
  const plain = renderBlocksHtml([decimal("d1"), decimal("d2")], { content: "everything" }, () => null);
  assert.equal(plain, "<ol><li>d1</li><li>d2</li></ol>", "decimal output unchanged");
});

test("AL9: the PDF uses the shared marker and keeps decimal unchanged when nested", () => {
  const tree = [alpha("a1", "x"), { ...decimal("d1", "y"), children: [decimal("c1", "z")] }];
  const lines = flattenBlocksToPdfLines(tree, { content: "everything" }, () => null).map((l) => l.text);
  assert.deepEqual(lines, ["a. x", "1. y", "1. z"]);
});

test("AL10: pasted 'a. x\\nb. y' never becomes a list", () => {
  for (const text of ["a. x\nb. y", "a. x\n\nb. y"]) {
    const blocks = parseMarkdownClipboard(text);
    assert.ok(blocks.length > 0, text);
    assert.ok(blocks.every((b) => b.type === "paragraph" && b.listStyle === undefined), text);
  }
  assert.deepEqual(parseMarkdownClipboard("a. x\n\nb. y").map((b) => b.content), ["a. x", "b. y"]);
});
