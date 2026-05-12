import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  PanelTop,
  Plus,
  RotateCcw,
  Settings2,
} from "lucide-react";

import type { Block, TableBlockConfig, TableBlockPadding, TableBlockTextAlign } from "@/entities/block";
import {
  addTableColumn,
  addTableRow,
  clampTableColumnWidth,
  clampTableRowHeight,
  getTableAlignmentClassName,
  getTableColumnCount,
  getTablePaddingClassName,
  insertConfigColumn,
  insertConfigRow,
  normalizeTableData,
  removeConfigColumn,
  removeTableColumn,
  removeConfigRow,
  removeTableRow,
  resolveTableConfig,
} from "@/entities/block/model/tableBlocks";
import { usePageStore } from "@/store/usePageStore";

interface TableBlockEditorProps {
  block: Block;
  pageId: string;
  style?: React.CSSProperties;
  textStyle?: React.CSSProperties;
  onDeleteTable?: () => void;
}

interface CellMenuState {
  x: number;
  y: number;
  rowIndex: number;
  columnIndex: number;
}

const TABLE_CONTEXT_MENU_WIDTH = 200;
const TABLE_CONTEXT_MENU_HEIGHT = 216;
const SETTINGS_PANEL_WIDTH = 292;
const MAX_AUTO_COLUMN_WIDTH = 420;
const CELL_COMMIT_DELAY_MS = 220;
const INSERT_DRAG_THRESHOLD_PX = 8;
const ROW_ESTIMATE_HEIGHT = 42;
const ROW_VIRTUALIZATION_THRESHOLD = 80;

export const TableBlockEditor: React.FC<TableBlockEditorProps> = ({
  block,
  pageId,
  style,
  textStyle,
  onDeleteTable,
}) => {
  const updateBlock = usePageStore((state) => state.updateBlock);
  const [contextMenu, setContextMenu] = useState<CellMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cellCommitTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const hasPendingCellCommitRef = useRef(false);

  const blockData = useMemo(() => normalizeTableData(block.tableData), [block.tableData]);
  const [draftData, setDraftData] = useState(blockData);
  const latestDraftDataRef = useRef(draftData);
  const data = draftData;
  const deferredData = useDeferredValue(data);
  const columnCount = getTableColumnCount(data);
  const resolvedBlockConfig = useMemo(
    () => resolveTableConfig({ tableConfig: block.tableConfig }, columnCount, data.length),
    [block.tableConfig, columnCount, data.length],
  );
  const [draftConfig, setDraftConfig] = useState(resolvedBlockConfig);
  const config = draftConfig;
  const shouldVirtualizeRows = data.length > ROW_VIRTUALIZATION_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    enabled: shouldVirtualizeRows,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => config.rowHeights?.[index] ?? ROW_ESTIMATE_HEIGHT,
    overscan: 8,
  });
  const virtualRows = shouldVirtualizeRows ? rowVirtualizer.getVirtualItems() : null;

  useEffect(() => {
    latestDraftDataRef.current = draftData;
  }, [draftData]);

  useEffect(() => {
    if (!hasPendingCellCommitRef.current && !tableDataEqual(blockData, latestDraftDataRef.current)) {
      setDraftData(blockData);
    }
  }, [blockData]);

  useEffect(() => {
    setDraftConfig(resolvedBlockConfig);
  }, [resolvedBlockConfig]);

  const updateTable = useCallback(
    (updates: Partial<Block>) => {
      updateBlock(pageId, block.id, updates);
    },
    [block.id, pageId, updateBlock],
  );

  const scheduleTableDataCommit = useCallback(
    (nextData: string[][]) => {
      latestDraftDataRef.current = nextData;
      hasPendingCellCommitRef.current = true;
      if (cellCommitTimerRef.current !== null) {
        globalThis.clearTimeout(cellCommitTimerRef.current);
      }
      cellCommitTimerRef.current = globalThis.setTimeout(() => {
        cellCommitTimerRef.current = null;
        hasPendingCellCommitRef.current = false;
        updateTable({ tableData: latestDraftDataRef.current });
      }, CELL_COMMIT_DELAY_MS);
    },
    [updateTable],
  );

  useEffect(() => () => {
    if (cellCommitTimerRef.current !== null) {
      globalThis.clearTimeout(cellCommitTimerRef.current);
      cellCommitTimerRef.current = null;
    }
    if (hasPendingCellCommitRef.current) {
      updateTable({ tableData: latestDraftDataRef.current });
    }
  }, [updateTable]);

  useEffect(() => {
    inputRefs.current.forEach((node) => resizeTextarea(node));
  }, [config.wrap, config.cellPadding]);

  const updateConfig = useCallback(
    (patch: TableBlockConfig) => {
      const nextConfig = { ...config, ...patch };
      setDraftConfig(nextConfig);
      updateTable({ tableConfig: nextConfig });
    },
    [config, updateTable],
  );

  const focusCell = useCallback((rowIndex: number, columnIndex: number) => {
    requestAnimationFrame(() => {
      inputRefs.current.get(cellKey(rowIndex, columnIndex))?.focus();
    });
  }, []);

  const handleCellChange = useCallback(
    (rowIndex: number, columnIndex: number, value: string) => {
      setDraftData((currentData) => {
        const nextData = updateTableCellValue(currentData, rowIndex, columnIndex, value);
        scheduleTableDataCommit(nextData);
        return nextData;
      });
    },
    [scheduleTableDataCommit],
  );

  const handleAddRow = useCallback(
    (afterRow?: number) => {
      const insertAfter = afterRow ?? data.length - 1;
      const nextData = addTableRow(data, insertAfter);
      const nextConfig = insertConfigRow(config, insertAfter);
      setDraftData(nextData);
      setDraftConfig(nextConfig);
      updateTable({ tableData: nextData, tableConfig: nextConfig });
      focusCell(insertAfter + 1, 0);
    },
    [config, data, focusCell, updateTable],
  );

  const handleAddColumn = useCallback(
    (afterColumn?: number) => {
      const insertAfter = afterColumn ?? columnCount - 1;
      const nextData = addTableColumn(data, insertAfter);
      const nextConfig = insertConfigColumn(config, insertAfter);
      setDraftData(nextData);
      setDraftConfig(nextConfig);
      updateTable({
        tableData: nextData,
        tableConfig: nextConfig,
      });
      focusCell(0, insertAfter + 1);
    },
    [columnCount, config, data, focusCell, updateTable],
  );

  const handleRemoveRow = useCallback(
    (rowIndex: number) => {
      const nextData = removeTableRow(data, rowIndex);
      const nextConfig = removeConfigRow(config, rowIndex);
      setDraftData(nextData);
      setDraftConfig(nextConfig);
      updateTable({ tableData: nextData, tableConfig: nextConfig });
    },
    [config, data, updateTable],
  );

  const handleRemoveColumn = useCallback(
    (columnIndex: number) => {
      const nextData = removeTableColumn(data, columnIndex);
      const nextConfig = removeConfigColumn(config, columnIndex);
      setDraftData(nextData);
      setDraftConfig(nextConfig);
      updateTable({
        tableData: nextData,
        tableConfig: nextConfig,
      });
    },
    [config, data, updateTable],
  );

  const resetColumnWidths = useCallback(() => {
    updateConfig({ columnWidths: undefined, layoutMode: "auto" });
  }, [updateConfig]);

  const updateColumnAlignment = useCallback(
    (columnIndex: number, alignment: TableBlockTextAlign) => {
      const alignments = Array.from({ length: columnCount }, (_, index) =>
        config.columnAlignments?.[index] ?? null,
      );
      alignments[columnIndex] = alignment;
      updateConfig({ columnAlignments: alignments });
    },
    [columnCount, config.columnAlignments, updateConfig],
  );

  const commitResizedConfig = useCallback(
    (nextConfig: TableBlockConfig) => {
      setDraftConfig(nextConfig);
      updateTable({ tableConfig: nextConfig });
    },
    [updateTable],
  );

  const startColumnResize = useCallback(
    (event: React.PointerEvent, columnIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth = config.columnWidths?.[columnIndex]
        ?? inferColumnWidth(data, columnIndex, config.minColumnWidth, config.maxColumnWidth);
      let latestWidth = startWidth;
      let animationFrame = 0;

      const nextConfigWithWidth = () => {
        const widths = Array.from({ length: columnCount }, (_, index) =>
          config.columnWidths?.[index],
        );
        widths[columnIndex] = latestWidth;
        return {
          ...config,
          layoutMode: "fixed",
          columnWidths: widths,
        } satisfies TableBlockConfig;
      };

      const handleMove = (moveEvent: PointerEvent) => {
        latestWidth = clampTableColumnWidth(startWidth + moveEvent.clientX - startX, startWidth);
        if (!animationFrame) {
          animationFrame = requestAnimationFrame(() => {
            animationFrame = 0;
            setDraftConfig(nextConfigWithWidth());
          });
        }
      };

      const handleUp = () => {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        commitResizedConfig(nextConfigWithWidth());
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        globalThis.removeEventListener("pointermove", handleMove);
        globalThis.removeEventListener("pointerup", handleUp);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      globalThis.addEventListener("pointermove", handleMove);
      globalThis.addEventListener("pointerup", handleUp, { once: true });
    },
    [columnCount, commitResizedConfig, config, data],
  );

  const startRowResize = useCallback(
    (event: React.PointerEvent, rowIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      const startY = event.clientY;
      const startHeight = config.rowHeights?.[rowIndex]
        ?? Math.max(event.currentTarget.closest("tr")?.getBoundingClientRect().height ?? ROW_ESTIMATE_HEIGHT, ROW_ESTIMATE_HEIGHT);
      let latestHeight = startHeight;
      let animationFrame = 0;

      const nextConfigWithHeight = () => {
        const heights = Array.from({ length: data.length }, (_, index) => config.rowHeights?.[index]);
        heights[rowIndex] = latestHeight;
        return {
          ...config,
          rowHeights: heights,
        } satisfies TableBlockConfig;
      };

      const handleMove = (moveEvent: PointerEvent) => {
        latestHeight = clampTableRowHeight(startHeight + moveEvent.clientY - startY, startHeight);
        if (!animationFrame) {
          animationFrame = requestAnimationFrame(() => {
            animationFrame = 0;
            setDraftConfig(nextConfigWithHeight());
          });
        }
      };

      const handleUp = () => {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        commitResizedConfig(nextConfigWithHeight());
        rowVirtualizer.measure();
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        globalThis.removeEventListener("pointermove", handleMove);
        globalThis.removeEventListener("pointerup", handleUp);
      };

      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      globalThis.addEventListener("pointermove", handleMove);
      globalThis.addEventListener("pointerup", handleUp, { once: true });
    },
    [commitResizedConfig, config, data.length, rowVirtualizer],
  );

  const startColumnInsertDrag = useCallback(
    (event: React.PointerEvent, columnIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      let shouldInsert = false;

      const handleMove = (moveEvent: PointerEvent) => {
        shouldInsert = Math.abs(moveEvent.clientX - startX) >= INSERT_DRAG_THRESHOLD_PX;
      };

      const handleUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        globalThis.removeEventListener("pointermove", handleMove);
        globalThis.removeEventListener("pointerup", handleUp);
        if (shouldInsert) handleAddColumn(columnIndex);
      };

      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      globalThis.addEventListener("pointermove", handleMove);
      globalThis.addEventListener("pointerup", handleUp, { once: true });
    },
    [handleAddColumn],
  );

  const startRowInsertDrag = useCallback(
    (event: React.PointerEvent, rowIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      const startY = event.clientY;
      let shouldInsert = false;

      const handleMove = (moveEvent: PointerEvent) => {
        shouldInsert = Math.abs(moveEvent.clientY - startY) >= INSERT_DRAG_THRESHOLD_PX;
      };

      const handleUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        globalThis.removeEventListener("pointermove", handleMove);
        globalThis.removeEventListener("pointerup", handleUp);
        if (shouldInsert) handleAddRow(rowIndex);
      };

      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      globalThis.addEventListener("pointermove", handleMove);
      globalThis.addEventListener("pointerup", handleUp, { once: true });
    },
    [handleAddRow],
  );

  const openContextMenu = useCallback(
    (event: React.MouseEvent, rowIndex: number, columnIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY, rowIndex, columnIndex });
    },
    [],
  );

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setContextMenu(null);
      }
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setSettingsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const contextMenuStyle = useMemo<React.CSSProperties>(() => {
    if (!contextMenu) return {};
    return getViewportMenuStyle(
      contextMenu.x,
      contextMenu.y,
      TABLE_CONTEXT_MENU_WIDTH,
      TABLE_CONTEXT_MENU_HEIGHT,
    );
  }, [contextMenu]);

  const columnStyles = useMemo(
    () => Array.from({ length: columnCount }, (_, columnIndex) => {
      const explicitWidth = config.columnWidths?.[columnIndex];
      const inferredWidth = config.layoutMode === "auto"
        ? inferColumnWidth(deferredData, columnIndex, config.minColumnWidth, config.maxColumnWidth)
        : undefined;
      const width = explicitWidth ?? inferredWidth;

      return {
        minWidth: config.minColumnWidth,
        width,
        maxWidth: config.wrap ? config.maxColumnWidth ?? MAX_AUTO_COLUMN_WIDTH : undefined,
      } satisfies React.CSSProperties;
    }),
    [columnCount, config, deferredData],
  );

  const visibleRows = useMemo(
    () => virtualRows
      ? virtualRows.map((virtualRow) => ({ key: virtualRow.key, rowIndex: virtualRow.index, row: data[virtualRow.index] }))
      : data.map((row, rowIndex) => ({ key: rowIndex, rowIndex, row })),
    [data, virtualRows],
  );
  const topVirtualPadding = virtualRows?.[0]?.start ?? 0;
  const lastVirtualRow = virtualRows?.[virtualRows.length - 1];
  const bottomVirtualPadding = lastVirtualRow
    ? Math.max(0, rowVirtualizer.getTotalSize() - lastVirtualRow.end)
    : 0;
  const scrollRegionClassName = [
    "osio-scrollbar-hidden overflow-x-auto rounded-lg",
    shouldVirtualizeRows ? "max-h-[70vh] overflow-y-auto" : "overflow-y-hidden",
  ].join(" ");

  const tableClassName = [
    "text-sm",
    config.layoutMode === "fit" ? "min-w-full w-full" : "min-w-full w-max",
    config.layoutMode === "fixed" ? "table-fixed" : "table-auto",
  ].join(" ");

  return (
    <div
      className="group/table relative my-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]"
      style={style}
    >
      <div className="absolute right-2 top-2 z-[var(--osio-z-raised)] opacity-0 transition-opacity group-hover/table:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          aria-label="Table settings"
          onClick={() => setSettingsOpen((open) => !open)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)] shadow-sm hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)]"
        >
          <Settings2 size={15} />
        </button>
      </div>

      <div ref={scrollRef} className={scrollRegionClassName}>
        <table className={tableClassName} style={{ tableLayout: config.layoutMode === "fixed" ? "fixed" : "auto" }}>
          <colgroup>
            {columnStyles.map((columnStyle, columnIndex) => (
              <col
                key={`col-${columnIndex}`} // NOSONAR - table columns are position-based in tableData
                style={columnStyle}
              />
            ))}
          </colgroup>
          <tbody>
            {topVirtualPadding > 0 ? <VirtualSpacer height={topVirtualPadding} columnCount={columnCount} /> : null}
            {visibleRows.map(({ key, row, rowIndex }) => (
              <TableDataRow
                key={key}
                row={row}
                rowIndex={rowIndex}
                columnCount={columnCount}
                config={config}
                textStyle={textStyle}
                inputRefs={inputRefs.current}
                onCellChange={handleCellChange}
                onContextMenu={openContextMenu}
                onColumnResize={startColumnResize}
                onRowResize={startRowResize}
                onColumnInsertDrag={startColumnInsertDrag}
                onRowInsertDrag={startRowInsertDrag}
              />
            ))}
            {bottomVirtualPadding > 0 ? <VirtualSpacer height={bottomVirtualPadding} columnCount={columnCount} /> : null}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => handleAddColumn()}
        aria-label="Add column"
        className="absolute -right-3 top-1/2 z-[var(--osio-z-raised)] flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)] group-hover/table:opacity-100"
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        onClick={() => handleAddRow()}
        aria-label="Add row"
        className="absolute -bottom-3 left-1/2 z-[var(--osio-z-raised)] flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)] group-hover/table:opacity-100"
      >
        <Plus size={14} />
      </button>

      {settingsOpen && (
        <TableSettingsPanel
          ref={settingsRef}
          config={config}
          onChange={updateConfig}
          onResetColumnWidths={resetColumnWidths}
        />
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[var(--osio-z-popover)] min-w-[200px] rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1 shadow-lg"
          style={contextMenuStyle}
        >
          <TableMenuButton onClick={() => {
            handleAddRow(contextMenu.rowIndex);
            setContextMenu(null);
          }}>
            Insert row below
          </TableMenuButton>
          <TableMenuButton onClick={() => {
            handleAddColumn(contextMenu.columnIndex);
            setContextMenu(null);
          }}>
            Insert column right
          </TableMenuButton>
          <div className="my-1 border-t border-[var(--osio-border-default)]" />
          <div className="px-2 py-1">
            <div className="mb-1 text-xs font-medium text-[var(--osio-fg-muted)]">Align column</div>
            <div className="flex gap-1">
              <AlignmentButton alignment="left" current={config.columnAlignments?.[contextMenu.columnIndex] ?? null} onClick={() => updateColumnAlignment(contextMenu.columnIndex, "left")} />
              <AlignmentButton alignment="center" current={config.columnAlignments?.[contextMenu.columnIndex] ?? null} onClick={() => updateColumnAlignment(contextMenu.columnIndex, "center")} />
              <AlignmentButton alignment="right" current={config.columnAlignments?.[contextMenu.columnIndex] ?? null} onClick={() => updateColumnAlignment(contextMenu.columnIndex, "right")} />
            </div>
          </div>
          <div className="my-1 border-t border-[var(--osio-border-default)]" />
          <TableMenuButton disabled={data.length <= 1} onClick={() => {
            handleRemoveRow(contextMenu.rowIndex);
            setContextMenu(null);
          }}>
            Delete row
          </TableMenuButton>
          <TableMenuButton disabled={columnCount <= 1} onClick={() => {
            handleRemoveColumn(contextMenu.columnIndex);
            setContextMenu(null);
          }}>
            Delete column
          </TableMenuButton>
          <div className="my-1 border-t border-[var(--osio-border-default)]" />
          <TableMenuButton danger disabled={!onDeleteTable} onClick={() => {
            onDeleteTable?.();
            setContextMenu(null);
          }}>
            Delete table
          </TableMenuButton>
        </div>
      )}
    </div>
  );
};

function VirtualSpacer({ height, columnCount }: Readonly<{ height: number; columnCount: number }>) {
  return (
    <tr>
      <td colSpan={columnCount} style={{ height, padding: 0, border: 0 }} />
    </tr>
  );
}

function updateTableCellValue(
  data: string[][],
  rowIndex: number,
  columnIndex: number,
  value: string,
): string[][] {
  return data.map((row, currentRowIndex) => {
    if (currentRowIndex !== rowIndex) return row;
    return row.map((cell, currentColumnIndex) => currentColumnIndex === columnIndex ? value : cell);
  });
}

function tableDataEqual(left: string[][], right: string[][]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((row, rowIndex) => {
    const otherRow = right[rowIndex];
    return row.length === otherRow.length && row.every((cell, columnIndex) => cell === otherRow[columnIndex]);
  });
}

interface TableDataRowProps {
  row: string[];
  rowIndex: number;
  columnCount: number;
  config: TableBlockConfig;
  textStyle?: React.CSSProperties;
  inputRefs: Map<string, HTMLTextAreaElement>;
  onCellChange: (rowIndex: number, columnIndex: number, value: string) => void;
  onContextMenu: (event: React.MouseEvent, rowIndex: number, columnIndex: number) => void;
  onColumnResize: (event: React.PointerEvent, columnIndex: number) => void;
  onRowResize: (event: React.PointerEvent, rowIndex: number) => void;
  onColumnInsertDrag: (event: React.PointerEvent, columnIndex: number) => void;
  onRowInsertDrag: (event: React.PointerEvent, rowIndex: number) => void;
}

const TableDataRow = React.memo(function TableDataRow({
  row,
  rowIndex,
  columnCount,
  config,
  textStyle,
  inputRefs,
  onCellChange,
  onContextMenu,
  onColumnResize,
  onRowResize,
  onColumnInsertDrag,
  onRowInsertDrag,
}: Readonly<TableDataRowProps>) {
  const rowHeight = config.rowHeights?.[rowIndex];
  return (
    <tr
      className={getRowClassName(rowIndex, config)}
      style={rowHeight ? { height: rowHeight } : undefined}
    >
      {Array.from({ length: columnCount }, (_, columnIndex) => (
        <TableCell
          key={`cell-${rowIndex}-${columnIndex}`}
          cell={row[columnIndex] ?? ""}
          rowIndex={rowIndex}
          columnIndex={columnIndex}
          config={config}
          rowHeight={rowHeight}
          textStyle={textStyle}
          inputRefs={inputRefs}
          isFirstRow={rowIndex === 0}
          isFirstColumn={columnIndex === 0}
          onCellChange={onCellChange}
          onContextMenu={onContextMenu}
          onColumnResize={onColumnResize}
          onRowResize={onRowResize}
          onColumnInsertDrag={onColumnInsertDrag}
          onRowInsertDrag={onRowInsertDrag}
        />
      ))}
    </tr>
  );
});

interface TableCellProps {
  cell: string;
  rowIndex: number;
  columnIndex: number;
  config: TableBlockConfig;
  rowHeight?: number;
  textStyle?: React.CSSProperties;
  inputRefs: Map<string, HTMLTextAreaElement>;
  isFirstRow: boolean;
  isFirstColumn: boolean;
  onCellChange: (rowIndex: number, columnIndex: number, value: string) => void;
  onContextMenu: (event: React.MouseEvent, rowIndex: number, columnIndex: number) => void;
  onColumnResize: (event: React.PointerEvent, columnIndex: number) => void;
  onRowResize: (event: React.PointerEvent, rowIndex: number) => void;
  onColumnInsertDrag: (event: React.PointerEvent, columnIndex: number) => void;
  onRowInsertDrag: (event: React.PointerEvent, rowIndex: number) => void;
}

const TableCell = React.memo(function TableCell({
  cell,
  rowIndex,
  columnIndex,
  config,
  rowHeight,
  textStyle,
  inputRefs,
  isFirstRow,
  isFirstColumn,
  onCellChange,
  onContextMenu,
  onColumnResize,
  onRowResize,
  onColumnInsertDrag,
  onRowInsertDrag,
}: Readonly<TableCellProps>) {
  const alignment = config.columnAlignments?.[columnIndex] ?? null;
  const inputStyle = rowHeight
    ? { ...textStyle, minHeight: Math.max(32, rowHeight - 2) }
    : textStyle;

  return (
    <td
      className={getCellClassName(config, alignment, rowIndex, columnIndex)}
      style={textStyle}
      onContextMenu={(event) => onContextMenu(event, rowIndex, columnIndex)}
    >
      <textarea
        ref={(node) => setInputRef(inputRefs, rowIndex, columnIndex, node)}
        value={cell}
        rows={1}
        wrap={config.wrap === false ? "off" : "soft"}
        onChange={(event) => {
          onCellChange(rowIndex, columnIndex, event.target.value);
          resizeTextarea(event.currentTarget);
        }}
        className={getInputClassName(config)}
        style={inputStyle}
      />

      {isFirstRow ? (
        <BorderDragHandle
          orientation="column-insert"
          label={`Drag to insert column after ${columnIndex + 1}`}
          onPointerDown={(event) => onColumnInsertDrag(event, columnIndex)}
        />
      ) : null}
      {isFirstColumn ? (
        <BorderDragHandle
          orientation="row-insert"
          label={`Drag to insert row after ${rowIndex + 1}`}
          onPointerDown={(event) => onRowInsertDrag(event, rowIndex)}
        />
      ) : null}
      <BorderDragHandle
        orientation="column-resize"
        label={`Resize column ${columnIndex + 1}`}
        onPointerDown={(event) => onColumnResize(event, columnIndex)}
      />
      <BorderDragHandle
        orientation="row-resize"
        label={`Resize row ${rowIndex + 1}`}
        onPointerDown={(event) => onRowResize(event, rowIndex)}
      />
    </td>
  );
});

function BorderDragHandle({
  orientation,
  label,
  onPointerDown,
}: Readonly<{
  orientation: "column-insert" | "row-insert" | "column-resize" | "row-resize";
  label: string;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}>) {
  const className = {
    "column-insert": "absolute -right-6 top-1/2 z-[var(--osio-z-popover)] flex h-5 w-5 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)] opacity-0 shadow-sm transition-opacity hover:text-[var(--osio-fg-default)] group-hover/table:opacity-100 active:cursor-grabbing",
    "row-insert": "absolute -bottom-6 left-1/2 z-[var(--osio-z-popover)] flex h-5 w-5 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)] opacity-0 shadow-sm transition-opacity hover:text-[var(--osio-fg-default)] group-hover/table:opacity-100 active:cursor-grabbing",
    "column-resize": "absolute right-0 top-0 z-[var(--osio-z-raised)] flex h-full w-2 cursor-col-resize items-center justify-center opacity-0 transition-colors hover:bg-[var(--osio-accent)]/30 group-hover/table:opacity-100",
    "row-resize": "absolute bottom-0 left-0 z-[var(--osio-z-raised)] flex h-2 w-full cursor-row-resize items-center justify-center opacity-0 transition-colors hover:bg-[var(--osio-accent)]/30 group-hover/table:opacity-100",
  }[orientation];

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-table-handle
      data-table-insert-handle={orientation.endsWith("insert") ? "true" : undefined}
      data-table-resize-handle={orientation.endsWith("resize") ? "true" : undefined}
      onPointerDown={onPointerDown}
      className={className}
    >
      <GrabHandleIcon orientation={orientation} />
    </button>
  );
}

function GrabHandleIcon({ orientation }: Readonly<{ orientation: "column-insert" | "row-insert" | "column-resize" | "row-resize" }>) {
  const vertical = orientation.startsWith("column");
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      {vertical ? (
        <>
          <circle cx="4" cy="3" r="1" />
          <circle cx="8" cy="3" r="1" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="8" cy="6" r="1" />
          <circle cx="4" cy="9" r="1" />
          <circle cx="8" cy="9" r="1" />
        </>
      ) : (
        <>
          <circle cx="3" cy="4" r="1" />
          <circle cx="6" cy="4" r="1" />
          <circle cx="9" cy="4" r="1" />
          <circle cx="3" cy="8" r="1" />
          <circle cx="6" cy="8" r="1" />
          <circle cx="9" cy="8" r="1" />
        </>
      )}
    </svg>
  );
}

const TableSettingsPanel = React.forwardRef<HTMLDivElement, {
  config: TableBlockConfig;
  onChange: (patch: TableBlockConfig) => void;
  onResetColumnWidths: () => void;
}>(({ config, onChange, onResetColumnWidths }, ref) => (
  <div
    ref={ref}
    className="absolute right-0 top-10 z-[var(--osio-z-popover)] rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3 text-sm text-[var(--osio-fg-default)] shadow-xl"
    style={{ width: SETTINGS_PANEL_WIDTH }}
  >
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="font-medium">Table</div>
      <button
        type="button"
        onClick={onResetColumnWidths}
        className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)]"
      >
        <RotateCcw size={13} />
        Reset widths
      </button>
    </div>

    <SettingsRow label="Layout">
      <SegmentedControl
        value={config.layoutMode ?? "auto"}
        options={["auto", "fit", "fixed"]}
        onChange={(layoutMode) => onChange({ layoutMode })}
      />
    </SettingsRow>

    <SettingsRow label="Padding">
      <SegmentedControl<TableBlockPadding>
        value={config.cellPadding ?? "normal"}
        options={["compact", "normal", "comfortable"]}
        onChange={(cellPadding) => onChange({ cellPadding })}
      />
    </SettingsRow>

    <label className="mb-3 flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-[var(--osio-fg-muted)]">Minimum width</span>
      <input
        type="number"
        min={56}
        max={640}
        value={config.minColumnWidth ?? 96}
        onChange={(event) => onChange({ minColumnWidth: clampTableColumnWidth(event.target.value, 96) })}
        className="h-8 w-24 rounded-md border border-[var(--osio-border-default)] bg-transparent px-2 text-right outline-none focus:ring-1 focus:ring-[var(--osio-accent)]"
      />
    </label>

    <div className="space-y-2">
      <ToggleRow label="Wrap text" checked={config.wrap !== false} onChange={(wrap) => onChange({ wrap })} />
      <ToggleRow label="Header row" checked={config.headerRow !== false} onChange={(headerRow) => onChange({ headerRow })} icon={<PanelTop size={14} />} />
      <ToggleRow label="Borders" checked={config.showBorders !== false} onChange={(showBorders) => onChange({ showBorders })} />
      <ToggleRow label="Striped rows" checked={config.stripedRows === true} onChange={(stripedRows) => onChange({ stripedRows })} />
    </div>
  </div>
));

TableSettingsPanel.displayName = "TableSettingsPanel";

function TableMenuButton({
  children,
  danger = false,
  disabled = false,
  onClick,
}: Readonly<{
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--osio-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-40",
        danger ? "text-[var(--osio-danger)]" : "text-[var(--osio-fg-default)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SettingsRow<T extends string>({
  label,
  children,
}: Readonly<{
  label: string;
  children: React.ReactNode;
}>) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-xs font-medium text-[var(--osio-fg-muted)]">{label}</div>
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: Readonly<{
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}>) {
  return (
    <div className="grid gap-1 rounded-md bg-[var(--osio-bg-subtle)] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={[
            "rounded px-2 py-1 text-xs capitalize transition-colors",
            value === option
              ? "bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] shadow-sm"
              : "text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]",
          ].join(" ")}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  icon,
  onChange,
}: Readonly<{
  label: string;
  checked: boolean;
  icon?: React.ReactNode;
  onChange: (checked: boolean) => void;
}>) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md px-1 py-1 hover:bg-[var(--osio-bg-subtle)]">
      <span className="flex items-center gap-2 text-sm">
        {icon}
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--osio-accent)]"
      />
    </label>
  );
}

function AlignmentButton({
  alignment,
  current,
  onClick,
}: Readonly<{
  alignment: Exclude<TableBlockTextAlign, null>;
  current: TableBlockTextAlign;
  onClick: () => void;
}>) {
  let Icon = AlignLeft;
  if (alignment === "center") Icon = AlignCenter;
  if (alignment === "right") Icon = AlignRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Align ${alignment}`}
      className={[
        "flex h-7 w-8 items-center justify-center rounded-md border border-[var(--osio-border-default)] hover:bg-[var(--osio-bg-subtle)]",
        current === alignment ? "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)]",
      ].join(" ")}
    >
      <Icon size={14} />
    </button>
  );
}

function getRowClassName(rowIndex: number, config: TableBlockConfig): string {
  const classes = [];
  if (config.headerRow !== false && rowIndex === 0) classes.push("bg-[var(--osio-bg-subtle)] font-medium");
  if (config.stripedRows && rowIndex > 0 && rowIndex % 2 === 0) classes.push("bg-[var(--osio-bg-muted)]/40");
  return classes.join(" ");
}

function getCellClassName(
  config: TableBlockConfig,
  alignment: TableBlockTextAlign,
  rowIndex: number,
  columnIndex: number,
): string {
  return [
    "relative px-0 py-0 text-[var(--osio-fg-default)] align-top",
    getTableAlignmentClassName(alignment),
    config.showBorders === false ? "" : "border-b border-r border-[var(--osio-border-default)] last:border-r-0",
    config.headerColumn && columnIndex === 0 ? "font-medium bg-[var(--osio-bg-subtle)]" : "",
    config.headerRow !== false && rowIndex === 0 ? "font-medium" : "",
  ].filter(Boolean).join(" ");
}

function getInputClassName(config: TableBlockConfig): string {
  return [
    "block min-h-8 w-full resize-none overflow-hidden bg-transparent outline-none focus:bg-[var(--osio-bg-hover)]",
    getTablePaddingClassName(config.cellPadding),
    config.wrap === false ? "whitespace-pre" : "whitespace-pre-wrap break-words",
  ].join(" ");
}

function inferColumnWidth(
  data: string[][],
  columnIndex: number,
  minColumnWidth = 96,
  maxColumnWidth?: number,
): number {
  const longestContent = data.reduce((longest, row) => {
    const value = row[columnIndex] ?? "";
    return Math.max(longest, value.length);
  }, 0);
  const estimatedWidth = Math.max(minColumnWidth, Math.min(MAX_AUTO_COLUMN_WIDTH, longestContent * 8 + 48));
  return maxColumnWidth ? Math.min(estimatedWidth, maxColumnWidth) : estimatedWidth;
}

function getViewportMenuStyle(x: number, y: number, width: number, height: number): React.CSSProperties {
  const viewportWidth = globalThis.innerWidth;
  const viewportHeight = globalThis.innerHeight;
  const left = Math.max(8, Math.min(x, viewportWidth - width - 8));
  const belowTop = y;
  const aboveTop = y - height;
  const top = belowTop + height > viewportHeight - 8 && aboveTop > 8
    ? aboveTop
    : Math.max(8, Math.min(belowTop, viewportHeight - height - 8));
  return { left, top };
}

function setInputRef(
  refs: Map<string, HTMLTextAreaElement>,
  rowIndex: number,
  columnIndex: number,
  node: HTMLTextAreaElement | null,
) {
  const key = cellKey(rowIndex, columnIndex);
  if (node) {
    refs.set(key, node);
    resizeTextarea(node);
    return;
  }

  refs.delete(key);
}

function cellKey(rowIndex: number, columnIndex: number): string {
  return `${rowIndex}:${columnIndex}`;
}

function resizeTextarea(node: HTMLTextAreaElement) {
  node.style.height = "auto";
  node.style.height = `${node.scrollHeight}px`;
}
