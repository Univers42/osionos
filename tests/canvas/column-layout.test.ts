/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   column-layout.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";
import { insertColumnForTarget } from "@/features/block-editor/model/columnLayout";
import { flattenColumns } from "@/entities/block/model/blockTreeUtils";
import type { Block } from "@/entities/block/model/types";

const b = (id: string): Block => ({ id, type: "paragraph", content: id });

test("dropping right of a plain block makes a flat 2-column list, 0.5/0.5", () => {
  const out = insertColumnForTarget([b("A"), b("B")], "B", b("D"), "right");
  assert.equal(out.length, 2);
  const list = out[1];
  assert.equal(list.type, "column_list");
  assert.equal(list.children?.length, 2);
  assert.deepEqual(list.children?.map((c) => c.type), ["column", "column"]);
  assert.deepEqual(list.children?.map((c) => c.widthRatio), [0.5, 0.5]);
  // each column holds exactly its one block — no nesting
  assert.equal(list.children?.[0].children?.[0].id, "B");
  assert.equal(list.children?.[1].children?.[0].id, "D");
});

test("dropping beside a block ALREADY in a column adds a SIBLING column (never nests)", () => {
  const twoCol = insertColumnForTarget([b("B")], "B", b("D"), "right"); // [column_list[B,D]]
  const threeCol = insertColumnForTarget(twoCol, "D", b("E"), "right");
  const list = threeCol[0];
  assert.equal(list.type, "column_list");
  assert.equal(list.children?.length, 3, "a third sibling column, not a nested list");
  // NO column contains a nested column_list
  for (const column of list.children ?? []) {
    assert.ok(!(column.children ?? []).some((child) => child.type === "column_list"), "no nesting");
  }
  // equal widths
  assert.deepEqual(list.children?.map((c) => c.widthRatio), [1 / 3, 1 / 3, 1 / 3]);
  assert.deepEqual(list.children?.map((c) => c.children?.[0].id), ["B", "D", "E"]);
});

test("side=left inserts the new column before the target's column", () => {
  const twoCol = insertColumnForTarget([b("B")], "B", b("D"), "right"); // [B, D]
  const three = insertColumnForTarget(twoCol, "D", b("E"), "left");
  assert.deepEqual(three[0].children?.map((c) => c.children?.[0].id), ["B", "E", "D"]);
});

test("flattenColumns hoists a column that merely wraps a single column_list", () => {
  const nested: Block[] = [
    { id: "col1", type: "column", content: "", children: [b("X")] },
    {
      id: "col2", type: "column", content: "",
      children: [{ id: "innerlist", type: "column_list", content: "", children: [
        { id: "c3", type: "column", content: "", children: [b("Y")] },
        { id: "c4", type: "column", content: "", children: [b("Z")] },
      ] }],
    },
  ];
  const flat = flattenColumns(nested);
  assert.deepEqual(flat.map((c) => c.id), ["col1", "c3", "c4"], "inner columns hoisted to siblings");
});

test("flattenColumns leaves a genuine mixed-content column untouched", () => {
  const mixed: Block[] = [
    { id: "c", type: "column", content: "", children: [
      { id: "h", type: "heading_2", content: "Mon" },
      { id: "il", type: "column_list", content: "", children: [] },
    ] },
  ];
  assert.deepEqual(flattenColumns(mixed).map((c) => c.id), ["c"], "not the sole-child shape → left as-is");
});
