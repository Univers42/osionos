/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableKeyboard.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { addTableColumn, addTableRow, insertConfigColumn, insertConfigRow, removeConfigColumn, removeConfigRow, removeTableColumn, removeTableRow } from "@/entities/block/model/tableBlocks";
import { caretLineEdge, exitTable, isCaretAtEnd, isCaretAtStart } from "./tableCaretDom";
import { insertTableColumnBefore, insertTableRowBefore } from "./tableStructure";
import type { CellAddress, CellKeyContext, NavigateKeyContext } from "./tableTypes";

/** Edit-mode dispatch for a focused cell editor. */
export function handleTableCellKey(event: React.KeyboardEvent<HTMLDivElement>, rowIndex: number, columnIndex: number, context: CellKeyContext) {
  if (handleStructuralKey(event, rowIndex, columnIndex, context)) return;
  if (handleEscapeKey(event, rowIndex, columnIndex, context)) return;
  if (handleTabKey(event, rowIndex, columnIndex, context)) return;
  if (handleVerticalKey(event, rowIndex, columnIndex, context)) return;
  handleHorizontalCaretKey(event, rowIndex, columnIndex, context);
}

function handleStructuralKey(event: React.KeyboardEvent<HTMLDivElement>, rowIndex: number, columnIndex: number, context: CellKeyContext): boolean {
  const command = event.ctrlKey || event.metaKey;
  const lastRow = context.data.length - 1;
  const lastColumn = context.columnCount - 1;
  const structural = command && event.shiftKey;
  if (structural && event.key === "ArrowDown") return runHandled(event, () => context.runStructuralEdit(addTableRow(context.source, rowIndex), insertConfigRow(context.config, rowIndex), { rowIndex: rowIndex + 1, columnIndex }));
  if (structural && event.key === "ArrowUp") return runHandled(event, () => context.runStructuralEdit(insertTableRowBefore(context.source, rowIndex), insertConfigRow(context.config, rowIndex - 1), { rowIndex, columnIndex }));
  if (structural && event.key === "ArrowRight") return runHandled(event, () => context.runStructuralEdit(addTableColumn(context.source, columnIndex), insertConfigColumn(context.config, columnIndex), { rowIndex, columnIndex: columnIndex + 1 }));
  if (structural && event.key === "ArrowLeft") return runHandled(event, () => context.runStructuralEdit(insertTableColumnBefore(context.source, columnIndex), insertConfigColumn(context.config, columnIndex - 1), { rowIndex, columnIndex }));
  if (structural && event.key === "Backspace") return runHandled(event, () => { if (context.data.length > 1) context.runStructuralEdit(removeTableRow(context.source, rowIndex), removeConfigRow(context.config, rowIndex), { rowIndex: Math.min(rowIndex, lastRow - 1), columnIndex }); });
  if (command && !event.shiftKey && event.key === "Delete") return runHandled(event, () => { if (context.columnCount > 1) context.runStructuralEdit(removeTableColumn(context.source, columnIndex), removeConfigColumn(context.config, columnIndex), { rowIndex, columnIndex: Math.min(columnIndex, lastColumn - 1) }); });
  return false;
}

// Escape leaves edit mode for navigate mode (selection ring + arrow nav). A
// second Escape from navigate mode exits the table to the block shell.
function handleEscapeKey(event: React.KeyboardEvent<HTMLDivElement>, rowIndex: number, columnIndex: number, context: CellKeyContext): boolean {
  if (event.key !== "Escape") return false;
  return runHandled(event, () => context.enterNavigate({ rowIndex, columnIndex }));
}

function handleTabKey(event: React.KeyboardEvent<HTMLDivElement>, rowIndex: number, columnIndex: number, context: CellKeyContext): boolean {
  if (event.key !== "Tab") return false;
  return runHandled(event, () => {
    const next = event.shiftKey ? getPreviousCell(rowIndex, columnIndex, context.columnCount) : getNextCell(rowIndex, columnIndex, context.columnCount, context.data.length);
    if (next) {
      context.focusCell(next.rowIndex, next.columnIndex, event.shiftKey ? "end" : "start");
    } else if (!event.shiftKey) {
      const lastRow = context.data.length - 1;
      context.runStructuralEdit(addTableRow(context.source, lastRow), insertConfigRow(context.config, lastRow), { rowIndex: lastRow + 1, columnIndex: 0 });
    }
  });
}

function handleVerticalKey(event: React.KeyboardEvent<HTMLDivElement>, rowIndex: number, columnIndex: number, context: CellKeyContext): boolean {
  if (event.shiftKey || event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return false;
  const edge = caretLineEdge(event.currentTarget);
  if (event.key === "ArrowUp") {
    if (!edge.first) return false;
    if (rowIndex > 0) return runHandled(event, () => context.focusCell(rowIndex - 1, columnIndex, "end"));
    return runHandled(event, () => exitTable(context.root, "up"));
  }
  if (!edge.last) return false;
  if (rowIndex < context.data.length - 1) return runHandled(event, () => context.focusCell(rowIndex + 1, columnIndex, "start"));
  return runHandled(event, () => exitTable(context.root, "down"));
}

function handleHorizontalCaretKey(event: React.KeyboardEvent<HTMLDivElement>, rowIndex: number, columnIndex: number, context: CellKeyContext): boolean {
  if (event.shiftKey) return false;
  if (event.key === "ArrowLeft" && isCaretAtStart(event.currentTarget)) return runHandled(event, () => {
    const previous = getPreviousCell(rowIndex, columnIndex, context.columnCount);
    if (previous) context.focusCell(previous.rowIndex, previous.columnIndex, "end");
  });
  if (event.key === "ArrowRight" && isCaretAtEnd(event.currentTarget)) return runHandled(event, () => {
    const next = getNextCell(rowIndex, columnIndex, context.columnCount, context.data.length);
    if (next) context.focusCell(next.rowIndex, next.columnIndex, "start");
  });
  return false;
}

/** Navigate-mode dispatch when the grid container itself holds focus. */
export function handleNavigateKey(event: React.KeyboardEvent<HTMLDivElement>, cell: CellAddress, context: NavigateKeyContext): void {
  const { rowIndex, columnIndex } = cell;
  const move = (nextRow: number, nextColumn: number) => runHandled(event, () => context.setActiveCell({
    rowIndex: Math.max(0, Math.min(nextRow, context.rowCount - 1)),
    columnIndex: Math.max(0, Math.min(nextColumn, context.columnCount - 1)),
  }));
  switch (event.key) {
    case "ArrowUp": move(rowIndex - 1, columnIndex); return;
    case "ArrowDown": move(rowIndex + 1, columnIndex); return;
    case "ArrowLeft": move(rowIndex, columnIndex - 1); return;
    case "ArrowRight": move(rowIndex, columnIndex + 1); return;
    case "Tab": { const next = event.shiftKey ? getPreviousCell(rowIndex, columnIndex, context.columnCount) : getNextCell(rowIndex, columnIndex, context.columnCount, context.rowCount); if (next) { runHandled(event, () => context.setActiveCell(next)); } else { event.preventDefault(); } return; }
    case "Enter": runHandled(event, () => context.enterEditCell(cell)); return;
    case "Escape": runHandled(event, () => context.exit()); return;
    case "Backspace": case "Delete": runHandled(event, () => context.clearCell(cell)); return;
    default: if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) runHandled(event, () => context.enterEditCell(cell, event.key));
  }
}

function runHandled(event: React.KeyboardEvent<HTMLDivElement>, action: () => void): true {
  event.preventDefault();
  action();
  return true;
}

function getPreviousCell(rowIndex: number, columnIndex: number, columnCount: number): CellAddress | null {
  if (columnIndex > 0) return { rowIndex, columnIndex: columnIndex - 1 };
  if (rowIndex > 0) return { rowIndex: rowIndex - 1, columnIndex: columnCount - 1 };
  return null;
}

function getNextCell(rowIndex: number, columnIndex: number, columnCount: number, rowCount: number): CellAddress | null {
  if (columnIndex < columnCount - 1) return { rowIndex, columnIndex: columnIndex + 1 };
  if (rowIndex < rowCount - 1) return { rowIndex: rowIndex + 1, columnIndex: 0 };
  return null;
}
