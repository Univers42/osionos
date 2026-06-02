/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableStructure.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { TableBlockConfig } from "@/entities/block";
import { addTableColumn, addTableRow, getTableColumnCount, insertConfigColumn, insertConfigRow, normalizeTableData } from "@/entities/block/model/tableBlocks";

/** Appends `count` columns to the right edge, keeping config arrays aligned. */
export function appendTableColumns(data: string[][], config: TableBlockConfig, count: number): [string[][], TableBlockConfig] {
  let nextData = data;
  let nextConfig = config;
  for (let index = 0; index < count; index += 1) {
    const afterColumn = getTableColumnCount(nextData) - 1;
    nextData = addTableColumn(nextData, afterColumn);
    nextConfig = insertConfigColumn(nextConfig, afterColumn);
  }
  return [nextData, nextConfig];
}

/** Appends `count` rows to the bottom edge, keeping config arrays aligned. */
export function appendTableRows(data: string[][], config: TableBlockConfig, count: number): [string[][], TableBlockConfig] {
  let nextData = data;
  let nextConfig = config;
  for (let index = 0; index < count; index += 1) {
    const afterRow = nextData.length - 1;
    nextData = addTableRow(nextData, afterRow);
    nextConfig = insertConfigRow(nextConfig, afterRow);
  }
  return [nextData, nextConfig];
}

/** Inserts an empty row immediately before `rowIndex`. */
export function insertTableRowBefore(tableData: string[][], rowIndex: number): string[][] {
  const data = normalizeTableData(tableData);
  const insertAt = Math.max(0, Math.min(rowIndex, data.length));
  const row = new Array(getTableColumnCount(data)).fill("");
  return [...data.slice(0, insertAt), row, ...data.slice(insertAt)];
}

/** Inserts an empty column immediately before `columnIndex`. */
export function insertTableColumnBefore(tableData: string[][], columnIndex: number): string[][] {
  const data = normalizeTableData(tableData);
  const insertAt = Math.max(0, Math.min(columnIndex, getTableColumnCount(data)));
  return data.map((row) => [...row.slice(0, insertAt), "", ...row.slice(insertAt)]);
}

/** Returns new data with a single cell value replaced. */
export function updateTableCellValue(data: string[][], rowIndex: number, columnIndex: number, value: string): string[][] {
  return data.map((row, currentRowIndex) => currentRowIndex === rowIndex ? row.map((cell, currentColumnIndex) => currentColumnIndex === columnIndex ? value : cell) : row);
}

/** Deep value-equality for two table grids. */
export function tableDataEqual(left: string[][], right: string[][]): boolean {
  return left.length === right.length && left.every((row, rowIndex) => row.length === right[rowIndex].length && row.every((cell, columnIndex) => cell === right[rowIndex][columnIndex]));
}
