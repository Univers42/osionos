/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableMenuActions.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { TableBlockConfig } from "@/entities/block";
import { addTableColumn, addTableRow, getTableColumnCount, insertConfigColumn, insertConfigRow, removeConfigColumn, removeConfigRow, removeTableColumn, removeTableRow } from "@/entities/block/model/tableBlocks";
import { insertTableColumnBefore, insertTableRowBefore } from "./tableStructure";
import type { CellAddress } from "./tableTypes";

export type TableMenuAction = "row-above" | "row-below" | "col-left" | "col-right" | "row-delete" | "col-delete";

export interface TableMenuResult {
  data: string[][];
  config: TableBlockConfig;
  target: CellAddress;
}

/**
 * Builds the next grid + config + caret target for a row/column menu action,
 * mirroring the keyboard structural shortcuts. Returns null when the action is
 * not possible (deleting the last row or column).
 */
export function applyTableMenuAction(action: TableMenuAction, data: string[][], config: TableBlockConfig, rowIndex: number, columnIndex: number): TableMenuResult | null {
  const lastRow = data.length - 1;
  const columnCount = getTableColumnCount(data);
  switch (action) {
    case "row-above":
      return { data: insertTableRowBefore(data, rowIndex), config: insertConfigRow(config, rowIndex - 1), target: { rowIndex, columnIndex } };
    case "row-below":
      return { data: addTableRow(data, rowIndex), config: insertConfigRow(config, rowIndex), target: { rowIndex: rowIndex + 1, columnIndex } };
    case "col-left":
      return { data: insertTableColumnBefore(data, columnIndex), config: insertConfigColumn(config, columnIndex - 1), target: { rowIndex, columnIndex } };
    case "col-right":
      return { data: addTableColumn(data, columnIndex), config: insertConfigColumn(config, columnIndex), target: { rowIndex, columnIndex: columnIndex + 1 } };
    case "row-delete":
      if (data.length <= 1) return null;
      return { data: removeTableRow(data, rowIndex), config: removeConfigRow(config, rowIndex), target: { rowIndex: Math.min(rowIndex, lastRow - 1), columnIndex } };
    case "col-delete":
      if (columnCount <= 1) return null;
      return { data: removeTableColumn(data, columnIndex), config: removeConfigColumn(config, columnIndex), target: { rowIndex, columnIndex: Math.min(columnIndex, columnCount - 2) } };
    default:
      return null;
  }
}
