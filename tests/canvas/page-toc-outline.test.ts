/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-toc-outline.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Block } from "@/entities/block/model/types";
import {
  READING_LINE_PX,
  activeHeadingIndex,
  fillUnrenderedTops,
  headingsFromKey,
  outlineKey,
} from "@/widgets/page-toc/outline";

const block = (id: string, type: Block["type"], content: string, children?: Block[], extra?: Partial<Block>): Block =>
  ({ id, type, content, children, ...extra }) as Block;

const page: Block[] = [
  block("a", "heading_1", "**Intro**"),
  block("p", "paragraph", "body text"),
  block("cols", "column_list", "", [block("col", "column", "", [block("b", "heading_2", "Nested")])]),
  block("c", "heading_3", "  "),
  block("t", "toggle", "Folded", [block("d", "heading_2", "Inside")], { headingLevel: 1, collapsed: true }),
  block("plain", "toggle", "Not a heading"),
];

test("the outline lists nested headings and heading toggles in order, with their enclosing blocks", () => {
  assert.deepEqual(headingsFromKey(outlineKey(page)), [
    { id: "a", rootId: "a", ancestors: [], level: 1, text: "Intro" },
    { id: "b", rootId: "cols", ancestors: ["cols", "col"], level: 2, text: "Nested" },
    { id: "c", rootId: "c", ancestors: [], level: 3, text: "Untitled" },
    { id: "t", rootId: "t", ancestors: [], level: 1, text: "Folded" },
    { id: "d", rootId: "t", ancestors: ["t"], level: 2, text: "Inside" },
  ]);
});

test("typing in a paragraph leaves the outline key unchanged; editing a heading changes it", () => {
  const typed = page.map((b) => (b.id === "p" ? { ...b, content: "body text!" } : b));
  assert.equal(outlineKey(typed), outlineKey(page));
  const renamed = page.map((b) => (b.id === "a" ? { ...b, content: "Intro 2" } : b));
  assert.notEqual(outlineKey(renamed), outlineKey(page));
  assert.deepEqual(headingsFromKey(outlineKey(undefined)), []);
});

test("the active heading is the last one past the reading line", () => {
  assert.equal(activeHeadingIndex([], false), -1);
  assert.equal(activeHeadingIndex([200, 600], false), 0);
  assert.equal(activeHeadingIndex([-400, READING_LINE_PX, 300], false), 1);
  assert.equal(activeHeadingIndex([-900, -300, 900], true), 2);
});

test("unrendered headings sit above or below the rendered window, folded ones at the heading before", () => {
  assert.equal(fillUnrenderedTops([Number.NaN, Number.NaN]), null);
  assert.deepEqual(fillUnrenderedTops([Number.NaN, 40, Number.NaN]), [-Infinity, 40, Infinity]);
  // A folded heading must not stop the spy short of a later one already read.
  const folded = fillUnrenderedTops([-900, Number.NaN, -300, 500]) ?? [];
  assert.deepEqual(folded, [-900, -900, -300, 500]);
  assert.equal(activeHeadingIndex(folded, false), 2);
  assert.equal(activeHeadingIndex(fillUnrenderedTops([Number.NaN, 400, Number.NaN]) ?? [], false), 0);
});
