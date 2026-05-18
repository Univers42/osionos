/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   table-blocks.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  createTableBlockFromData,
  getDefaultTableConfig,
  insertConfigColumn,
  insertConfigRow,
  normalizeTableData,
  removeConfigColumn,
  removeConfigRow,
  resolveTableConfig,
} from "../../src/entities/block/model/tableBlocks.ts";
import type { Block, TableBlockConfig } from "../../src/entities/block/model/types.ts";

test("normalizes ragged table data without collapsing old blocks", () => {
  assert.deepEqual(normalizeTableData(undefined), [
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
  ]);

  assert.deepEqual(normalizeTableData([["A"], ["B", "C", "D"]]), [
    ["A", "", ""],
    ["B", "C", "D"],
  ]);
});

test("creates markdown-imported table blocks with normalized alignment config", () => {
  const blockParts = createTableBlockFromData(
    [
      ["Name", "Score"],
      ["Ada", "42"],
    ],
    { columnAlignments: ["left", "right"] },
  );

  assert.equal(blockParts.content, "");
  assert.deepEqual(blockParts.tableData, [
    ["Name", "Score", ""],
    ["Ada", "42", ""],
  ]);
  assert.deepEqual(blockParts.tableConfig?.columnAlignments, ["left", "right", null]);
});

test("keeps table config columns aligned with dynamic table columns", () => {
  const config: TableBlockConfig = {
    ...getDefaultTableConfig(),
    columnWidths: [120, 180],
    columnAlignments: ["left", "right"],
  };

  const inserted = insertConfigColumn(config, 0);
  assert.deepEqual(inserted.columnWidths, [120, undefined, 180]);
  assert.deepEqual(inserted.columnAlignments, ["left", null, "right"]);

  const removed = removeConfigColumn(inserted, 0);
  assert.deepEqual(removed.columnWidths, [undefined, 180]);
  assert.deepEqual(removed.columnAlignments, [null, "right"]);
});

test("keeps table config rows aligned with dynamic table rows", () => {
  const config: TableBlockConfig = {
    ...getDefaultTableConfig(),
    rowHeights: [48, 72],
  };

  const inserted = insertConfigRow(config, 0);
  assert.deepEqual(inserted.rowHeights, [48, undefined, 72]);

  const removed = removeConfigRow(inserted, 0);
  assert.deepEqual(removed.rowHeights, [undefined, 72]);
});

test("resolves legacy table blocks with dynamic width defaults", () => {
  const block: Block = {
    id: "legacy-table",
    type: "table_block",
    content: "",
    tableData: [["Only one cell"]],
  };
  const config = resolveTableConfig(block, 3, 1);

  assert.equal(config.layoutMode, "auto");
  assert.equal(config.wrap, true);
  assert.equal(config.minColumnWidth, 96);
  assert.equal(config.headerRow, true);
  assert.equal(config.columnWidths, undefined);
});

test("resolves table row heights with row-height clamps", () => {
  const block: Block = {
    id: "resized-table",
    type: "table_block",
    content: "",
    tableData: [["Tall"], ["Short"]],
    tableConfig: { rowHeights: [24, 900] },
  };
  const config = resolveTableConfig(block, 3, 2);

  assert.deepEqual(config.rowHeights, [32, 640]);
});