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

export const DEFAULT_TABLE_DATA: string[][] = [
  ["", "", ""],
  ["", "", ""],
  ["", "", ""],
];

export const DEFAULT_TABLE_CONFIG: Required<Pick<
  TableBlockConfig,
  "layoutMode" | "wrap" | "minColumnWidth" | "cellPadding" | "headerRow" | "showBorders" | "stripedRows"
>> = {
  layoutMode: "auto",
  wrap: true,
  minColumnWidth: 96,
  cellPadding: "normal",
  headerRow: true,
  showBorders: true,
  stripedRows: false,
};

const MIN_COLUMN_WIDTH = 56;
const MAX_COLUMN_WIDTH = 640;
const DEFAULT_COLUMN_WIDTH = 160;
const MIN_ROW_HEIGHT = 32;
const MAX_ROW_HEIGHT = 640;
const DEFAULT_ROW_HEIGHT = 40;

export function clampTableColumnWidth(value: unknown, fallback = DEFAULT_COLUMN_WIDTH): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(numeric)));
}

export function clampTableRowHeight(value: unknown, fallback = DEFAULT_ROW_HEIGHT): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, Math.round(numeric)));
}

export function normalizeTableData(tableData: string[][] | undefined): string[][] {
  const source = tableData?.length ? tableData : DEFAULT_TABLE_DATA;
  const columnCount = Math.max(1, ...source.map((row) => row.length), 3);

  return source.map((row) => {
    const normalizedRow = Array.from({ length: columnCount }, (_, index) => String(row[index] ?? ""));
    return normalizedRow;
  });
}

export function getTableColumnCount(tableData: string[][]): number {
  return Math.max(1, ...tableData.map((row) => row.length));
}

export function getDefaultTableConfig(): TableBlockConfig {
  return { ...DEFAULT_TABLE_CONFIG };
}

export function resolveTableConfig(block: Pick<Block, "tableConfig">, columnCount: number, rowCount = 0): TableBlockConfig {
  const raw = block.tableConfig ?? {};
  const minColumnWidth = clampTableColumnWidth(raw.minColumnWidth, DEFAULT_TABLE_CONFIG.minColumnWidth);
  const maxColumnWidth = raw.maxColumnWidth == null
    ? undefined
    : Math.max(minColumnWidth, clampTableColumnWidth(raw.maxColumnWidth, 320));

  return {
    layoutMode: raw.layoutMode ?? DEFAULT_TABLE_CONFIG.layoutMode,
    wrap: raw.wrap ?? DEFAULT_TABLE_CONFIG.wrap,
    minColumnWidth,
    maxColumnWidth,
    cellPadding: raw.cellPadding ?? DEFAULT_TABLE_CONFIG.cellPadding,
    headerRow: raw.headerRow ?? DEFAULT_TABLE_CONFIG.headerRow,
    headerColumn: raw.headerColumn ?? false,
    showBorders: raw.showBorders ?? DEFAULT_TABLE_CONFIG.showBorders,
    stripedRows: raw.stripedRows ?? DEFAULT_TABLE_CONFIG.stripedRows,
    columnWidths: normalizeColumnWidths(raw.columnWidths, columnCount),
    rowHeights: normalizeRowHeights(raw.rowHeights, rowCount),
    columnAlignments: normalizeAlignments(raw.columnAlignments, columnCount),
  };
}

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

export function createTableBlockFromData(
  tableData: string[][],
  config: TableBlockConfig = {},
): Pick<Block, "content" | "tableData" | "tableConfig"> {
  const normalizedData = normalizeTableData(tableData);
  const columnCount = getTableColumnCount(normalizedData);
  return {
    content: "",
    tableData: normalizedData,
    tableConfig: resolveTableConfig({ tableConfig: config }, columnCount, normalizedData.length),
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

function normalizeColumnWidths(value: unknown, length: number): Array<number | undefined> | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = Array.from({ length }, (_, index) => {
    const width = value[index];
    return width == null ? undefined : clampTableColumnWidth(width);
  });
  return normalized.some((width) => width != null) ? normalized : undefined;
}

function normalizeRowHeights(value: unknown, length: number): Array<number | undefined> | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = Array.from({ length }, (_, index) => {
    const height = value[index];
    return height == null ? undefined : clampTableRowHeight(height);
  });
  return normalized.some((height) => height != null) ? normalized : undefined;
}

function normalizeAlignments(value: unknown, length: number): TableBlockTextAlign[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = Array.from({ length }, (_, index) => {
    const align = value[index];
    return align === "center" || align === "right" || align === "left" || align == null
      ? align ?? null
      : null;
  });
  return normalized.some((align) => align != null) ? normalized : undefined;
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
