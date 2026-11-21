/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   alpha-list-model.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Lettered ordered lists (#328, ruling AL1-AL14): the trigger, the marker, the
// shared run counter and what Enter / Tab / Shift+Tab / turn-into do to the style.

import assert from "node:assert/strict";
import test from "node:test";

import { detectBlockType } from "../../packages/markdown-engine/shortcutsDetect.ts";
import type { Block } from "../../src/entities/block/model/types.ts";
import { getNumberedMarker } from "../../src/entities/block/model/listMarkers.ts";
import {
  childNumberedDepth,
  continuationOf,
  indentedListItem,
  isAlphaListShortcut,
  listStyleOf,
  numberedMarker,
  numberedRunIndexes,
  outdentedListItem,
  withBlockType,
} from "../../src/entities/block/model/listStyle.ts";
import { createRootBlockRenderMeta } from "../../src/entities/block/model/blockVirtualization.ts";
import { flattenBlocksToPdfLines } from "../../src/features/page-export/model/exportPdfLines.ts";
import { diffBlocks } from "../../src/features/collab/model/blockSync.ts";

const alpha = (id: string, content = id): Block => ({ id, type: "numbered_list", content, listStyle: "lower-alpha" });
const decimal = (id: string, content = id): Block => ({ id, type: "numbered_list", content });
const para = (id: string, content = id): Block => ({ id, type: "paragraph", content });

test("AL1: the engine still refuses 'a. ' (no engine change, CommonMark decision pinned)", () => {
  assert.equal(detectBlockType("a. "), null);
  assert.equal(detectBlockType("1. ")?.type, "numbered_list", "numeric shortcut untouched");
});

test("AL2: only a paragraph whose whole text is exactly 'a.' triggers", () => {
  assert.equal(isAlphaListShortcut("paragraph", "a."), true);
  const refused = ["e.g.", "i.e.", "a.k.a.", "a.b", "b.", "i.", "I.", "A.", "a)", "a. foo", "a. ", " a.", "a.."];
  for (const text of refused) assert.equal(isAlphaListShortcut("paragraph", text), false, text);
  for (const type of ["callout", "quote", "heading_1", "numbered_list", "toggle"] as const) {
    assert.equal(isAlphaListShortcut(type, "a."), false, `${type} title`);
  }
});

test("AL4: the style is honoured on numbered_list only and never reads as 'decimal'", () => {
  assert.equal(listStyleOf(alpha("x")), "lower-alpha");
  assert.equal(listStyleOf(decimal("x")), undefined);
  assert.equal(listStyleOf({ ...para("x"), listStyle: "lower-alpha" }), undefined);
  assert.equal(listStyleOf({ ...decimal("x"), listStyle: "upper-roman" as never }), undefined);
});

test("AL4: turn-into another type strips the style; staying a numbered list keeps it", () => {
  const turned = withBlockType(alpha("x"), "bulleted_list");
  assert.equal(turned.type, "bulleted_list");
  assert.equal(Object.hasOwn(turned, "listStyle"), false);
  assert.equal(withBlockType(alpha("x"), "numbered_list").listStyle, "lower-alpha");
  assert.equal(Object.hasOwn(withBlockType(para("x"), "numbered_list"), "listStyle"), false);
  const stray = { ...para("x"), type: "toggle" as const, listStyle: "lower-alpha" as const };
  assert.equal(Object.hasOwn(withBlockType(stray, "numbered_list"), "listStyle"), false, "a stray style is never revived");
});

test("AL4: turn-into a toggle heading strips the style", async () => {
  const { changeBlockToToggleHeadingInTree } = await import("../../src/features/block-editor/model/blockContextMenu.helpers.ts");
  const [toggle] = changeBlockToToggleHeadingInTree([alpha("x")], "x", 2).blocks;
  assert.equal(toggle.type, "toggle");
  assert.equal(Object.hasOwn(toggle, "listStyle"), false);
});

test("AL5: decimal markers are unchanged at every depth 0-6", () => {
  for (let depth = 0; depth <= 6; depth += 1) {
    for (const index of [1, 2, 27]) {
      assert.equal(numberedMarker(decimal("x"), index, depth), getNumberedMarker(index, depth), `d${depth} i${index}`);
      assert.equal(childNumberedDepth(decimal("x"), depth), depth + 1);
    }
  }
  assert.equal(childNumberedDepth(para("x"), 3), 3);
});

test("AL5: a lettered item uses the a. slot at any depth; its children continue i., then A.", () => {
  for (let depth = 0; depth <= 6; depth += 1) {
    assert.equal(numberedMarker(alpha("x"), 1, depth), "a.", `depth ${depth}`);
    assert.equal(childNumberedDepth(alpha("x"), depth), 2);
  }
  const child = childNumberedDepth(alpha("x"), 0);
  assert.equal(numberedMarker(decimal("c"), 1, child), "i.");
  assert.equal(numberedMarker(decimal("g"), 1, childNumberedDepth(decimal("c"), child)), "A.");
});

test("AL11: lettered markers past z", () => {
  const cases: Array<[number, string]> = [[1, "a."], [26, "z."], [27, "aa."], [702, "zz."], [703, "aaa."]];
  for (const [index, marker] of cases) assert.equal(numberedMarker(alpha("x"), index, 0), marker, String(index));
});

test("AL6: a style change between adjacent numbered items restarts the count", () => {
  const run = [alpha("a1"), alpha("a2"), decimal("d1"), decimal("d2"), alpha("a3"), para("p"), decimal("d3")];
  assert.deepEqual(numberedRunIndexes(run), [1, 2, 1, 2, 1, 0, 1]);
  assert.deepEqual(numberedRunIndexes([decimal("1"), decimal("2"), para("p"), decimal("3")]), [1, 2, 0, 1]);
});

test("AL6: editor, virtualized and PDF counters agree on a mixed run", () => {
  const run = [alpha("x"), alpha("y"), decimal("z"), decimal("w"), alpha("v")];
  const expected = ["a.", "b.", "1.", "2.", "a."];
  const editor = numberedRunIndexes(run).map((index, i) => numberedMarker(run[i], index, 0));
  const virtualized = createRootBlockRenderMeta(run).map((m) => numberedMarker(m.block, m.effectiveIndex + 1, 0));
  const pdf = flattenBlocksToPdfLines(run, { content: "everything" }, () => null).map((l) => l.text.split(" ")[0]);
  assert.deepEqual(editor, expected);
  assert.deepEqual(virtualized, expected);
  assert.deepEqual(pdf, expected);
});

test("AL7: Enter continues the style (end and mid-text tail); a decimal item writes no style", () => {
  const atEnd = continuationOf(alpha("x", "first"));
  assert.deepEqual({ type: atEnd.type, content: atEnd.content, listStyle: atEnd.listStyle }, { type: "numbered_list", content: "", listStyle: "lower-alpha" });
  assert.notEqual(atEnd.id, "x");
  const tail = continuationOf(alpha("x", "head"), "tail");
  assert.equal(tail.content, "tail");
  assert.equal(tail.listStyle, "lower-alpha");
  assert.equal(Object.hasOwn(continuationOf(decimal("x")), "listStyle"), false);
  const fromHeading = continuationOf({ id: "h", type: "heading_1", content: "t", listStyle: "lower-alpha" });
  assert.equal(fromHeading.type, "paragraph");
  assert.equal(Object.hasOwn(fromHeading, "listStyle"), false, "only listStyle is copied, and only onto a list");
  assert.deepEqual(Object.keys(continuationOf({ ...alpha("x"), color: "red", checked: true })).sort(), ["content", "id", "listStyle", "type"]);
});

test("AL7: Enter at the end of a. gives b., then c.", () => {
  const first = alpha("x");
  const second = continuationOf(first);
  const third = continuationOf(second);
  const run = [first, second, third];
  assert.deepEqual(numberedRunIndexes(run).map((index, i) => numberedMarker(run[i], index, 0)), ["a.", "b.", "c."]);
});

test("AL7: Tab strips the style so the child follows the rotation", () => {
  const moved = indentedListItem(alpha("x"));
  assert.equal(Object.hasOwn(moved, "listStyle"), false);
  assert.equal(numberedMarker(moved, 1, childNumberedDepth(alpha("parent"), 0)), "i.");
});

test("AL7: Shift+Tab adopts the new previous sibling's style", () => {
  assert.equal(outdentedListItem(decimal("x"), alpha("parent")).listStyle, "lower-alpha");
  assert.equal(Object.hasOwn(outdentedListItem(alpha("x"), decimal("parent")), "listStyle"), false);
  assert.equal(Object.hasOwn(outdentedListItem(alpha("x"), para("parent")), "listStyle"), false);
  assert.equal(Object.hasOwn(outdentedListItem(para("x"), alpha("parent")), "listStyle"), false, "only a numbered item takes it");
});

test("AL12: an old-shape edit ({...block, content}) keeps the style and the collab op carries it", () => {
  const before = [alpha("x", "old")];
  const after = [{ ...before[0], content: "new" }];
  assert.equal(after[0].listStyle, "lower-alpha");
  const ops = diffBlocks(before, after);
  const put = ops.find((op) => op.k === "put");
  assert.equal(put?.k === "put" ? put.block.listStyle : undefined, "lower-alpha");
});
