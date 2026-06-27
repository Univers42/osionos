/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   table-row-ops.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultTableConfig } from "../../src/entities/block/model/tableBlocks.ts";
import { moveConfigRow, moveTableRow } from "../../src/entities/block/model/tableRowOps.ts";
import {
  appendTableColumns,
  appendTableRows,
  insertTableColumnBefore,
  insertTableRowBefore,
} from "../../src/features/block-editor/ui/table/tableStructure.ts";
import { applyTableMenuAction } from "../../src/features/block-editor/ui/table/tableMenuActions.ts";

// Single-label rows; `normalizeTableData` widens them to a 3-column minimum,
// so order/count is asserted via the first cell of each row.
const grid = () => [["A"], ["B"], ["C"]];
const labels = (rows: string[][]) => rows.map((row) => row[0]);

test("moveTableRow reorders rows in both directions", () => {
  assert.deepEqual(labels(moveTableRow(grid(), 0, 2)), ["B", "C", "A"]);
  assert.deepEqual(labels(moveTableRow(grid(), 2, 0)), ["C", "A", "B"]);
});

test("moveTableRow is a no-op for equal indices or a single row", () => {
  assert.deepEqual(labels(moveTableRow(grid(), 1, 1)), ["A", "B", "C"]);
  assert.deepEqual(labels(moveTableRow([["only"]], 0, 0)), ["only"]);
});

test("moveConfigRow reorders row heights and ignores absent heights", () => {
  const config = { ...getDefaultTableConfig(), rowHeights: [10, 20, 30] };
  assert.deepEqual(moveConfigRow(config, 0, 2).rowHeights, [20, 30, 10]);
  const noHeights = getDefaultTableConfig();
  assert.equal(moveConfigRow(noHeights, 0, 2), noHeights);
});

test("appendTableColumns/Rows add exactly the requested count", () => {
  const config = getDefaultTableConfig();
  const [cols] = appendTableColumns([["a", "b", "c"]], config, 2);
  assert.equal(cols[0].length, 5);
  const [rows] = appendTableRows([["a", "b", "c"], ["d", "e", "f"]], config, 3);
  assert.equal(rows.length, 5);
});

test("insertTableRowBefore/ColumnBefore insert empty cells at the boundary", () => {
  assert.deepEqual(insertTableRowBefore([["a", "b", "c"], ["d", "e", "f"]], 1), [["a", "b", "c"], ["", "", ""], ["d", "e", "f"]]);
  assert.deepEqual(insertTableColumnBefore([["x", "y", "z"]], 1), [["x", "", "y", "z"]]);
});

test("applyTableMenuAction inserts rows/columns with a caret target", () => {
  const config = getDefaultTableConfig();
  const below = applyTableMenuAction("row-below", grid(), config, 0, 0);
  assert.equal(below?.data.length, 4);
  assert.deepEqual(below?.target, { rowIndex: 1, columnIndex: 0 });

  const right = applyTableMenuAction("col-right", [["a", "b", "c"]], config, 0, 0);
  assert.equal(right?.data[0].length, 4);
  assert.deepEqual(right?.target, { rowIndex: 0, columnIndex: 1 });
});

test("applyTableMenuAction refuses to delete the last row or column", () => {
  const config = getDefaultTableConfig();
  assert.equal(applyTableMenuAction("row-delete", [["only"]], config, 0, 0), null);
  assert.equal(applyTableMenuAction("col-delete", [["only"]], config, 0, 0), null);
  const deleted = applyTableMenuAction("row-delete", grid(), config, 1, 0);
  assert.deepEqual(labels(deleted?.data ?? []), ["A", "C"]);
});
