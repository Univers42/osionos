/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableConfig.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Table layout normalization — owned by the engine, not the host app.
 *
 * Parsing a markdown table has to decide column counts, widths, alignments and
 * padding, so those rules belong next to the parser. The host re-exports this
 * surface rather than keeping a second copy: two copies of a normalizer drift.
 *
 * Pure: no DOM, no React, no host imports.
 */

export type TableBlockLayoutMode = 'auto' | 'fit' | 'fixed';
export type TableBlockPadding = 'compact' | 'normal' | 'comfortable';
export type TableBlockTextAlign = 'left' | 'center' | 'right' | null;

export interface TableBlockConfig {
  layoutMode?: TableBlockLayoutMode;
  wrap?: boolean;
  minColumnWidth?: number;
  maxColumnWidth?: number;
  cellPadding?: TableBlockPadding;
  headerRow?: boolean;
  headerColumn?: boolean;
  showBorders?: boolean;
  stripedRows?: boolean;
  columnWidths?: Array<number | undefined>;
  rowHeights?: Array<number | undefined>;
  columnAlignments?: TableBlockTextAlign[];
}

/**
 * The table fields a parsed markdown table contributes to a host block.
 *
 * Carries an index signature so it stays assignable to a host `Partial<Block>`
 * whose block model is open-ended — an interface without one is rejected by
 * TypeScript even when every named field matches.
 */
export type TableBlockSeed = {
  content: string;
  tableData: string[][];
  tableConfig: TableBlockConfig;
  [key: string]: unknown;
};

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

/**
 * Structural parameter (not `Pick<Block, "tableConfig">`) so the engine stays
 * host-agnostic. Identical shape, so every host call site compiles unchanged.
 */
export function resolveTableConfig(
  source: { tableConfig?: TableBlockConfig },
  columnCount: number,
  rowCount = 0,
): TableBlockConfig {
  const raw = source.tableConfig ?? {};
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

export function createTableBlockFromData(
  tableData: string[][],
  config: TableBlockConfig = {},
): TableBlockSeed {
  const normalizedData = normalizeTableData(tableData);
  const columnCount = getTableColumnCount(normalizedData);
  return {
    content: "",
    tableData: normalizedData,
    tableConfig: resolveTableConfig({ tableConfig: config }, columnCount, normalizedData.length),
  };
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
