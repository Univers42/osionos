/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableBlocks.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, TableBlockConfig, TableBlockPadding, TableBlockTextAlign } from "./types";
import {
  getDefaultTableConfig,
  getTableColumnCount,
  normalizeTableData,
} from "@/shared/lib/markengine/tableConfig";

/**
 * Table normalization lives in markengine — parsing a markdown table is where
 * column counts, widths and alignments get decided. Re-exported here so host
 * call sites keep their existing import path.
 */
export {
  DEFAULT_TABLE_CONFIG,
  DEFAULT_TABLE_DATA,
  clampTableColumnWidth,
  clampTableRowHeight,
  createTableBlockFromData,
  getDefaultTableConfig,
  getTableColumnCount,
  normalizeTableData,
  resolveTableConfig,
} from "@/shared/lib/markengine/tableConfig";

export function createDefaultTableBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: crypto.randomUUID(),
    type: "table_block",
    content: "",
    tableData: normalizeTableData(undefined),
    tableConfig: getDefaultTableConfig(),
    ...overrides,
  };
}

export function addTableRow(tableData: string[][], afterRow?: number): string[][] {
  const data = normalizeTableData(tableData);
  const columnCount = getTableColumnCount(data);
  const row = new Array(columnCount).fill("");
  if (afterRow == null || afterRow < 0 || afterRow >= data.length) return [...data, row];
  return [...data.slice(0, afterRow + 1), row, ...data.slice(afterRow + 1)];
}

export function addTableColumn(tableData: string[][], afterColumn?: number): string[][] {
  const data = normalizeTableData(tableData);
  const columnCount = getTableColumnCount(data);
  const insertAt = afterColumn == null || afterColumn < 0 || afterColumn >= columnCount
    ? columnCount
    : afterColumn + 1;

  return data.map((row) => [
    ...row.slice(0, insertAt),
    "",
    ...row.slice(insertAt),
  ]);
}

export function removeTableRow(tableData: string[][], rowIndex: number): string[][] {
  const data = normalizeTableData(tableData);
  if (data.length <= 1) return data;
  return data.filter((_, index) => index !== rowIndex);
}

export function removeTableColumn(tableData: string[][], columnIndex: number): string[][] {
  const data = normalizeTableData(tableData);
  const columnCount = getTableColumnCount(data);
  if (columnCount <= 1) return data;
  return data.map((row) => row.filter((_, index) => index !== columnIndex));
}

export function insertConfigColumn(config: TableBlockConfig, columnIndex: number): TableBlockConfig {
  return {
    ...config,
    columnWidths: insertOptionalValue(config.columnWidths, columnIndex, undefined),
    columnAlignments: insertOptionalValue(config.columnAlignments, columnIndex, null),
  };
}

export function insertConfigRow(config: TableBlockConfig, rowIndex: number): TableBlockConfig {
  return {
    ...config,
    rowHeights: insertOptionalValue(config.rowHeights, rowIndex, undefined),
  };
}

export function removeConfigColumn(config: TableBlockConfig, columnIndex: number): TableBlockConfig {
  return {
    ...config,
    columnWidths: removeOptionalValue(config.columnWidths, columnIndex),
    columnAlignments: removeOptionalValue(config.columnAlignments, columnIndex),
  };
}

export function removeConfigRow(config: TableBlockConfig, rowIndex: number): TableBlockConfig {
  return {
    ...config,
    rowHeights: removeOptionalValue(config.rowHeights, rowIndex),
  };
}

export function getTablePaddingClassName(padding: TableBlockPadding | undefined): string {
  switch (padding) {
    case "compact":
      return "px-2 py-1";
    case "comfortable":
      return "px-4 py-2.5";
    default:
      return "px-3 py-1.5";
  }
}

export function getTableAlignmentClassName(align: TableBlockTextAlign | undefined): string {
  switch (align) {
    case "center":
      return "text-center";
    case "right":
      return "text-right";
    default:
      return "text-left";
  }
}

function insertOptionalValue<T>(values: T[] | undefined, columnIndex: number, inserted: T): T[] | undefined {
  if (!values) return undefined;
  const insertAt = Math.max(0, Math.min(columnIndex + 1, values.length));
  return [...values.slice(0, insertAt), inserted, ...values.slice(insertAt)];
}

function removeOptionalValue<T>(values: T[] | undefined, columnIndex: number): T[] | undefined {
  if (!values) return undefined;
  const next = values.filter((_, index) => index !== columnIndex);
  return next.length ? next : undefined;
}
