/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout.helpers.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";

import {
  CELL_MIN_ROW_HEIGHT,
  DEFAULT_LAYOUT_CONFIG,
  LAYOUT_CELL_ROW_SPAN_MAX,
  LAYOUT_CONFIG_LIMITS,
  LAYOUT_EDGE_AUTOSCROLL_MAX_SPEED,
  LAYOUT_EDGE_AUTOSCROLL_ZONE,
} from "./layout.constants";
import type {
  LayoutCell,
  LayoutCellOffset,
  LayoutConfig,
  LayoutDatabasePreview,
  LayoutMeasuredCellHeights,
  LayoutMode,
  LayoutMovePreview,
  LayoutPanelKind,
  LayoutResizeEdge,
  LayoutResizePreview,
} from "./layout.types";

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const nextValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.max(min, Math.min(max, Math.round(nextValue)));
}

export function normalizeGridLine(value: unknown, fallback: number): number {
  const nextValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.max(1, Math.round(nextValue));
}

export function edgeAutoScrollSpeed(pointer: number, start: number, end: number): number {
  if (pointer < start + LAYOUT_EDGE_AUTOSCROLL_ZONE) {
    const pressure = (start + LAYOUT_EDGE_AUTOSCROLL_ZONE - pointer) / LAYOUT_EDGE_AUTOSCROLL_ZONE;
    return -Math.ceil(Math.min(1, pressure) * LAYOUT_EDGE_AUTOSCROLL_MAX_SPEED);
  }
  if (pointer > end - LAYOUT_EDGE_AUTOSCROLL_ZONE) {
    const pressure = (pointer - (end - LAYOUT_EDGE_AUTOSCROLL_ZONE)) / LAYOUT_EDGE_AUTOSCROLL_ZONE;
    return Math.ceil(Math.min(1, pressure) * LAYOUT_EDGE_AUTOSCROLL_MAX_SPEED);
  }
  return 0;
}

export function createLayoutAutoScroller(horizontalContainer: HTMLElement | null) {
  let pointerX = 0;
  let pointerY = 0;
  let frame = 0;
  let active = true;

  const tick = () => {
    frame = 0;
    if (!active) return;

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const windowScrollX = edgeAutoScrollSpeed(pointerX, 0, viewportWidth);
    const windowScrollY = edgeAutoScrollSpeed(pointerY, 0, viewportHeight);
    let scrolled = false;

    if (windowScrollX || windowScrollY) {
      globalThis.scrollBy(windowScrollX, windowScrollY);
      scrolled = true;
    }

    if (horizontalContainer && horizontalContainer.scrollWidth > horizontalContainer.clientWidth) {
      const rect = horizontalContainer.getBoundingClientRect();
      const containerScrollX = edgeAutoScrollSpeed(pointerX, rect.left, rect.right);
      if (containerScrollX) {
        horizontalContainer.scrollLeft += containerScrollX;
        scrolled = true;
      }
    }

    if (scrolled) frame = requestAnimationFrame(tick);
  };

  return {
    update(clientX: number, clientY: number) {
      pointerX = clientX;
      pointerY = clientY;
      if (!frame) frame = requestAnimationFrame(tick);
    },
    stop() {
      active = false;
      if (frame) cancelAnimationFrame(frame);
    },
  };
}

export function captureLayoutPointer(target: HTMLElement, pointerId: number) {
  try {
    target.setPointerCapture?.(pointerId);
  } catch {
    // Synthetic PointerEvents in tests do not always create an active pointer.
  }
}

export function releaseLayoutPointer(target: HTMLElement, pointerId: number) {
  try {
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
  } catch {
    // The pointer may already be released if the browser cancelled the stream.
  }
}

export function normalizeLayoutOffset(value: unknown): LayoutCellOffset | undefined {
  if (!value || typeof value !== "object") return undefined;
  const offset = value as Partial<LayoutCellOffset>;
  const x = typeof offset.x === "number" ? offset.x : Number(offset.x);
  const y = typeof offset.y === "number" ? offset.y : Number(offset.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const nextOffset = { x: Math.round(x), y: Math.round(y) };
  return nextOffset.x === 0 && nextOffset.y === 0 ? undefined : nextOffset;
}

export function layoutCellHasHeavyBlocks(blocks: Block[] | undefined): boolean {
  return Boolean(blocks?.some((nestedBlock) => (
    nestedBlock.type === "database_inline" ||
    nestedBlock.type === "database_full_page" ||
    nestedBlock.type === "graph_view" ||
    nestedBlock.type === "draw" ||
    layoutCellHasHeavyBlocks(nestedBlock.children)
  )));
}

export function layoutCellDatabasePreview(blocks: Block[] | undefined): LayoutDatabasePreview | null {
  if (!blocks) return null;
  for (const nestedBlock of blocks) {
    if (nestedBlock.type === "database_inline" || nestedBlock.type === "database_full_page") {
      return { databaseId: nestedBlock.databaseId, viewId: nestedBlock.viewId };
    }
    const nestedPreview = layoutCellDatabasePreview(nestedBlock.children);
    if (nestedPreview) return nestedPreview;
  }
  return null;
}

export function sanitizeLayoutConfig(config: Partial<LayoutConfig> | undefined): LayoutConfig {
  const legacyConfig = config as (Partial<LayoutConfig> & {
    columnGap?: number;
    rowGap?: number;
    autoReflow?: boolean;
    showGuides?: boolean;
  }) | undefined;
  const merged = legacyConfig
    ? { ...DEFAULT_LAYOUT_CONFIG, ...config }
    : DEFAULT_LAYOUT_CONFIG;
  const legacyGap = legacyConfig?.columnGap ?? legacyConfig?.rowGap;
  const guideVisibility = merged.guideVisibility
    ?? (legacyConfig?.showGuides === false ? "never" : "auto");
  return {
    columns: clampNumber(merged.columns, ...LAYOUT_CONFIG_LIMITS.columns, DEFAULT_LAYOUT_CONFIG.columns),
    rows: clampNumber(merged.rows, ...LAYOUT_CONFIG_LIMITS.rows, DEFAULT_LAYOUT_CONFIG.rows),
    gap: clampNumber(merged.gap ?? legacyGap, ...LAYOUT_CONFIG_LIMITS.gap, DEFAULT_LAYOUT_CONFIG.gap),
    rowHeight: clampNumber(merged.rowHeight, ...LAYOUT_CONFIG_LIMITS.rowHeight, DEFAULT_LAYOUT_CONFIG.rowHeight),
    wrap: Boolean(merged.wrap),
    autoArrange: merged.autoArrange ?? legacyConfig?.autoReflow ?? DEFAULT_LAYOUT_CONFIG.autoArrange,
    snapToGrid: merged.snapToGrid ?? DEFAULT_LAYOUT_CONFIG.snapToGrid,
    guideVisibility: guideVisibility === "always" || guideVisibility === "never" ? guideVisibility : "auto",
    preview: Boolean(merged.preview),
    theme: merged.theme ?? DEFAULT_LAYOUT_CONFIG.theme,
  };
}

export function clampLayoutCell(cell: LayoutCell, config: LayoutConfig): LayoutCell {
  const colSpan = clampNumber(cell.colSpan, 1, config.columns, 1);
  return {
    ...cell,
    colSpan,
    rowSpan: clampNumber(cell.rowSpan, Math.max(1, Math.ceil(CELL_MIN_ROW_HEIGHT / config.rowHeight)), LAYOUT_CELL_ROW_SPAN_MAX, 1),
    colStart: clampNumber(cell.colStart, 1, Math.max(1, config.columns - colSpan + 1), 1),
    rowStart: normalizeGridLine(cell.rowStart, 1),
    offset: normalizeLayoutOffset(cell.offset),
    type: cell.type ?? "text",
    content: typeof cell.content === "string" ? cell.content : "",
    blocks: getLayoutCellBlocks(cell),
    sizing: cell.sizing ?? "fixed",
    horizontalConstraint: cell.horizontalConstraint ?? "stretch",
    verticalConstraint: cell.verticalConstraint ?? "top",
    wrap: cell.wrap !== false,
    padding: cell.padding ?? "comfortable",
    fontSize: cell.fontSize ?? "base",
  };
}

export function layoutCellUsesContentHeight(cell: LayoutCell): boolean {
  return cell.sizing === "auto-height" || cell.sizing === "auto" || cell.sizing === "auto-width";
}

export function rowSpanForRenderedHeight(height: number, config: LayoutConfig): number {
  if (!Number.isFinite(height) || height <= 0) return 1;
  const rowStep = config.rowHeight + config.gap;
  return clampNumber(Math.ceil((height + config.gap) / rowStep), 1, LAYOUT_CELL_ROW_SPAN_MAX, 1);
}

export function collisionRowSpan(cell: LayoutCell, config?: LayoutConfig, measuredHeights?: LayoutMeasuredCellHeights): number {
  if (!config || !measuredHeights || !layoutCellUsesContentHeight(cell)) return cell.rowSpan;
  const measuredHeight = measuredHeights.get(cell.id);
  if (!measuredHeight) return cell.rowSpan;
  return rowSpanForRenderedHeight(measuredHeight, config);
}

export function cellsOverlap(left: LayoutCell, right: LayoutCell, config?: LayoutConfig, measuredHeights?: LayoutMeasuredCellHeights): boolean {
  const leftRowSpan = collisionRowSpan(left, config, measuredHeights);
  const rightRowSpan = collisionRowSpan(right, config, measuredHeights);
  return !(
    left.colStart + left.colSpan <= right.colStart ||
    right.colStart + right.colSpan <= left.colStart ||
    left.rowStart + leftRowSpan <= right.rowStart ||
    right.rowStart + rightRowSpan <= left.rowStart
  );
}

export function findLayoutPlacement(
  placedCells: LayoutCell[],
  config: LayoutConfig,
  colSpan: number,
  rowSpan: number,
  measuredHeights?: LayoutMeasuredCellHeights,
): Pick<LayoutCell, "colStart" | "rowStart"> {
  const safeColSpan = Math.min(config.columns, Math.max(1, colSpan));
  const safeRowSpan = Math.max(1, rowSpan);
  const maxRowsToScan = Math.max(config.rows + placedCells.length * safeRowSpan + 12, 24);

  for (let rowStart = 1; rowStart <= maxRowsToScan; rowStart += 1) {
    for (let colStart = 1; colStart <= config.columns - safeColSpan + 1; colStart += 1) {
      const candidate: LayoutCell = {
        id: "candidate",
        colStart,
        colSpan: safeColSpan,
        rowStart,
        rowSpan: safeRowSpan,
        type: "text",
        content: "",
        blocks: [],
      };
      if (placedCells.every((cell) => !cellsOverlap(candidate, cell, config, measuredHeights))) {
        return { colStart, rowStart };
      }
    }
  }

  return { colStart: 1, rowStart: maxRowsToScan + 1 };
}

export function packLayoutCells(cells: LayoutCell[], config: LayoutConfig): LayoutCell[] {
  const placedCells: LayoutCell[] = [];
  for (const cell of cells) {
    const clampedCell = clampLayoutCell(cell, config);
    const placement = findLayoutPlacement(
      placedCells,
      config,
      clampedCell.colSpan,
      clampedCell.rowSpan,
    );
    placedCells.push({ ...clampedCell, ...placement });
  }
  return placedCells;
}

export function normalizeLayoutCells(cells: LayoutCell[], config: LayoutConfig): LayoutCell[] {
  const clampedCells = cells.map((cell) => clampLayoutCell(cell, config));
  return config.autoArrange ? packLayoutCells(clampedCells, config) : clampedCells;
}

export function hasLayoutCellCollision(cells: LayoutCell[], config: LayoutConfig, measuredHeights?: LayoutMeasuredCellHeights): boolean {
  return cells.some((cell, index) => cells.slice(index + 1).some((candidate) => cellsOverlap(cell, candidate, config, measuredHeights)));
}

export function layoutCellOverlapsAny(cell: LayoutCell, cells: LayoutCell[], config: LayoutConfig, measuredHeights?: LayoutMeasuredCellHeights): boolean {
  return cells.some((candidate) => candidate.id !== cell.id && cellsOverlap(cell, candidate, config, measuredHeights));
}

export function normalizeMovePlacement(
  cell: LayoutCell,
  config: LayoutConfig,
  placement: Pick<LayoutCell, "colStart" | "rowStart">,
): Pick<LayoutCell, "colStart" | "rowStart"> {
  return {
    colStart: clampNumber(placement.colStart, 1, Math.max(1, config.columns - cell.colSpan + 1), cell.colStart),
    rowStart: normalizeGridLine(placement.rowStart, cell.rowStart),
  };
}

export function resolveMovePlacement(
  cells: LayoutCell[],
  movingCell: LayoutCell,
  config: LayoutConfig,
  desiredPlacement: Pick<LayoutCell, "colStart" | "rowStart">,
  measuredHeights?: LayoutMeasuredCellHeights,
): Pick<LayoutCell, "colStart" | "rowStart"> & { collided: boolean } {
  const desired = normalizeMovePlacement(movingCell, config, desiredPlacement);
  const desiredCell = { ...movingCell, ...desired, offset: undefined };
  if (!layoutCellOverlapsAny(desiredCell, cells, config, measuredHeights)) return { ...desired, collided: false };
  return { ...desired, collided: true };
}

export function previewCellSwap(cells: LayoutCell[], draggedCellId: string, targetCellId: string): LayoutCell[] {
  if (draggedCellId === targetCellId) return cells;
  const draggedCell = cells.find((cell) => cell.id === draggedCellId);
  const targetCell = cells.find((cell) => cell.id === targetCellId);
  if (!draggedCell || !targetCell) return cells;

  return cells.map((cell) => {
    if (cell.id === draggedCellId) {
      return {
        ...cell,
        colStart: targetCell.colStart,
        colSpan: targetCell.colSpan,
        rowStart: targetCell.rowStart,
        rowSpan: targetCell.rowSpan,
      };
    }
    if (cell.id === targetCellId) {
      return {
        ...cell,
        colStart: draggedCell.colStart,
        colSpan: draggedCell.colSpan,
        rowStart: draggedCell.rowStart,
        rowSpan: draggedCell.rowSpan,
      };
    }
    return cell;
  });
}

export function applyCollisionPolicy(cells: LayoutCell[], config: LayoutConfig, fallbackCells: LayoutCell[], measuredHeights?: LayoutMeasuredCellHeights): LayoutCell[] {
  const normalizedCells = cells.map((cell) => clampLayoutCell(cell, config));
  if (config.autoArrange) return packLayoutCells(normalizedCells, config);
  return hasLayoutCellCollision(normalizedCells, config, measuredHeights) ? fallbackCells : normalizedCells;
}

export function layoutCellPlacementEqual(left: LayoutCell, right: LayoutCell): boolean {
  return left.colStart === right.colStart &&
    left.colSpan === right.colSpan &&
    left.rowStart === right.rowStart &&
    left.rowSpan === right.rowSpan;
}

export function resolveMeasuredAutoHeightFootprints(cells: LayoutCell[], config: LayoutConfig, measuredHeights: LayoutMeasuredCellHeights): LayoutCell[] {
  if (measuredHeights.size === 0) return cells;
  let changed = false;
  const expandedCells = cells.map((cell) => {
    if (!layoutCellUsesContentHeight(cell)) return cell;
    const rowSpan = collisionRowSpan(cell, config, measuredHeights);
    if (rowSpan === cell.rowSpan) return cell;
    changed = true;
    return { ...cell, rowSpan };
  });

  if (!changed && !hasLayoutCellCollision(expandedCells, config)) return cells;

  const placedCells: LayoutCell[] = [];
  const cellsById = new Map<string, LayoutCell>();
  const orderedCells = expandedCells
    .map((cell, index) => ({ cell, index }))
    .sort((left, right) => left.cell.rowStart - right.cell.rowStart || left.cell.colStart - right.cell.colStart || left.index - right.index);

  for (const { cell } of orderedCells) {
    let nextCell = cell;
    let attempts = 0;
    while (layoutCellOverlapsAny(nextCell, placedCells, config) && attempts < LAYOUT_CELL_ROW_SPAN_MAX) {
      nextCell = { ...nextCell, rowStart: nextCell.rowStart + 1 };
      attempts += 1;
    }
    placedCells.push(nextCell);
    cellsById.set(cell.id, nextCell);
  }

  const nextCells = expandedCells.map((cell) => cellsById.get(cell.id) ?? cell);
  return nextCells.some((cell, index) => !layoutCellPlacementEqual(cell, cells[index])) ? nextCells : cells;
}

export function getLayoutMode(block: Block): LayoutMode {
  return block.layoutMode === "full_page" ? "full_page" : "inline";
}

export function dataFlag(condition: boolean): "true" | undefined {
  return condition ? "true" : undefined;
}

export function isLayoutCellBlock(value: unknown): value is Block {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Block).id === "string" &&
      typeof (value as Block).type === "string" &&
      typeof (value as Block).content === "string",
  );
}

export function createLayoutCellBlock(cell: Pick<LayoutCell, "id" | "content" | "blockType">): Block {
  return {
    id: `${cell.id}-content`,
    type: cell.blockType ?? "paragraph",
    content: cell.content ?? "",
  };
}

export function getLayoutCellBlocks(cell: LayoutCell): Block[] {
  if (Array.isArray(cell.blocks)) {
    if (cell.blocks.length > 0 && cell.blocks.every(isLayoutCellBlock)) return cell.blocks;
    const blocks = cell.blocks.filter(isLayoutCellBlock);
    if (blocks.length > 0) return blocks;
  }

  return [createLayoutCellBlock(cell)];
}

export function layoutCellPatchChanges(cell: LayoutCell, patch: Partial<LayoutCell>): boolean {
  return Object.entries(patch).some(([key, value]) => {
    if (key === "offset") {
      const left = normalizeLayoutOffset(cell.offset);
      const right = normalizeLayoutOffset(value);
      return left?.x !== right?.x || left?.y !== right?.y;
    }
    return cell[key as keyof LayoutCell] !== value;
  });
}

export function layoutOffsetsEqual(left?: LayoutCellOffset, right?: LayoutCellOffset): boolean {
  return (left?.x ?? 0) === (right?.x ?? 0) && (left?.y ?? 0) === (right?.y ?? 0);
}

export function layoutCellShellEqual(left: LayoutCell, right: LayoutCell): boolean {
  return left.id === right.id &&
    left.colStart === right.colStart &&
    left.colSpan === right.colSpan &&
    left.rowStart === right.rowStart &&
    left.rowSpan === right.rowSpan &&
    left.label === right.label &&
    left.type === right.type &&
    left.textColor === right.textColor &&
    left.backgroundColor === right.backgroundColor &&
    left.sizing === right.sizing &&
    left.horizontalConstraint === right.horizontalConstraint &&
    left.verticalConstraint === right.verticalConstraint &&
    left.wrap === right.wrap &&
    left.padding === right.padding &&
    left.fontSize === right.fontSize &&
    layoutOffsetsEqual(left.offset, right.offset);
}

export function resizePreviewEqual(left: LayoutResizePreview | null, right: LayoutResizePreview | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id &&
    left.colStart === right.colStart &&
    left.colSpan === right.colSpan &&
    left.rowStart === right.rowStart &&
    left.rowSpan === right.rowSpan &&
    left.visual.x === right.visual.x &&
    left.visual.y === right.visual.y &&
    left.visual.width === right.visual.width &&
    left.visual.height === right.visual.height;
}

export function movePreviewEqual(left: LayoutMovePreview | null, right: LayoutMovePreview | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id && layoutOffsetsEqual(left.offset, right.offset);
}

export function resizeCursorForEdge(edge: LayoutResizeEdge): string {
  switch (edge) {
    case "left":
    case "right":
      return "ew-resize";
    case "top":
    case "bottom":
      return "ns-resize";
    case "top-right":
    case "bottom-left":
      return "nesw-resize";
    default:
      return "nwse-resize";
  }
}

export function resizeEdgeFromPoint(rect: DOMRect, clientX: number, clientY: number): LayoutResizeEdge | null {
  const edgeSize = 12;
  const onLeft = clientX - rect.left <= edgeSize;
  const onRight = rect.right - clientX <= edgeSize;
  const onTop = clientY - rect.top <= edgeSize;
  const onBottom = rect.bottom - clientY <= edgeSize;

  if (onTop && onLeft) return "top-left";
  if (onTop && onRight) return "top-right";
  if (onBottom && onLeft) return "bottom-left";
  if (onBottom && onRight) return "bottom-right";
  if (onTop) return "top";
  if (onBottom) return "bottom";
  if (onLeft) return "left";
  if (onRight) return "right";
  return null;
}

export function isInteractiveLayoutPointerTarget(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest(
    'button, input, textarea, select, a, [contenteditable="true"], [data-layout-cell-handle], [data-layout-resize-handle]',
  ));
}

export function isNativeTextUndoTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, [contenteditable="true"]'));
}

export function getLayoutPanelKind(settingsOpen: boolean, selectedCell: LayoutCell | null, preview: boolean): LayoutPanelKind | null {
  if (settingsOpen) return "settings";
  if (selectedCell && !preview) return "inspector";
  return null;
}
