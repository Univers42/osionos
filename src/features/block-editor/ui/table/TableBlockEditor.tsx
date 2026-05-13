import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import type { Block, TableBlockConfig, TableBlockTextAlign } from "@/entities/block";
import { addTableColumn, addTableRow, clampTableColumnWidth, clampTableRowHeight, getTableAlignmentClassName, getTableColumnCount, getTablePaddingClassName, insertConfigColumn, insertConfigRow, normalizeTableData, removeConfigColumn, removeConfigRow, removeTableColumn, removeTableRow, resolveTableConfig } from "@/entities/block/model/tableBlocks";
import { focusEditableBlock } from "@/features/block-editor/model/blockDomFocus";
import { usePageStore } from "@/store/usePageStore";

interface TableBlockEditorProps {
  block: Block;
  pageId: string;
  style?: React.CSSProperties;
  textStyle?: React.CSSProperties;
  onDeleteTable?: () => void;
  onBeforeStructuralEdit?: () => void;
}

type Axis = "column" | "row";
type CellCommit = (value: string, flush?: boolean) => void;
type ScheduleCellCommit = (rowIndex: number, columnIndex: number, value: string, flush?: boolean) => void;
type InsertPreview = { axis: Axis; offset: number } | null;
type CellAddress = { rowIndex: number; columnIndex: number };
type CaretPlacement = "start" | "end";
type CellKeyHandler = (event: React.KeyboardEvent<HTMLDivElement>, rowIndex: number, columnIndex: number) => void;
type CellFocusHandler = (cellId: string) => void;
type StructuralEditRunner = (nextData: string[][], nextConfig: TableBlockConfig, target: CellAddress, placement?: CaretPlacement) => void;

interface CellKeyContext {
  columnCount: number;
  config: TableBlockConfig;
  data: string[][];
  root: HTMLElement | null;
  source: string[][];
  focusCell: (rowIndex: number, columnIndex: number, placement?: CaretPlacement) => void;
  runStructuralEdit: StructuralEditRunner;
}

const CELL_COMMIT_DELAY_MS = 200;
const INSERT_STEP_PX = 80;
const ROW_ESTIMATE_HEIGHT = 40;
const CELL_PROPS = {
  contentEditable: "plaintext-only",
  suppressContentEditableWarning: true,
  role: "textbox",
  tabIndex: 0,
  "aria-multiline": true,
} satisfies React.HTMLAttributes<HTMLDivElement>;
const ADD_BUTTON_CLASS = "z-[var(--osio-z-raised)] flex h-6 w-6 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)] group-hover/table:opacity-100 group-focus-within/table:opacity-100";

export const TableBlockEditor: React.FC<TableBlockEditorProps> = ({ block, pageId, style, textStyle, onDeleteTable, onBeforeStructuralEdit }) => {
  const updateBlock = usePageStore((state) => state.updateBlock);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const pendingCommitRef = useRef(false);
  const blockData = useMemo(() => normalizeTableData(block.tableData), [block.tableData]);
  const [draftData, setDraftData] = useState(blockData);
  const latestDataRef = useRef(draftData);
  const data = draftData;
  const columnCount = getTableColumnCount(data);
  const resolvedConfig = useMemo(() => resolveTableConfig({ tableConfig: block.tableConfig }, columnCount, data.length), [block.tableConfig, columnCount, data.length]);
  const [config, setConfig] = useState(resolvedConfig);
  const [insertPreview, setInsertPreview] = useState<InsertPreview>(null);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const updateTable = useCallback((updates: Partial<Block>) => updateBlock(pageId, block.id, updates), [block.id, pageId, updateBlock]);

  useEffect(() => { latestDataRef.current = draftData; }, [draftData]);
  useEffect(() => {
    if (!pendingCommitRef.current && !tableDataEqual(blockData, latestDataRef.current)) {
      latestDataRef.current = blockData;
      setDraftData(blockData);
    }
  }, [blockData]);
  useEffect(() => { setConfig(resolvedConfig); }, [resolvedConfig]);

  const flushCellCommit = useCallback(() => {
    if (commitTimerRef.current !== null) globalThis.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
    if (!pendingCommitRef.current) return;
    pendingCommitRef.current = false;
    setDraftData(latestDataRef.current);
    updateTable({ tableData: latestDataRef.current });
  }, [updateTable]);
  useEffect(() => () => flushCellCommit(), [flushCellCommit]);

  const scheduleCellCommit = useCallback<ScheduleCellCommit>((rowIndex, columnIndex, value, flush = false) => {
    latestDataRef.current = updateTableCellValue(latestDataRef.current, rowIndex, columnIndex, value);
    pendingCommitRef.current = true;
    if (flush) {
      flushCellCommit();
      return;
    }
    if (commitTimerRef.current !== null) globalThis.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = globalThis.setTimeout(flushCellCommit, CELL_COMMIT_DELAY_MS);
  }, [flushCellCommit]);
  const cellCommitHandlers = useMemo(() => createCellCommitHandlers(data.length, columnCount, scheduleCellCommit), [columnCount, data.length, scheduleCellCommit]);

  const commitStructure = useCallback((nextData: string[][], nextConfig: TableBlockConfig) => {
    if (commitTimerRef.current !== null) globalThis.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
    pendingCommitRef.current = false;
    latestDataRef.current = nextData;
    setDraftData(nextData);
    setConfig(nextConfig);
    updateTable({ tableData: nextData, tableConfig: nextConfig });
  }, [updateTable]);
  const commitConfig = useCallback((nextConfig: TableBlockConfig) => {
    setConfig(nextConfig);
    updateTable({ tableConfig: nextConfig });
  }, [updateTable]);

  const focusTableCell = useCallback((rowIndex: number, columnIndex: number, placement: CaretPlacement = "start") => {
    if (!focusCell(tableRef.current, rowIndex, columnIndex, placement)) {
      focusCellWhenReady(tableRef.current, rowIndex, columnIndex, placement);
    }
  }, []);
  const runStructuralEdit = useCallback((nextData: string[][], nextConfig: TableBlockConfig, target: CellAddress, placement: CaretPlacement = "start") => {
    onBeforeStructuralEdit?.();
    commitStructure(nextData, nextConfig);
    focusTableCell(target.rowIndex, target.columnIndex, placement);
  }, [commitStructure, focusTableCell, onBeforeStructuralEdit]);
  const handleCellFocus = useCallback<CellFocusHandler>((cellId) => setSelectedCell(cellId), []);

  const handleCellKeyDown = useCallback<CellKeyHandler>((event, rowIndex, columnIndex) => {
    event.stopPropagation();
    handleTableCellKey(event, rowIndex, columnIndex, {
      columnCount,
      config,
      data,
      root: rootRef.current,
      source: latestDataRef.current,
      focusCell: focusTableCell,
      runStructuralEdit,
    });
  }, [columnCount, config, data.length, focusTableCell, runStructuralEdit]);

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

  const startEdgeInsert = useCallback((event: React.PointerEvent, axis: Axis) => {
    event.preventDefault();
    event.stopPropagation();
    const start = axis === "column" ? event.clientX : event.clientY;
    let inserted = 0;
    let nextData = latestDataRef.current;
    let nextConfig = config;
    const insertLive = (target: number) => {
      const delta = target - inserted;
      if (delta <= 0) return;
      [nextData, nextConfig] = axis === "column" ? appendTableColumns(nextData, nextConfig, delta) : appendTableRows(nextData, nextConfig, delta);
      inserted = target;
      latestDataRef.current = nextData;
      setDraftData(nextData);
      setConfig(nextConfig);
    };
    setInsertPreview({ axis, offset: 0 });
    const move = (moveEvent: PointerEvent) => {
      const current = axis === "column" ? moveEvent.clientX : moveEvent.clientY;
      const offset = Math.max(0, current - start);
      insertLive(Math.floor(offset / INSERT_STEP_PX));
      setInsertPreview({ axis, offset });
    };
    const up = () => {
      setInsertPreview(null);
      insertLive(Math.max(1, inserted));
      commitStructure(nextData, nextConfig);
      stopPointerDrag(move, up);
    };
    startPointerDrag(axis === "column" ? "ew-resize" : "ns-resize", move, up);
  }, [commitStructure, config]);

  const columnStyles = useMemo(() => createColumnStyles(columnCount, config), [columnCount, config]);
  const tableClassName = ["text-sm", config.layoutMode === "fit" ? "min-w-full w-full" : "min-w-full w-max", config.layoutMode === "fixed" ? "table-fixed" : "table-auto"].join(" ");

  return (
    <div ref={rootRef} className="group/table relative my-2" data-can-delete-table={Boolean(onDeleteTable)} style={style}>
      <div role="grid" aria-rowcount={data.length} aria-colcount={columnCount} aria-keyshortcuts="Tab Shift+Tab ArrowUp ArrowDown ArrowLeft ArrowRight Escape Ctrl+Shift+ArrowUp Ctrl+Shift+ArrowDown Ctrl+Shift+ArrowLeft Ctrl+Shift+ArrowRight Ctrl+Shift+Backspace Ctrl+Delete" className="overflow-x-auto overflow-y-visible rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
        <table ref={tableRef} className={tableClassName} style={{ tableLayout: config.layoutMode === "fixed" ? "fixed" : "auto" }}>
          <colgroup>{columnStyles.map((columnStyle, columnIndex) => <col key={getColumnKey(columnIndex)} style={columnStyle} />)}</colgroup>
          <tbody>{data.map((row, rowIndex) => (
            <TableDataRow key={getRowKey(rowIndex)} row={row} rowIndex={rowIndex} columnCount={columnCount} config={config} textStyle={textStyle} selectedCell={selectedCell} commitHandlers={cellCommitHandlers[rowIndex]} onColumnResize={startColumnResize} onRowResize={startRowResize} onCellKeyDown={handleCellKeyDown} onCellFocus={handleCellFocus} />
          ))}</tbody>
        </table>
      </div>
      <EdgeInsertButton axis="column" onPointerDown={(event) => startEdgeInsert(event, "column")} />
      <EdgeInsertButton axis="row" onPointerDown={(event) => startEdgeInsert(event, "row")} />
      {insertPreview ? <InsertGhost preview={insertPreview} /> : null}
    </div>
  );
};

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
  onCellKeyDown: CellKeyHandler;
  onCellFocus: CellFocusHandler;
}

const TableDataRow = React.memo(function TableDataRow({ row, rowIndex, columnCount, config, textStyle, selectedCell, commitHandlers, onColumnResize, onRowResize, onCellKeyDown, onCellFocus }: Readonly<TableDataRowProps>) {
  const height = config.rowHeights?.[rowIndex];
  const rowStyle: React.CSSProperties = { height: `var(--osio-table-row-${rowIndex}-height, ${toCssSize(height)})` };
  return <tr className={getRowClassName(rowIndex, config)} style={rowStyle}>{Array.from({ length: columnCount }, (_, columnIndex) => {
    const alignment = config.columnAlignments?.[columnIndex] ?? null;
    const isHeader = (config.headerRow !== false && rowIndex === 0) || (config.headerColumn === true && columnIndex === 0);
    const cellId = `${rowIndex}:${columnIndex}`;
    return (
      <td key={getCellKey(rowIndex, columnIndex)} role="gridcell" aria-selected={selectedCell === cellId ? "true" : undefined} aria-rowindex={rowIndex + 1} aria-colindex={columnIndex + 1} data-table-cell={cellId} className={getCellFrameClassName(config, alignment, rowIndex, columnIndex)} style={textStyle}>
        <EditableTableCell cellId={cellId} initialValue={row[columnIndex] ?? ""} rowIndex={rowIndex} columnIndex={columnIndex} alignment={alignment} onCommit={commitHandlers[columnIndex]} isHeader={isHeader} onKeyDown={onCellKeyDown} onFocus={onCellFocus} />
        {rowIndex === 0 ? <ColumnResizeDivider columnIndex={columnIndex} onPointerDown={onColumnResize} /> : null}
        {columnIndex === 0 ? <RowResizeDivider rowIndex={rowIndex} onPointerDown={onRowResize} /> : null}
      </td>
    );
  })}</tr>;
});

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

function EdgeInsertButton({ axis, onPointerDown }: Readonly<{ axis: Axis; onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void }>) {
  const axisClass = axis === "column" ? "absolute -right-3 top-1/2 -translate-y-1/2 cursor-ew-resize" : "absolute -bottom-3 left-1/2 -translate-x-1/2 cursor-ns-resize";
  return <button type="button" aria-label={axis === "column" ? "Add column" : "Add row"} data-table-handle onPointerDown={onPointerDown} className={`${axisClass} ${ADD_BUTTON_CLASS}`}><Plus size={14} /></button>;
}

function InsertGhost({ preview }: Readonly<{ preview: NonNullable<InsertPreview> }>) {
  const style = preview.axis === "column" ? { transform: `translateX(${preview.offset}px)` } : { transform: `translateY(${preview.offset}px)` };
  const className = preview.axis === "column" ? "absolute right-0 top-0 h-full w-px bg-[var(--osio-accent)]" : "absolute bottom-0 left-0 h-px w-full bg-[var(--osio-accent)]";
  return <div className={`${className} pointer-events-none z-[var(--osio-z-popover)]`} style={style} />;
}

function appendTableColumns(data: string[][], config: TableBlockConfig, count: number): [string[][], TableBlockConfig] {
  let nextData = data;
  let nextConfig = config;
  for (let index = 0; index < count; index += 1) {
    const afterColumn = getTableColumnCount(nextData) - 1;
    nextData = addTableColumn(nextData, afterColumn);
    nextConfig = insertConfigColumn(nextConfig, afterColumn);
  }
  return [nextData, nextConfig];
}

function appendTableRows(data: string[][], config: TableBlockConfig, count: number): [string[][], TableBlockConfig] {
  let nextData = data;
  let nextConfig = config;
  for (let index = 0; index < count; index += 1) {
    const afterRow = nextData.length - 1;
    nextData = addTableRow(nextData, afterRow);
    nextConfig = insertConfigRow(nextConfig, afterRow);
  }
  return [nextData, nextConfig];
}

function handleTableCellKey(event: React.KeyboardEvent<HTMLDivElement>, rowIndex: number, columnIndex: number, context: CellKeyContext) {
  if (handleStructuralKey(event, rowIndex, columnIndex, context)) return;
  if (handleEscapeKey(event, context.root)) return;
  if (handleTabKey(event, rowIndex, columnIndex, context)) return;
  if (handleVerticalExitKey(event, rowIndex, context)) return;
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

function handleEscapeKey(event: React.KeyboardEvent<HTMLDivElement>, root: HTMLElement | null): boolean {
  if (event.key !== "Escape") return false;
  return runHandled(event, () => focusTableBlockShell(root));
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

function handleVerticalExitKey(event: React.KeyboardEvent<HTMLDivElement>, rowIndex: number, context: CellKeyContext): boolean {
  if (event.key === "ArrowUp" && rowIndex === 0) return runHandled(event, () => exitTable(context.root, "up"));
  if (event.key === "ArrowDown" && rowIndex === context.data.length - 1) return runHandled(event, () => exitTable(context.root, "down"));
  return false;
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

function insertTableRowBefore(tableData: string[][], rowIndex: number): string[][] {
  const data = normalizeTableData(tableData);
  const insertAt = Math.max(0, Math.min(rowIndex, data.length));
  const row = new Array(getTableColumnCount(data)).fill("");
  return [...data.slice(0, insertAt), row, ...data.slice(insertAt)];
}

function insertTableColumnBefore(tableData: string[][], columnIndex: number): string[][] {
  const data = normalizeTableData(tableData);
  const insertAt = Math.max(0, Math.min(columnIndex, getTableColumnCount(data)));
  return data.map((row) => [...row.slice(0, insertAt), "", ...row.slice(insertAt)]);
}

function focusCell(table: HTMLElement | null, rowIndex: number, columnIndex: number, placement: CaretPlacement = "start"): boolean {
  const cell = table?.querySelector<HTMLElement>(`[data-table-cell="${rowIndex}:${columnIndex}"] [contenteditable]`);
  if (!cell) return false;
  cell.focus();
  placeCaret(cell, placement);
  return true;
}

function focusCellWhenReady(table: HTMLElement | null, rowIndex: number, columnIndex: number, placement: CaretPlacement, attempts = 8) {
  if (attempts <= 0 || focusCell(table, rowIndex, columnIndex, placement)) return;
  const retry = () => focusCellWhenReady(table, rowIndex, columnIndex, placement, attempts - 1);
  requestAnimationFrame(retry);
  globalThis.setTimeout(retry, 0);
}

function placeCaret(target: HTMLElement, placement: CaretPlacement) {
  const selection = globalThis.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(placement !== "end");
  selection.removeAllRanges();
  selection.addRange(range);
}

function isCaretAtStart(cell: HTMLElement): boolean {
  const selection = globalThis.getSelection();
  if (!selection?.rangeCount) return true;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;
  const testRange = document.createRange();
  testRange.setStart(cell, 0);
  testRange.setEnd(range.startContainer, range.startOffset);
  return testRange.toString().length === 0;
}

function isCaretAtEnd(cell: HTMLElement): boolean {
  const selection = globalThis.getSelection();
  if (!selection?.rangeCount) return true;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;
  const testRange = document.createRange();
  testRange.setStart(range.endContainer, range.endOffset);
  testRange.setEnd(cell, cell.childNodes.length);
  return testRange.toString().length === 0;
}

function focusTableBlockShell(root: HTMLElement | null) {
  const shell = root?.closest<HTMLElement>("[data-table-block-shell]") ?? root?.closest<HTMLElement>("article") ?? root;
  if (!shell) return;
  if (!shell.hasAttribute("tabindex")) shell.setAttribute("tabindex", "-1");
  shell.focus();
}

function exitTable(root: HTMLElement | null, direction: "up" | "down") {
  const block = root?.closest<HTMLElement>("[data-block-id]");
  if (!block) return;
  const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-block-id]"));
  const target = blocks[blocks.indexOf(block) + (direction === "up" ? -1 : 1)];
  if (target?.dataset.blockId) focusEditableBlock(target.dataset.blockId, direction === "up" ? "end" : "start");
}

function createCellCommitHandlers(rowCount: number, columnCount: number, schedule: ScheduleCellCommit): CellCommit[][] {
  return Array.from({ length: rowCount }, (_, rowIndex) => createRowCommitHandlers(rowIndex, columnCount, schedule));
}

function createRowCommitHandlers(rowIndex: number, columnCount: number, schedule: ScheduleCellCommit): CellCommit[] {
  return Array.from({ length: columnCount }, (_, columnIndex) => (value, flush) => schedule(rowIndex, columnIndex, value, flush));
}

function createColumnStyles(columnCount: number, config: TableBlockConfig): React.CSSProperties[] {
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const width = config.columnWidths?.[columnIndex];
    return { minWidth: config.minColumnWidth, width: `var(--osio-table-col-${columnIndex}-width, ${toCssSize(width)})`, maxWidth: config.wrap ? config.maxColumnWidth : undefined };
  });
}

function toCssSize(value: number | undefined): string { return value == null ? "auto" : `${value}px`; }

function startPointerDrag(cursor: string, move: (event: PointerEvent) => void, up: () => void) {
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";
  globalThis.addEventListener("pointermove", move);
  globalThis.addEventListener("pointerup", up, { once: true });
}

function stopPointerDrag(move: (event: PointerEvent) => void, up: () => void) {
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  globalThis.removeEventListener("pointermove", move);
  globalThis.removeEventListener("pointerup", up);
}

function updateTableCellValue(data: string[][], rowIndex: number, columnIndex: number, value: string): string[][] {
  return data.map((row, currentRowIndex) => currentRowIndex === rowIndex ? row.map((cell, currentColumnIndex) => currentColumnIndex === columnIndex ? value : cell) : row);
}

function tableDataEqual(left: string[][], right: string[][]): boolean {
  return left.length === right.length && left.every((row, rowIndex) => row.length === right[rowIndex].length && row.every((cell, columnIndex) => cell === right[rowIndex][columnIndex]));
}

function getColumnKey(columnIndex: number): string { return `col-${columnIndex}`; }
function getCellKey(rowIndex: number, columnIndex: number): string { return `cell-${rowIndex}-${columnIndex}`; }
function getRowKey(rowIndex: number): string { return `row-${rowIndex}`; }

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