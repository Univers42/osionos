/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TableBlockEditor.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useMemo, useRef, useState } from "react";

import type { Block, TableBlockConfig } from "@/entities/block";
import { clampTableColumnWidth, clampTableRowHeight, getTableColumnCount } from "@/entities/block/model/tableBlocks";
import { moveConfigRow, moveTableRow } from "@/entities/block/model/tableRowOps";
import { appendTableColumns, appendTableRows } from "./tableStructure";
import { focusCell, focusCellWhenReady, focusTableBlockShell, resolveRowDropSlot, startPointerDrag, stopPointerDrag } from "./tableCaretDom";
import { handleNavigateKey, handleTableCellKey } from "./tableKeyboard";
import { TableDataRow, createColumnStyles, getColumnKey, getRowKey } from "./TableParts";
import { AddAxisButton } from "./TableAddButton";
import { TableRowMenu } from "./TableRowMenu";
import { applyTableMenuAction, type TableMenuAction } from "./tableMenuActions";
import { useTableCommit } from "./useTableCommit";
import type { Axis, CaretPlacement, CellAddress, CellFocusHandler, CellKeyHandler } from "./tableTypes";

type RowMenuAnchor = { rowIndex: number; columnIndex: number; x: number; y: number };

const ROW_ESTIMATE_HEIGHT = 40;

interface TableBlockEditorProps {
  block: Block;
  pageId: string;
  style?: React.CSSProperties;
  textStyle?: React.CSSProperties;
  onDeleteTable?: () => void;
  onBeforeStructuralEdit?: () => void;
}

export const TableBlockEditor: React.FC<TableBlockEditorProps> = ({ block, pageId, style, textStyle, onDeleteTable, onBeforeStructuralEdit }) => {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { data, columnCount, config, latestDataRef, scheduleCellCommit, commitStructure, commitConfig, cellCommitHandlers } = useTableCommit(block, pageId);
  const [activeCell, setActiveCell] = useState<CellAddress | null>(null);
  const [dropY, setDropY] = useState<number | null>(null);
  const [rowMenu, setRowMenu] = useState<RowMenuAnchor | null>(null);

  const focusTableCell = useCallback((rowIndex: number, columnIndex: number, placement: CaretPlacement = "start") => {
    if (!focusCell(tableRef.current, rowIndex, columnIndex, placement)) focusCellWhenReady(tableRef.current, rowIndex, columnIndex, placement);
  }, []);
  const runStructuralEdit = useCallback((nextData: string[][], nextConfig: TableBlockConfig, target: CellAddress, placement: CaretPlacement = "start") => {
    onBeforeStructuralEdit?.();
    setActiveCell(target);
    commitStructure(nextData, nextConfig);
    // Focus one frame later: a synchronous focus pins the destination cell before
    // it syncs its new value, leaving stale text (e.g. column 0 on reorder).
    requestAnimationFrame(() => focusTableCell(target.rowIndex, target.columnIndex, placement));
  }, [commitStructure, focusTableCell, onBeforeStructuralEdit]);
  const handleCellFocus = useCallback<CellFocusHandler>((cellId) => {
    const [rowIndex, columnIndex] = cellId.split(":").map(Number);
    setActiveCell({ rowIndex, columnIndex });
  }, []);
  // Navigate -> edit; a seed char is written to the DOM before focusing (a focused cell skips value-sync).
  const enterEditCell = useCallback((cell: CellAddress, seed?: string) => {
    setActiveCell(cell);
    if (seed !== undefined) {
      const node = tableRef.current?.querySelector<HTMLElement>(`[data-table-cell="${cell.rowIndex}:${cell.columnIndex}"] [contenteditable]`);
      if (node) node.textContent = seed;
      scheduleCellCommit(cell.rowIndex, cell.columnIndex, seed, true);
    }
    focusTableCell(cell.rowIndex, cell.columnIndex, "end");
  }, [focusTableCell, scheduleCellCommit]);
  const enterNavigate = useCallback((cell: CellAddress) => { setActiveCell(cell); tableRef.current?.focus(); }, []);

  const handleCellKeyDown = useCallback<CellKeyHandler>((event, rowIndex, columnIndex) => {
    event.stopPropagation();
    handleTableCellKey(event, rowIndex, columnIndex, { columnCount, config, data, root: rootRef.current, source: latestDataRef.current, focusCell: focusTableCell, runStructuralEdit, enterNavigate });
  }, [columnCount, config, data, enterNavigate, focusTableCell, latestDataRef, runStructuralEdit]);

  // Navigate-mode dispatch; bails when a cell editor (not the grid) is focused.
  const handleGridKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.currentTarget !== document.activeElement) return;
    handleNavigateKey(event, activeCell ?? { rowIndex: 0, columnIndex: 0 }, {
      columnCount,
      rowCount: data.length,
      setActiveCell,
      enterEditCell,
      clearCell: (cell) => scheduleCellCommit(cell.rowIndex, cell.columnIndex, "", true),
      exit: () => focusTableBlockShell(rootRef.current),
    });
  }, [activeCell, columnCount, data.length, enterEditCell, scheduleCellCommit]);
  const handleGridFocus = useCallback(() => { if (!activeCell) setActiveCell({ rowIndex: 0, columnIndex: 0 }); }, [activeCell]);

  const startColumnResize = useCallback((event: React.PointerEvent, columnIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = config.columnWidths?.[columnIndex] ?? event.currentTarget.closest("td")?.getBoundingClientRect().width ?? 160;
    let latestWidth = startWidth;
    const move = (moveEvent: PointerEvent) => {
      latestWidth = clampTableColumnWidth(startWidth + moveEvent.clientX - startX, startWidth);
      tableRef.current?.style.setProperty(`--osio-table-col-${columnIndex}-width`, `${latestWidth}px`);
    };
    const up = () => {
      const widths = Array.from({ length: columnCount }, (_, index) => config.columnWidths?.[index]);
      widths[columnIndex] = latestWidth;
      commitConfig({ ...config, layoutMode: "fixed", columnWidths: widths });
      stopPointerDrag(move, up);
    };
    startPointerDrag("col-resize", move, up);
  }, [columnCount, commitConfig, config]);

  const startRowResize = useCallback((event: React.PointerEvent, rowIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = config.rowHeights?.[rowIndex] ?? event.currentTarget.closest("tr")?.getBoundingClientRect().height ?? ROW_ESTIMATE_HEIGHT;
    let latestHeight = startHeight;
    const move = (moveEvent: PointerEvent) => {
      latestHeight = clampTableRowHeight(startHeight + moveEvent.clientY - startY, startHeight);
      tableRef.current?.style.setProperty(`--osio-table-row-${rowIndex}-height`, `${latestHeight}px`);
    };
    const up = () => {
      const heights = Array.from({ length: data.length }, (_, index) => config.rowHeights?.[index]);
      heights[rowIndex] = latestHeight;
      commitConfig({ ...config, rowHeights: heights });
      stopPointerDrag(move, up);
    };
    startPointerDrag("row-resize", move, up);
  }, [commitConfig, config, data.length]);

  const moveRow = useCallback((from: number, to: number) => {
    if (from === to) return;
    runStructuralEdit(moveTableRow(latestDataRef.current, from, to), moveConfigRow(config, from, to), { rowIndex: to, columnIndex: 0 });
  }, [config, latestDataRef, runStructuralEdit]);
  const openRowMenu = useCallback((rowIndex: number, x: number, y: number) => {
    setRowMenu({ rowIndex, columnIndex: activeCell?.columnIndex ?? 0, x, y });
  }, [activeCell]);

  // The grip reorders (drag past a small threshold) or opens the actions menu (click).
  const startRowDrag = useCallback((event: React.PointerEvent, rowIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let targetSlot = rowIndex;
    const move = (moveEvent: PointerEvent) => {
      if (!dragging && Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) < 5) return;
      dragging = true;
      const result = resolveRowDropSlot(tableRef.current, rootRef.current, moveEvent.clientY);
      targetSlot = result.slot;
      setDropY(result.indicatorY);
    };
    const up = () => {
      setDropY(null);
      if (dragging) moveRow(rowIndex, targetSlot > rowIndex ? targetSlot - 1 : targetSlot);
      else openRowMenu(rowIndex, startX, startY);
      stopPointerDrag(move, up);
    };
    startPointerDrag("grabbing", move, up);
  }, [moveRow, openRowMenu]);

  const handleRowMenuAction = useCallback((action: TableMenuAction) => {
    if (!rowMenu) return;
    const result = applyTableMenuAction(action, latestDataRef.current, config, rowMenu.rowIndex, rowMenu.columnIndex);
    if (result) runStructuralEdit(result.data, result.config, result.target);
  }, [config, latestDataRef, rowMenu, runStructuralEdit]);

  // Click adds one row/column; the hover flyout adds several at once.
  const addAxis = useCallback((axis: Axis, count: number) => {
    const current = latestDataRef.current;
    const bodyRow = config.headerRow !== false && current.length > 1 ? 1 : 0;
    const [nextData, nextConfig] = axis === "column" ? appendTableColumns(current, config, count) : appendTableRows(current, config, count);
    const target = axis === "column" ? { rowIndex: bodyRow, columnIndex: getTableColumnCount(current) } : { rowIndex: current.length, columnIndex: 0 };
    runStructuralEdit(nextData, nextConfig, target);
  }, [config, latestDataRef, runStructuralEdit]);

  const columnStyles = useMemo(() => createColumnStyles(columnCount, config), [columnCount, config]);
  const tableClassName = ["text-sm", config.layoutMode === "fit" ? "min-w-full w-full" : "min-w-full w-max", config.layoutMode === "fixed" ? "table-fixed" : "table-auto"].join(" ");
  const activeCellId = activeCell ? `${activeCell.rowIndex}:${activeCell.columnIndex}` : null;

  return (
    <div ref={rootRef} className="group/table relative my-2" data-can-delete-table={Boolean(onDeleteTable)} style={style}>
      <div className="overflow-x-auto overflow-y-visible rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
        <table ref={tableRef} role="grid" tabIndex={0} data-table-grid aria-label="Editable table — arrow keys navigate cells" onKeyDown={handleGridKeyDown} onFocus={handleGridFocus} aria-rowcount={data.length} aria-colcount={columnCount} aria-activedescendant={activeCellId ? `tcell-${activeCellId.replace(":", "-")}` : undefined} aria-keyshortcuts="Tab Shift+Tab ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape Ctrl+Shift+ArrowUp Ctrl+Shift+ArrowDown Ctrl+Shift+ArrowLeft Ctrl+Shift+ArrowRight Ctrl+Shift+Backspace Ctrl+Delete" className={`${tableClassName} focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40`} style={{ tableLayout: config.layoutMode === "fixed" ? "fixed" : "auto" }}>
          <colgroup>{columnStyles.map((columnStyle, columnIndex) => <col key={getColumnKey(columnIndex)} style={columnStyle} />)}</colgroup>
          <tbody>{data.map((row, rowIndex) => (
            <TableDataRow key={getRowKey(rowIndex)} row={row} rowIndex={rowIndex} columnCount={columnCount} config={config} textStyle={textStyle} selectedCell={activeCellId} commitHandlers={cellCommitHandlers[rowIndex]} onColumnResize={startColumnResize} onRowResize={startRowResize} onRowDragStart={startRowDrag} onRowMenuKey={openRowMenu} onCellKeyDown={handleCellKeyDown} onCellFocus={handleCellFocus} />
          ))}</tbody>
        </table>
      </div>
      {dropY != null && <div className="pointer-events-none absolute left-0 right-0 z-[var(--osio-z-popover)] h-0.5 -translate-y-1/2 rounded-full bg-[var(--osio-accent)] shadow-[0_0_0_1px_var(--osio-accent)] transition-[top] duration-100 ease-out" style={{ top: dropY }} />}
      <AddAxisButton axis="column" onAdd={addAxis} />
      <AddAxisButton axis="row" onAdd={addAxis} />
      {rowMenu && <TableRowMenu x={rowMenu.x} y={rowMenu.y} canDeleteRow={data.length > 1} canDeleteColumn={columnCount > 1} onSelect={handleRowMenuAction} onClose={() => setRowMenu(null)} />}
    </div>
  );
};
