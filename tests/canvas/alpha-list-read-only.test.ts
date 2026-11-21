/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   alpha-list-read-only.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Read-only numbered markers (#328 AL6): every read-only list counts by numbered
// run, so blocks before a list never shift its first marker and a style change
// restarts the count.

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "./support/user-store-env.ts";

import type { Block } from "../../src/entities/block/model/types.ts";
import { readOnlyListIndexes } from "../../src/entities/block/model/listStyle.ts";

const { ReadOnlyBlockList } = await import("../../src/entities/block/ui/ReadOnlyBlockList.tsx");
const { CalloutBlockReadOnly } = await import("../../src/entities/block/ui/CalloutBlockReadOnly.tsx");
const { ReadOnlyColumnList } = await import("../../src/entities/block/ui/ReadOnlyColumnList.tsx");

const alpha = (id: string): Block => ({ id, type: "numbered_list", content: id, listStyle: "lower-alpha" });
const decimal = (id: string): Block => ({ id, type: "numbered_list", content: id });
const page: Block[] = [
  { id: "p", type: "paragraph", content: "intro" },
  { id: "h", type: "heading_2", content: "title" },
  alpha("a1"),
  alpha("a2"),
  decimal("d1"),
];
const EXPECTED = ["a.", "b.", "1."];

// The read-only marker span is the only element with this class pair.
const markersIn = (html: string): string[] =>
  [...html.matchAll(/w-6 text-center font-medium">([^<]*)</g)].map((match) => match[1]);

test("readOnlyListIndexes: a numbered item gets its 0-based run position, any other block its position", () => {
  assert.deepEqual(readOnlyListIndexes(page), [0, 1, 0, 1, 0]);
  assert.deepEqual(readOnlyListIndexes([]), []);
});

test("a root read-only lettered list after a paragraph and a heading shows a. b., then 1. restarts", () => {
  assert.deepEqual(markersIn(renderToStaticMarkup(React.createElement(ReadOnlyBlockList, { blocks: page }))), EXPECTED);
});

test("a callout's read-only children count by run", () => {
  const callout: Block = { id: "c", type: "callout", content: "note", children: page };
  assert.deepEqual(markersIn(renderToStaticMarkup(React.createElement(CalloutBlockReadOnly, { block: callout }))), EXPECTED);
});

test("a column's read-only children count by run", () => {
  const columns: Block = {
    id: "cl",
    type: "column_list",
    content: "",
    children: [{ id: "col", type: "column", content: "", children: page }],
  };
  const html = renderToStaticMarkup(React.createElement(ReadOnlyColumnList, { block: columns, bulletDepth: 0, numberedDepth: 0 }));
  assert.deepEqual(markersIn(html), EXPECTED);
});
