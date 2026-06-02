/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TableParts.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useLayoutEffect, useRef } from "react";
import { GripVertical } from "lucide-react";

import type { TableBlockConfig, TableBlockTextAlign } from "@/entities/block";
import { getTableAlignmentClassName, getTablePaddingClassName } from "@/entities/block/model/tableBlocks";
import type { CellCommit, CellFocusHandler, CellKeyHandler } from "./tableTypes";

const CELL_PROPS = {
  contentEditable: "plaintext-only",
  suppressContentEditableWarning: true,
  role: "textbox",
  // -1 keeps cells out of the Tab order so Tab lands on the grid (navigate
  // mode); programmatic .focus() for edit mode still works.
  tabIndex: -1,
  "aria-multiline": true,
} satisfies React.HTMLAttributes<HTMLDivElement>;

interface TableDataRowProps {
  row: string[];
  rowIndex: number;
  columnCount: number;
  config: TableBlockConfig;
  textStyle?: React.CSSProperties;
  selectedCell: string | null;
  commitHandlers: CellCommit[];
  onColumnResize: (event: React.PointerEvent, columnIndex: number) => void;
  onRowResize: (event: React.PointerEvent, rowIndex: number) => void;
  onRowDragStart: (event: React.PointerEvent, rowIndex: number) => void;
  onRowMenuKey: (rowIndex: number, x: number, y: number) => void;
  onCellKeyDown: CellKeyHandler;
  onCellFocus: CellFocusHandler;
}

export const TableDataRow = React.memo(function TableDataRow({ row, rowIndex, columnCount, config, textStyle, selectedCell, commitHandlers, onColumnResize, onRowResize, onRowDragStart, onRowMenuKey, onCellKeyDown, onCellFocus }: Readonly<TableDataRowProps>) {
  const height = config.rowHeights?.[rowIndex];
  const rowStyle: React.CSSProperties = { height: `var(--osio-table-row-${rowIndex}-height, ${toCssSize(height)})` };
  return <tr className={`group/row ${getRowClassName(rowIndex, config)}`} style={rowStyle}>{Array.from({ length: columnCount }, (_, columnIndex) => {
    const alignment = config.columnAlignments?.[columnIndex] ?? null;
    const isHeader = (config.headerRow !== false && rowIndex === 0) || (config.headerColumn === true && columnIndex === 0);
    const cellId = `${rowIndex}:${columnIndex}`;
    return (
      <td key={getCellKey(rowIndex, columnIndex)} id={`tcell-${rowIndex}-${columnIndex}`} role="gridcell" aria-selected={selectedCell === cellId ? "true" : undefined} aria-rowindex={rowIndex + 1} aria-colindex={columnIndex + 1} data-table-cell={cellId} className={`${getCellFrameClassName(config, alignment, rowIndex, columnIndex)}${selectedCell === cellId ? " z-[var(--osio-z-raised)] outline outline-2 -outline-offset-1 outline-[var(--osio-accent)]" : ""}`} style={textStyle}>
        <EditableTableCell cellId={cellId} initialValue={row[columnIndex] ?? ""} rowIndex={rowIndex} columnIndex={columnIndex} alignment={alignment} onCommit={commitHandlers[columnIndex]} isHeader={isHeader} onKeyDown={onCellKeyDown} onFocus={onCellFocus} />
        {rowIndex === 0 ? <ColumnResizeDivider columnIndex={columnIndex} onPointerDown={onColumnResize} /> : null}
        {columnIndex === 0 ? <RowResizeDivider rowIndex={rowIndex} onPointerDown={onRowResize} /> : null}
        {columnIndex === 0 ? <RowDragHandle rowIndex={rowIndex} onPointerDown={onRowDragStart} onMenuKey={onRowMenuKey} /> : null}
      </td>
    );
  })}</tr>;
});

function RowDragHandle({ rowIndex, onPointerDown, onMenuKey }: Readonly<{ rowIndex: number; onPointerDown: (event: React.PointerEvent, rowIndex: number) => void; onMenuKey: (rowIndex: number, x: number, y: number) => void }>) {
  // Pointer-drag is handled in onPointerDown; a keyboard activation (Enter/Space
  // -> click with detail 0) opens the actions menu anchored to the grip.
  return (
    <button
      type="button"
      data-table-handle
      aria-haspopup="menu"
      aria-label={`Row ${rowIndex + 1} options — drag to reorder`}
      onPointerDown={(event) => onPointerDown(event, rowIndex)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); onMenuKey(rowIndex, rect.right + 4, rect.top); } }}
      className="absolute left-0 top-1/2 z-[var(--osio-z-raised)] flex h-5 w-4 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded bg-[var(--osio-bg-surface)]/90 text-[var(--osio-fg-muted)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)] focus-visible:opacity-100 group-hover/table:opacity-50 group-hover/row:opacity-100 active:cursor-grabbing"
    >
      <GripVertical size={14} />
    </button>
  );
}

interface EditableTableCellProps {
  cellId: string;
  initialValue: string;
  rowIndex: number;
  columnIndex: number;
  alignment: TableBlockTextAlign;
  onCommit: CellCommit;
  isHeader: boolean;
  onKeyDown: CellKeyHandler;
  onFocus: CellFocusHandler;
}

const EditableTableCell = React.memo(function EditableTableCell({ cellId, initialValue, rowIndex, columnIndex, alignment, onCommit, isHeader, onKeyDown, onFocus }: Readonly<EditableTableCellProps>) {
  const cellRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const node = cellRef.current;
    if (node && document.activeElement !== node && node.textContent !== initialValue) node.textContent = initialValue;
  }, [cellId, initialValue]);
  const commitFromNode = useCallback((flush = false) => onCommit(cellRef.current?.textContent ?? "", flush), [onCommit]);
  return React.createElement("div", {
    ref: cellRef,
    ...CELL_PROPS,
    "aria-label": `Row ${rowIndex + 1}, column ${columnIndex + 1}`,
    "data-table-cell-id": cellId,
    className: ["min-h-8 w-full bg-transparent outline-none", "whitespace-pre-wrap break-words", getTableAlignmentClassName(alignment), isHeader ? "font-medium" : ""].join(" "),
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => onKeyDown(event, rowIndex, columnIndex),
    onFocus: () => onFocus(cellId),
    onInput: () => commitFromNode(false),
    onBlur: () => commitFromNode(true),
  });
}, areCellsEqual);

function ColumnResizeDivider({ columnIndex, onPointerDown }: Readonly<{ columnIndex: number; onPointerDown: (event: React.PointerEvent, columnIndex: number) => void }>) {
  return <div data-table-handle className="absolute right-0 top-0 z-[var(--osio-z-raised)] h-full w-[6px] cursor-col-resize before:absolute before:right-0 before:top-0 before:h-full before:w-px before:bg-transparent hover:before:bg-[var(--osio-accent)]" onPointerDown={(event) => onPointerDown(event, columnIndex)} />;
}

function RowResizeDivider({ rowIndex, onPointerDown }: Readonly<{ rowIndex: number; onPointerDown: (event: React.PointerEvent, rowIndex: number) => void }>) {
  return <div data-table-handle className="absolute bottom-0 left-0 z-[var(--osio-z-raised)] h-[6px] w-full cursor-row-resize before:absolute before:bottom-0 before:left-0 before:h-px before:w-full before:bg-transparent hover:before:bg-[var(--osio-accent)]" onPointerDown={(event) => onPointerDown(event, rowIndex)} />;
}

export function createColumnStyles(columnCount: number, config: TableBlockConfig): React.CSSProperties[] {
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const width = config.columnWidths?.[columnIndex];
    return { minWidth: config.minColumnWidth, width: `var(--osio-table-col-${columnIndex}-width, ${toCssSize(width)})`, maxWidth: config.wrap ? config.maxColumnWidth : undefined };
  });
}

function toCssSize(value: number | undefined): string { return value == null ? "auto" : `${value}px`; }

export function getColumnKey(columnIndex: number): string { return `col-${columnIndex}`; }
function getCellKey(rowIndex: number, columnIndex: number): string { return `cell-${rowIndex}-${columnIndex}`; }
export function getRowKey(rowIndex: number): string { return `row-${rowIndex}`; }

function getRowClassName(rowIndex: number, config: TableBlockConfig): string {
  const classes = [];
  if (config.headerRow !== false && rowIndex === 0) classes.push("bg-[var(--osio-bg-subtle)] font-medium");
  if (config.stripedRows && rowIndex > 0 && rowIndex % 2 === 0) classes.push("bg-[var(--osio-bg-subtle)]/50");
  return classes.join(" ");
}

function getCellFrameClassName(config: TableBlockConfig, alignment: TableBlockTextAlign, rowIndex: number, columnIndex: number): string {
  return ["relative text-[var(--osio-fg-default)] align-top focus-within:bg-[var(--osio-bg-hover)]", getTablePaddingClassName(config.cellPadding), getTableAlignmentClassName(alignment), config.wrap === false ? "whitespace-nowrap" : "whitespace-normal break-words", config.showBorders === false ? "" : "border-b border-r border-[var(--osio-border-default)] last:border-r-0", config.headerColumn && columnIndex === 0 ? "font-medium bg-[var(--osio-bg-subtle)]" : "", config.headerRow !== false && rowIndex === 0 ? "font-medium" : ""].filter(Boolean).join(" ");
}

function areCellsEqual(previous: Readonly<EditableTableCellProps>, next: Readonly<EditableTableCellProps>): boolean {
  return previous.cellId === next.cellId && previous.initialValue === next.initialValue && previous.rowIndex === next.rowIndex && previous.columnIndex === next.columnIndex && previous.alignment === next.alignment && previous.onCommit === next.onCommit && previous.onKeyDown === next.onKeyDown && previous.onFocus === next.onFocus && previous.isHeader === next.isHeader;
}
