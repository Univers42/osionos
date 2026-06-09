/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LayoutBlockEditor.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Grid3X3, Plus, SlidersHorizontal, X } from "lucide-react";

import { createViewShowcaseCells } from "@/widgets/database-view/model/databaseViewCatalog";
import type { Block } from "@/entities/block";
import { isCanvasV2Enabled } from "@/shared/config/featureFlags";
import { usePageStore } from "@/store/usePageStore";
import { BlockEditorSurface, type SurfaceBlockEditorProps } from "../BlockEditorSurface";
import { useCanvasStoreBridge, type CanvasPersistHandler } from "./store/canvasStore";

type LayoutMode = "inline" | "full_page";
type LayoutGuideVisibility = "auto" | "always" | "never";
type LayoutCellSizing = "fixed" | "auto-height" | "auto-width" | "auto";
type LayoutCellHorizontalConstraint = "left" | "stretch" | "scale";
type LayoutCellVerticalConstraint = "top" | "stretch" | "hug";
type LayoutCellPadding = "compact" | "comfortable" | "spacious";
type LayoutCellFontSize = "small" | "base" | "large";

interface LayoutConfig {
  columns: number;
  rows: number;
  gap: number;
  rowHeight: number;
  wrap: boolean;
  autoArrange: boolean;
  snapToGrid: boolean;
  guideVisibility: LayoutGuideVisibility;
  preview: boolean;
  theme: "default" | "compact" | "spacious";
}

interface LayoutCell {
  id: string;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  offset?: LayoutCellOffset;
  label?: string;
  tint?: string;
  blocks: Block[];
  type?: "text" | "color" | "spacer";
  content?: string;
  blockType?: Block["type"];
  textColor?: string;
  backgroundColor?: string;
  sizing?: LayoutCellSizing;
  horizontalConstraint?: LayoutCellHorizontalConstraint;
  verticalConstraint?: LayoutCellVerticalConstraint;
  wrap?: boolean;
  padding?: LayoutCellPadding;
  fontSize?: LayoutCellFontSize;
}

interface LayoutCellOffset {
  x: number;
  y: number;
}

type LayoutResizeEdge = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface LayoutResizePreview {
  id: string;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  visual: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface LayoutMovePreview {
  id: string;
  offset: LayoutCellOffset;
}

interface LayoutAlignmentGuides {
  x?: number;
  y?: number;
}

type LayoutInteractionMode = "drag" | "move" | "resize";

interface LayoutDatabasePreview {
  databaseId?: string;
  viewId?: string;
}

interface LayoutHistorySnapshot {
  layoutConfig: LayoutConfig;
  layoutCells: LayoutCell[];
  layoutMode: LayoutMode;
  selectedCellId: string | null;
}

type LayoutMeasuredCellHeights = ReadonlyMap<string, number>;

type LayoutPanelKind = "settings" | "inspector";

const LAYOUT_CELL_COLOR_SWATCHES = [
  { label: "Surface", backgroundColor: "var(--osio-bg-surface)", textColor: "var(--osio-fg-default)" },
  { label: "Blue", backgroundColor: "color-mix(in srgb, #2563eb 8%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { label: "Green", backgroundColor: "color-mix(in srgb, #0f766e 10%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { label: "Gold", backgroundColor: "color-mix(in srgb, #b45309 10%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { label: "Rose", backgroundColor: "color-mix(in srgb, #be123c 8%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
];

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  columns: 12,
  rows: 6,
  gap: 16,
  rowHeight: 120,
  wrap: true,
  autoArrange: false,
  snapToGrid: true,
  guideVisibility: "auto",
  preview: false,
  theme: "default",
};
const LAYOUT_CELL_DND_TYPE = "application/x-osionos-layout-cell-id";

const LAYOUT_CONFIG_LIMITS = {
  columns: [1, 24],
  rows: [1, 96],
  gap: [0, 48],
  rowHeight: [96, 320],
} as const;

const CELL_MIN_CONTENT_WIDTH = 280;
const CELL_COMFORTABLE_WIDTH = 480;
const CELL_MIN_ROW_HEIGHT = 96;
const LAYOUT_CELL_ROW_SPAN_MAX = 512;
type LayoutGridStyle = React.CSSProperties & Record<"--osionos-layout-dot-size" | "--osionos-layout-row-size", string>;
const LAYOUT_PANEL_WIDTHS: Record<LayoutPanelKind, number> = {
  settings: 260,
  inspector: 304,
};
const LAYOUT_EDGE_AUTOSCROLL_ZONE = 72;
const LAYOUT_EDGE_AUTOSCROLL_MAX_SPEED = 28;
const EMPTY_LAYOUT_CELLS: LayoutCell[] = [];
const LAYOUT_RESIZE_EDGES: LayoutResizeEdge[] = [
  "left",
  "right",
  "top",
  "bottom",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const nextValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.max(min, Math.min(max, Math.round(nextValue)));
}

function normalizeGridLine(value: unknown, fallback: number): number {
  const nextValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.max(1, Math.round(nextValue));
}

function edgeAutoScrollSpeed(pointer: number, start: number, end: number): number {
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

function createLayoutAutoScroller(horizontalContainer: HTMLElement | null) {
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

function captureLayoutPointer(target: HTMLElement, pointerId: number) {
  try {
    target.setPointerCapture?.(pointerId);
  } catch {
    // Synthetic PointerEvents in tests do not always create an active pointer.
  }
}

function releaseLayoutPointer(target: HTMLElement, pointerId: number) {
  try {
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
  } catch {
    // The pointer may already be released if the browser cancelled the stream.
  }
}

function normalizeLayoutOffset(value: unknown): LayoutCellOffset | undefined {
  if (!value || typeof value !== "object") return undefined;
  const offset = value as Partial<LayoutCellOffset>;
  const x = typeof offset.x === "number" ? offset.x : Number(offset.x);
  const y = typeof offset.y === "number" ? offset.y : Number(offset.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const nextOffset = { x: Math.round(x), y: Math.round(y) };
  return nextOffset.x === 0 && nextOffset.y === 0 ? undefined : nextOffset;
}

function layoutCellHasHeavyBlocks(blocks: Block[] | undefined): boolean {
  return Boolean(blocks?.some((nestedBlock) => (
    nestedBlock.type === "database_inline" ||
    nestedBlock.type === "database_full_page" ||
    layoutCellHasHeavyBlocks(nestedBlock.children)
  )));
}

function layoutCellDatabasePreview(blocks: Block[] | undefined): LayoutDatabasePreview | null {
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

function sanitizeLayoutConfig(config: Partial<LayoutConfig> | undefined): LayoutConfig {
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

function clampLayoutCell(cell: LayoutCell, config: LayoutConfig): LayoutCell {
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

function layoutCellUsesContentHeight(cell: LayoutCell): boolean {
  return cell.sizing === "auto-height" || cell.sizing === "auto" || cell.sizing === "auto-width";
}

function rowSpanForRenderedHeight(height: number, config: LayoutConfig): number {
  if (!Number.isFinite(height) || height <= 0) return 1;
  const rowStep = config.rowHeight + config.gap;
  return clampNumber(Math.ceil((height + config.gap) / rowStep), 1, LAYOUT_CELL_ROW_SPAN_MAX, 1);
}

function collisionRowSpan(cell: LayoutCell, config?: LayoutConfig, measuredHeights?: LayoutMeasuredCellHeights): number {
  if (!config || !measuredHeights || !layoutCellUsesContentHeight(cell)) return cell.rowSpan;
  const measuredHeight = measuredHeights.get(cell.id);
  if (!measuredHeight) return cell.rowSpan;
  return rowSpanForRenderedHeight(measuredHeight, config);
}

function cellsOverlap(left: LayoutCell, right: LayoutCell, config?: LayoutConfig, measuredHeights?: LayoutMeasuredCellHeights): boolean {
  const leftRowSpan = collisionRowSpan(left, config, measuredHeights);
  const rightRowSpan = collisionRowSpan(right, config, measuredHeights);
  return !(
    left.colStart + left.colSpan <= right.colStart ||
    right.colStart + right.colSpan <= left.colStart ||
    left.rowStart + leftRowSpan <= right.rowStart ||
    right.rowStart + rightRowSpan <= left.rowStart
  );
}

function findLayoutPlacement(
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

function packLayoutCells(cells: LayoutCell[], config: LayoutConfig): LayoutCell[] {
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

function normalizeLayoutCells(cells: LayoutCell[], config: LayoutConfig): LayoutCell[] {
  const clampedCells = cells.map((cell) => clampLayoutCell(cell, config));
  return config.autoArrange ? packLayoutCells(clampedCells, config) : clampedCells;
}

function hasLayoutCellCollision(cells: LayoutCell[], config: LayoutConfig, measuredHeights?: LayoutMeasuredCellHeights): boolean {
  return cells.some((cell, index) => cells.slice(index + 1).some((candidate) => cellsOverlap(cell, candidate, config, measuredHeights)));
}

function layoutCellOverlapsAny(cell: LayoutCell, cells: LayoutCell[], config: LayoutConfig, measuredHeights?: LayoutMeasuredCellHeights): boolean {
  return cells.some((candidate) => candidate.id !== cell.id && cellsOverlap(cell, candidate, config, measuredHeights));
}

function normalizeMovePlacement(
  cell: LayoutCell,
  config: LayoutConfig,
  placement: Pick<LayoutCell, "colStart" | "rowStart">,
): Pick<LayoutCell, "colStart" | "rowStart"> {
  return {
    colStart: clampNumber(placement.colStart, 1, Math.max(1, config.columns - cell.colSpan + 1), cell.colStart),
    rowStart: normalizeGridLine(placement.rowStart, cell.rowStart),
  };
}

function resolveMovePlacement(
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

function previewCellSwap(cells: LayoutCell[], draggedCellId: string, targetCellId: string): LayoutCell[] {
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

function applyCollisionPolicy(cells: LayoutCell[], config: LayoutConfig, fallbackCells: LayoutCell[], measuredHeights?: LayoutMeasuredCellHeights): LayoutCell[] {
  const normalizedCells = cells.map((cell) => clampLayoutCell(cell, config));
  if (config.autoArrange) return packLayoutCells(normalizedCells, config);
  return hasLayoutCellCollision(normalizedCells, config, measuredHeights) ? fallbackCells : normalizedCells;
}

function layoutCellPlacementEqual(left: LayoutCell, right: LayoutCell): boolean {
  return left.colStart === right.colStart &&
    left.colSpan === right.colSpan &&
    left.rowStart === right.rowStart &&
    left.rowSpan === right.rowSpan;
}

function resolveMeasuredAutoHeightFootprints(cells: LayoutCell[], config: LayoutConfig, measuredHeights: LayoutMeasuredCellHeights): LayoutCell[] {
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

function getLayoutMode(block: Block): LayoutMode {
  return block.layoutMode === "full_page" ? "full_page" : "inline";
}

function dataFlag(condition: boolean): "true" | undefined {
  return condition ? "true" : undefined;
}

function isLayoutCellBlock(value: unknown): value is Block {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Block).id === "string" &&
      typeof (value as Block).type === "string" &&
      typeof (value as Block).content === "string",
  );
}

function createLayoutCellBlock(cell: Pick<LayoutCell, "id" | "content" | "blockType">): Block {
  return {
    id: `${cell.id}-content`,
    type: cell.blockType ?? "paragraph",
    content: cell.content ?? "",
  };
}

function getLayoutCellBlocks(cell: LayoutCell): Block[] {
  if (Array.isArray(cell.blocks)) {
    if (cell.blocks.length > 0 && cell.blocks.every(isLayoutCellBlock)) return cell.blocks;
    const blocks = cell.blocks.filter(isLayoutCellBlock);
    if (blocks.length > 0) return blocks;
  }

  return [createLayoutCellBlock(cell)];
}

function layoutCellPatchChanges(cell: LayoutCell, patch: Partial<LayoutCell>): boolean {
  return Object.entries(patch).some(([key, value]) => {
    if (key === "offset") {
      const left = normalizeLayoutOffset(cell.offset);
      const right = normalizeLayoutOffset(value);
      return left?.x !== right?.x || left?.y !== right?.y;
    }
    return cell[key as keyof LayoutCell] !== value;
  });
}

function layoutOffsetsEqual(left?: LayoutCellOffset, right?: LayoutCellOffset): boolean {
  return (left?.x ?? 0) === (right?.x ?? 0) && (left?.y ?? 0) === (right?.y ?? 0);
}

function layoutCellShellEqual(left: LayoutCell, right: LayoutCell): boolean {
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

function resizePreviewEqual(left: LayoutResizePreview | null, right: LayoutResizePreview | null): boolean {
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

function movePreviewEqual(left: LayoutMovePreview | null, right: LayoutMovePreview | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id && layoutOffsetsEqual(left.offset, right.offset);
}

function resizeCursorForEdge(edge: LayoutResizeEdge): string {
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

function resizeEdgeFromPoint(rect: DOMRect, clientX: number, clientY: number): LayoutResizeEdge | null {
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

function isInteractiveLayoutPointerTarget(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest(
    'button, input, textarea, select, a, [contenteditable="true"], [data-layout-cell-handle], [data-layout-resize-handle]',
  ));
}

function isNativeTextUndoTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, [contenteditable="true"]'));
}

function getLayoutPanelKind(settingsOpen: boolean, selectedCell: LayoutCell | null, preview: boolean): LayoutPanelKind | null {
  if (settingsOpen) return "settings";
  if (selectedCell && !preview) return "inspector";
  return null;
}

function useLayoutDismissAndUndo({
  selectedCellId,
  interactionMode,
  layoutRootRef,
  selectCell,
  undoLayout,
  redoLayout,
  clearCollision,
}: {
  selectedCellId: string | null;
  interactionMode: LayoutInteractionMode | null;
  layoutRootRef: React.RefObject<HTMLElement | null>;
  selectCell: (cellId: string | null) => void;
  undoLayout: () => boolean;
  redoLayout: () => boolean;
  clearCollision: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedCellId) {
        selectCell(null);
        clearCollision();
        return;
      }

      const eventTarget = event.target instanceof Node ? event.target : null;
      const eventIsInsideLayout = Boolean(eventTarget && layoutRootRef.current?.contains(eventTarget));

      if (!(event.ctrlKey || event.metaKey) || event.altKey || (!selectedCellId && !eventIsInsideLayout)) return;
      if (isNativeTextUndoTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const handled = key === "z" && !event.shiftKey
        ? undoLayout()
        : ((key === "z" && event.shiftKey) || key === "y") && redoLayout();

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [clearCollision, layoutRootRef, redoLayout, selectCell, selectedCellId, undoLayout]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!selectedCellId || interactionMode) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;
      if (layoutRootRef.current?.contains(target)) return;
      if (target.closest(".osionos-layout-cell-inspector")) return;
      selectCell(null);
      clearCollision();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [clearCollision, interactionMode, layoutRootRef, selectCell, selectedCellId]);
}

interface LayoutBlockEditorProps {
  block: Block;
  pageId: string;
  onUpdateBlock?: (blockId: string, updates: Partial<Block>) => void;
  renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
}

const LayoutBlockEditorLegacy: React.FC<LayoutBlockEditorProps> = ({ block, pageId, onUpdateBlock, renderBlockEditor }) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resizingCell, setResizingCell] = useState<LayoutResizePreview | null>(null);
  const [movingCell, setMovingCell] = useState<LayoutMovePreview | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<LayoutAlignmentGuides | null>(null);
  const [interactionMode, setInteractionMode] = useState<LayoutInteractionMode | null>(null);
  const [draggingCellId, setDraggingCellId] = useState<string | null>(null);
  const [cellDropTargetId, setCellDropTargetId] = useState<string | null>(null);
  const [collisionCellId, setCollisionCellId] = useState<string | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const storedConfig = block.layoutConfig as Partial<LayoutConfig> | undefined;
  const config = useMemo(() => sanitizeLayoutConfig(storedConfig), [storedConfig]);
  const layoutMode = getLayoutMode(block);
  const storedCells = Array.isArray(block.layoutCells) ? block.layoutCells as LayoutCell[] : EMPTY_LAYOUT_CELLS;
  const cells = useMemo(() => normalizeLayoutCells(storedCells, config), [storedCells, config]);
  const cellsRef = useRef<LayoutCell[]>(cells);
  const measuredCellHeightsRef = useRef<Map<string, number>>(new Map());
  const [measurementVersion, setMeasurementVersion] = useState(0);
  const layoutRootRef = useRef<HTMLElement | null>(null);
  const layoutHistoryRef = useRef<{ undoStack: LayoutHistorySnapshot[]; redoStack: LayoutHistorySnapshot[] }>({
    undoStack: [],
    redoStack: [],
  });
  // Measured auto-height footprints are PRESENTATION state: they depend on
  // this instance's rendered width, so they are resolved at render time and
  // NEVER persisted. Persisting them (the old auto-write effect) made two
  // views of the same page at different widths overwrite each other's spans
  // through the page store in an infinite loop (React #185 — the app crashed
  // the moment a pane resize made their measurements diverge).
  const resolvedCells = useMemo(
    () => resolveMeasuredAutoHeightFootprints(cells, config, measuredCellHeightsRef.current),
    // measurementVersion invalidates the memo when a cell crosses a row boundary
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells, config, measurementVersion],
  );
  const selectedCell = useMemo(
    () => resolvedCells.find((cell) => cell.id === selectedCellId) ?? null,
    [resolvedCells, selectedCellId],
  );
  useEffect(() => {
    cellsRef.current = resolvedCells;
    const liveCellIds = new Set(resolvedCells.map((cell) => cell.id));
    for (const cellId of measuredCellHeightsRef.current.keys()) {
      if (!liveCellIds.has(cellId)) measuredCellHeightsRef.current.delete(cellId);
    }
  }, [resolvedCells]);

  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const updateMeasuredCellHeight = useCallback((cellId: string, height: number | null) => {
    if (height === null) {
      if (measuredCellHeightsRef.current.delete(cellId)) setMeasurementVersion((version) => version + 1);
      return;
    }

    const measuredHeight = Math.max(0, Math.round(height));
    const previousHeight = measuredCellHeightsRef.current.get(cellId);
    if (previousHeight === measuredHeight) return;
    measuredCellHeightsRef.current.set(cellId, measuredHeight);
    // Only signal a layout update when the measurement crosses a row boundary;
    // every keystroke triggers a ResizeObserver pulse, and bumping on every
    // pixel re-runs reconciliation/store writes which makes typing janky.
    const cfg = configRef.current;
    const previousSpan = previousHeight ? rowSpanForRenderedHeight(previousHeight, cfg) : 0;
    const nextSpan = rowSpanForRenderedHeight(measuredHeight, cfg);
    if (previousSpan === nextSpan) return;
    setMeasurementVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    layoutHistoryRef.current = { undoStack: [], redoStack: [] };
  }, [block.id, pageId]);

  const updateLayout = useCallback(
    (updates: Partial<Pick<Block, "layoutConfig" | "layoutCells" | "layoutMode">>) => {
      if (onUpdateBlock) {
        onUpdateBlock(block.id, updates);
        return;
      }
      updateBlock(pageId, block.id, updates);
    },
    [block.id, onUpdateBlock, pageId, updateBlock],
  );

  const captureLayoutSnapshot = useCallback((): LayoutHistorySnapshot => ({
    layoutConfig: structuredClone(config),
    layoutCells: structuredClone(cellsRef.current),
    layoutMode,
    selectedCellId,
  }), [config, layoutMode, selectedCellId]);

  const pushLayoutSnapshot = useCallback((nextSelectedCellId?: string | null) => {
    const history = layoutHistoryRef.current;
    const snapshot = captureLayoutSnapshot();
    if (nextSelectedCellId !== undefined) snapshot.selectedCellId = nextSelectedCellId;
    history.undoStack.push(snapshot);
    if (history.undoStack.length > 50) history.undoStack.shift();
    history.redoStack = [];
  }, [captureLayoutSnapshot]);

  const restoreLayoutSnapshot = useCallback((snapshot: LayoutHistorySnapshot) => {
    updateLayout({
      layoutConfig: snapshot.layoutConfig,
      layoutCells: snapshot.layoutCells,
      layoutMode: snapshot.layoutMode,
    });
    setSelectedCellId(snapshot.selectedCellId);
    setCollisionCellId(null);
  }, [updateLayout]);

  const undoLayout = useCallback(() => {
    const history = layoutHistoryRef.current;
    const previous = history.undoStack.pop();
    if (!previous) return false;
    history.redoStack.push(captureLayoutSnapshot());
    restoreLayoutSnapshot(previous);
    return true;
  }, [captureLayoutSnapshot, restoreLayoutSnapshot]);

  const redoLayout = useCallback(() => {
    const history = layoutHistoryRef.current;
    const next = history.redoStack.pop();
    if (!next) return false;
    history.undoStack.push(captureLayoutSnapshot());
    restoreLayoutSnapshot(next);
    return true;
  }, [captureLayoutSnapshot, restoreLayoutSnapshot]);

  const selectCell = useCallback((cellId: string | null) => {
    setSelectedCellId(cellId);
    if (cellId) setSettingsOpen(false);
  }, []);

  const updateConfig = useCallback(
    (patch: Partial<LayoutConfig>) => {
      const nextConfig = sanitizeLayoutConfig({ ...config, ...patch });
      pushLayoutSnapshot();
      updateLayout({ layoutConfig: nextConfig, layoutCells: normalizeLayoutCells(cells, nextConfig) });
    },
    [cells, config, pushLayoutSnapshot, updateLayout],
  );

  const updateCells = useCallback((nextCells: LayoutCell[], options: { allowCollisionFallback?: boolean } = {}) => {
    const normalizedCells = normalizeLayoutCells(nextCells, config);
    if (!config.autoArrange && !options.allowCollisionFallback && hasLayoutCellCollision(normalizedCells, config, measuredCellHeightsRef.current)) {
      return false;
    }
    pushLayoutSnapshot();
    updateLayout({ layoutCells: normalizedCells });
    return true;
  }, [config, pushLayoutSnapshot, updateLayout]);

  const addCell = useCallback((template?: Partial<LayoutCell>) => {
    const currentCells = cellsRef.current;
    const grid = document.querySelector<HTMLElement>(`[data-layout-grid="${block.id}"]`);
    const columnWidth = Math.max(1, (grid?.getBoundingClientRect().width ?? 960) / config.columns);
    const comfortableSpan = Math.max(1, Math.ceil(CELL_COMFORTABLE_WIDTH / columnWidth));
    const colSpan = Math.min(config.columns, Math.max(template?.colSpan ?? comfortableSpan, Math.ceil(CELL_MIN_CONTENT_WIDTH / columnWidth)));
    const rowSpan = Math.max(1, template?.rowSpan ?? 2);
    const placement = findLayoutPlacement(currentCells, config, colSpan, rowSpan, measuredCellHeightsRef.current);
    const nextCell: LayoutCell = {
      id: crypto.randomUUID(),
      colStart: template?.colStart ?? placement.colStart,
      colSpan,
      rowStart: template?.rowStart ?? placement.rowStart,
      rowSpan,
      label: template?.label,
      tint: template?.tint,
      textColor: template?.textColor,
      backgroundColor: template?.backgroundColor,
      sizing: template?.sizing ?? "fixed",
      horizontalConstraint: template?.horizontalConstraint ?? "stretch",
      verticalConstraint: template?.verticalConstraint ?? "top",
      wrap: template?.wrap !== false,
      padding: template?.padding ?? "comfortable",
      fontSize: template?.fontSize ?? "base",
      type: "text",
      content: "",
      blocks: template?.blocks ?? [{ id: crypto.randomUUID(), type: "paragraph", content: "" }],
    };
    updateCells(config.autoArrange ? packLayoutCells([...currentCells, nextCell], config) : [...currentCells, nextCell]);
  }, [block.id, config, updateCells]);

  const applyTemplate = useCallback((kind: "dashboard" | "tracker" | "notes" | "kanban") => {
    const createCell = (partial: Omit<LayoutCell, "id" | "type" | "content">): LayoutCell => ({
      id: crypto.randomUUID(),
      type: "text",
      content: "",
      ...partial,
    });
    const heading = (text: string): Block[] => [{ id: crypto.randomUUID(), type: "heading_3", content: text }];
    const templates: Record<typeof kind, LayoutCell[]> = {
      dashboard: createViewShowcaseCells(),
      tracker: [
        createCell({ colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 5, label: "Sidebar", blocks: heading("Tracker") }),
        createCell({ colStart: 5, colSpan: 8, rowStart: 1, rowSpan: 2, label: "Now", blocks: heading("Now") }),
        createCell({ colStart: 5, colSpan: 4, rowStart: 3, rowSpan: 2, label: "Status", blocks: heading("Status") }),
        createCell({ colStart: 9, colSpan: 4, rowStart: 3, rowSpan: 2, label: "Risks", blocks: heading("Risks") }),
      ],
      notes: [
        createCell({ colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 4, label: "Left", blocks: heading("Notes") }),
        createCell({ colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 4, label: "Right", blocks: heading("References") }),
      ],
      kanban: ["Backlog", "Doing", "Review", "Done"].map((label, index) => createCell({
        colStart: index * 3 + 1,
        colSpan: 3,
        rowStart: 1,
        rowSpan: 4,
        label,
        blocks: heading(label),
      })),
    };
    updateCells(templates[kind], { allowCollisionFallback: true });
  }, [updateCells]);

  const updateCell = useCallback((cellId: string, patch: Partial<LayoutCell>) => {
    const currentCells = cellsRef.current;
    const currentCell = currentCells.find((cell) => cell.id === cellId);
    if (!currentCell) return false;
    if (!layoutCellPatchChanges(currentCell, patch)) return true;
    const nextCells = applyCollisionPolicy(
      currentCells.map((cell) => (cell.id === cellId ? { ...cell, ...patch } : cell)),
      config,
      currentCells,
      measuredCellHeightsRef.current,
    );
    const changed = nextCells !== currentCells;
    setCollisionCellId(changed ? null : cellId);
    if (changed) {
      pushLayoutSnapshot(cellId);
      updateLayout({ layoutCells: nextCells });
    }
    return changed;
  }, [config, pushLayoutSnapshot, updateLayout]);

  const removeCell = useCallback((cellId: string) => updateCells(cellsRef.current.filter((cell) => cell.id !== cellId)), [updateCells]);

  const updateSelectedCell = useCallback((patch: Partial<LayoutCell>) => {
    if (!selectedCellId) return;
    updateCell(selectedCellId, patch);
  }, [selectedCellId, updateCell]);

  const duplicateCell = useCallback((cellId: string) => {
    const cell = cellsRef.current.find((candidate) => candidate.id === cellId);
    if (!cell) return;
    addCell({
      label: cell.label ? `${cell.label} copy` : undefined,
      colSpan: cell.colSpan,
      rowSpan: cell.rowSpan,
      tint: cell.tint,
      textColor: cell.textColor,
      backgroundColor: cell.backgroundColor,
      sizing: cell.sizing,
      horizontalConstraint: cell.horizontalConstraint,
      verticalConstraint: cell.verticalConstraint,
      wrap: cell.wrap,
      padding: cell.padding,
      fontSize: cell.fontSize,
      blocks: structuredClone(cell.blocks).map((nestedBlock) => ({ ...nestedBlock, id: crypto.randomUUID() })),
    });
  }, [addCell]);

  const reorderCellByDrop = useCallback((draggedCellId: string, targetCellId: string) => {
    if (draggedCellId === targetCellId) return;
    const nextCells = previewCellSwap(cellsRef.current, draggedCellId, targetCellId);
    updateCells(nextCells, { allowCollisionFallback: true });
  }, [updateCells]);

  const previewCellDrop = useCallback((draggedCellId: string, targetCellId: string) => {
    setCellDropTargetId(draggedCellId === targetCellId ? null : targetCellId);
  }, []);

  const startResize = useCallback((event: React.PointerEvent<HTMLElement>, cell: LayoutCell, edge: LayoutResizeEdge) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    const pointerTarget = event.currentTarget;
    const pointerId = event.pointerId;
    captureLayoutPointer(pointerTarget, pointerId);
    const grid = event.currentTarget.closest<HTMLElement>("[data-layout-grid]");
    const cellElement = event.currentTarget.closest<HTMLElement>("[data-layout-cell-id]");
    if (!grid || !cellElement) return;
    const scrollContainer = grid.parentElement;
    const autoScroller = createLayoutAutoScroller(scrollContainer);

    const gridStyle = getComputedStyle(grid);
    const paddingLeft = Number.parseFloat(gridStyle.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(gridStyle.paddingRight) || 0;
    const contentWidth = Math.max(1, grid.clientWidth - paddingLeft - paddingRight);
    const columnWidth = Math.max(1, (contentWidth - Math.max(0, config.columns - 1) * config.gap) / config.columns);
    const columnStep = columnWidth + config.gap;
    const rowStep = config.rowHeight + config.gap;
    const startRect = cellElement.getBoundingClientRect();
    const startOffset = normalizeLayoutOffset(cell.offset) ?? { x: 0, y: 0 };
    const spanWidth = (span: number) => span * columnWidth + Math.max(0, span - 1) * config.gap;
    const spanHeight = (span: number) => span * config.rowHeight + Math.max(0, span - 1) * config.gap;

    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollX = globalThis.scrollX;
    const startScrollY = globalThis.scrollY;
    const startContainerScrollLeft = scrollContainer?.scrollLeft ?? 0;
    const minColSpan = 1;
    const minRowSpan = 1;
    let frame = 0;
    let latestPreview: LayoutResizePreview = {
      id: cell.id,
      colStart: cell.colStart,
      colSpan: cell.colSpan,
      rowStart: cell.rowStart,
      rowSpan: cell.rowSpan,
      visual: {
        x: startOffset.x,
        y: startOffset.y,
        width: startRect.width,
        height: startRect.height,
      },
    };
    let latestStyle = {
      x: startOffset.x,
      y: startOffset.y,
      width: startRect.width,
      height: startRect.height,
    };

    const previewFromPointer = (clientX: number, clientY: number) => {
      const scrollDeltaX = globalThis.scrollX - startScrollX + (scrollContainer?.scrollLeft ?? 0) - startContainerScrollLeft;
      const scrollDeltaY = globalThis.scrollY - startScrollY;
      const deltaX = clientX - startX + scrollDeltaX;
      const deltaY = clientY - startY + scrollDeltaY;
      const colDelta = Math.round(deltaX / columnStep);
      const rowDelta = Math.round(deltaY / rowStep);
      let nextColSpan = cell.colSpan;
      let nextRowSpan = cell.rowSpan;
      let nextColStart = cell.colStart;
      let nextRowStart = cell.rowStart;
      let nextWidth = startRect.width;
      let nextHeight = startRect.height;
      let nextX = startOffset.x;
      let nextY = startOffset.y;
      if (edge.includes("right")) {
        const maxWidth = spanWidth(config.columns - cell.colStart + 1);
        nextWidth = Math.max(spanWidth(minColSpan), Math.min(maxWidth, startRect.width + deltaX));
        nextColSpan = Math.max(minColSpan, Math.min(config.columns - cell.colStart + 1, cell.colSpan + colDelta));
      }
      if (edge.includes("left")) {
        const rightEdge = cell.colStart + cell.colSpan;
        const maxWidth = spanWidth(rightEdge - 1);
        const clampedDeltaX = Math.max(startRect.width - maxWidth, Math.min(startRect.width - spanWidth(minColSpan), deltaX));
        nextX = startOffset.x + clampedDeltaX;
        nextWidth = startRect.width - clampedDeltaX;
        nextColStart = Math.max(1, Math.min(rightEdge - minColSpan, cell.colStart + colDelta));
        nextColSpan = rightEdge - nextColStart;
      }
      if (edge.includes("bottom")) {
        const maxHeight = spanHeight(LAYOUT_CONFIG_LIMITS.rows[1]);
        nextHeight = Math.max(spanHeight(minRowSpan), Math.min(maxHeight, startRect.height + deltaY));
        nextRowSpan = Math.max(minRowSpan, Math.min(LAYOUT_CONFIG_LIMITS.rows[1], cell.rowSpan + rowDelta));
      }
      if (edge.includes("top")) {
        const bottomEdge = cell.rowStart + cell.rowSpan;
        const maxHeight = spanHeight(bottomEdge - 1);
        const clampedDeltaY = Math.max(startRect.height - maxHeight, Math.min(startRect.height - spanHeight(minRowSpan), deltaY));
        nextY = startOffset.y + clampedDeltaY;
        nextHeight = startRect.height - clampedDeltaY;
        nextRowStart = Math.max(1, Math.min(bottomEdge - minRowSpan, cell.rowStart + rowDelta));
        nextRowSpan = bottomEdge - nextRowStart;
      }
      return {
        preview: {
          id: cell.id,
          colStart: nextColStart,
          colSpan: nextColSpan,
          rowStart: nextRowStart,
          rowSpan: nextRowSpan,
          visual: {
            x: nextX,
            y: nextY,
            width: Math.max(spanWidth(minColSpan), nextWidth),
            height: Math.max(spanHeight(minRowSpan), nextHeight),
          },
        },
        style: {
          x: nextX,
          y: nextY,
          width: Math.max(spanWidth(minColSpan), nextWidth),
          height: Math.max(spanHeight(minRowSpan), nextHeight),
        },
      };
    };

    const flushPreview = () => {
      frame = 0;
      cellElement.style.setProperty("--osionos-layout-cell-offset-x", `${latestStyle.x}px`);
      cellElement.style.setProperty("--osionos-layout-cell-offset-y", `${latestStyle.y}px`);
      cellElement.style.setProperty("--osionos-layout-cell-preview-width", `${latestStyle.width}px`);
      cellElement.style.setProperty("--osionos-layout-cell-preview-height", `${latestStyle.height}px`);
      cellElement.dataset.layoutCellCollision = layoutCellOverlapsAny({ ...cell, ...latestPreview }, cellsRef.current, config, measuredCellHeightsRef.current) ? "true" : "";
      const sizeBadge = cellElement.querySelector<HTMLElement>(".osionos-layout-size-badge");
      if (sizeBadge) sizeBadge.textContent = `⤢ ${latestPreview.colSpan}×${latestPreview.rowSpan}`;
    };

    const queuePreview = (clientX: number, clientY: number) => {
      const next = previewFromPointer(clientX, clientY);
      latestPreview = next.preview;
      latestStyle = next.style;
      if (frame) return;
      frame = requestAnimationFrame(flushPreview);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      autoScroller.update(moveEvent.clientX, moveEvent.clientY);
      queuePreview(moveEvent.clientX, moveEvent.clientY);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      const next = previewFromPointer(upEvent.clientX, upEvent.clientY);
      latestPreview = next.preview;
      if (frame) cancelAnimationFrame(frame);
      globalThis.removeEventListener("pointermove", handlePointerMove);
      globalThis.removeEventListener("pointerup", handlePointerUp);
      globalThis.removeEventListener("pointercancel", handlePointerUp);
      autoScroller.stop();
      releaseLayoutPointer(pointerTarget, pointerId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      cellElement.style.removeProperty("--osionos-layout-cell-offset-x");
      cellElement.style.removeProperty("--osionos-layout-cell-offset-y");
      cellElement.style.removeProperty("--osionos-layout-cell-preview-width");
      cellElement.style.removeProperty("--osionos-layout-cell-preview-height");
      delete cellElement.dataset.layoutCellResizing;
      delete cellElement.dataset.layoutCellCollision;
      setResizingCell(null);
      setInteractionMode(null);
      // Auto-sizing cells derive their height from content, so a freshly
      // dragged size would snap back when sizing is still "auto-height". On
      // commit, lock the cell to fixed sizing so the resize is preserved.
      const sizingPatch: Partial<LayoutCell> = layoutCellUsesContentHeight(cell)
        ? { sizing: "fixed" }
        : {};
      updateCell(cell.id, {
        colStart: latestPreview.colStart,
        colSpan: latestPreview.colSpan,
        rowStart: latestPreview.rowStart,
        rowSpan: latestPreview.rowSpan,
        ...sizingPatch,
      });
    };

    document.body.style.cursor = resizeCursorForEdge(edge);
    document.body.style.userSelect = "none";
    cellElement.dataset.layoutCellResizing = "true";
    selectCell(cell.id);
    setResizingCell(latestPreview);
    setInteractionMode("resize");
    autoScroller.update(event.clientX, event.clientY);
    globalThis.addEventListener("pointermove", handlePointerMove);
    globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
    globalThis.addEventListener("pointercancel", handlePointerUp, { once: true });
  }, [config, selectCell, updateCell]);

  const startMove = useCallback((event: React.PointerEvent<HTMLElement>, cell: LayoutCell) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    const pointerTarget = event.currentTarget;
    const pointerId = event.pointerId;
    captureLayoutPointer(pointerTarget, pointerId);
    const grid = event.currentTarget.closest<HTMLElement>("[data-layout-grid]");
    const cellElement = event.currentTarget.closest<HTMLElement>("[data-layout-cell-id]");
    if (!grid || !cellElement) return;
    const scrollContainer = grid.parentElement;
    const autoScroller = createLayoutAutoScroller(scrollContainer);

    const gridStyle = getComputedStyle(grid);
    const paddingLeft = Number.parseFloat(gridStyle.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(gridStyle.paddingRight) || 0;
    const paddingTop = Number.parseFloat(gridStyle.paddingTop) || 0;
    const contentWidth = Math.max(1, grid.clientWidth - paddingLeft - paddingRight);
    const columnWidth = Math.max(1, (contentWidth - Math.max(0, config.columns - 1) * config.gap) / config.columns);
    const columnStep = columnWidth + config.gap;
    const rowStep = config.rowHeight + config.gap;
    const gridRect = grid.getBoundingClientRect();
    const startRect = cellElement.getBoundingClientRect();
    const startLeftInGrid = startRect.left - gridRect.left - paddingLeft + (scrollContainer?.scrollLeft ?? 0);
    const startTopInGrid = startRect.top - gridRect.top - paddingTop;

    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollX = globalThis.scrollX;
    const startScrollY = globalThis.scrollY;
    const startContainerScrollLeft = scrollContainer?.scrollLeft ?? 0;
    const startOffset = normalizeLayoutOffset(cell.offset) ?? { x: 0, y: 0 };
    const currentCells = cellsRef.current;
    const startLogicalLeftInGrid = startLeftInGrid - startOffset.x;
    const startLogicalTopInGrid = startTopInGrid - startOffset.y;

    let frame = 0;
    let latestMove: LayoutMovePreview = { id: cell.id, offset: startOffset };
    let latestPlacement = { colStart: cell.colStart, rowStart: cell.rowStart, collided: false };

    const moveFromPointer = (clientX: number, clientY: number) => {
      const scrollDeltaX = globalThis.scrollX - startScrollX + (scrollContainer?.scrollLeft ?? 0) - startContainerScrollLeft;
      const scrollDeltaY = globalThis.scrollY - startScrollY;
      const deltaX = clientX - startX + scrollDeltaX;
      const deltaY = clientY - startY + scrollDeltaY;
      const rawOffset = {
        x: Math.round(startOffset.x + deltaX),
        y: Math.round(startOffset.y + deltaY),
      };
      const desiredPlacement = {
        colStart: Math.round((startLogicalLeftInGrid + deltaX) / columnStep) + 1,
        rowStart: Math.round((startLogicalTopInGrid + deltaY) / rowStep) + 1,
      };
      const resolvedPlacement = resolveMovePlacement(currentCells, cell, config, desiredPlacement, measuredCellHeightsRef.current);
      return {
        move: { id: cell.id, offset: rawOffset },
        placement: resolvedPlacement,
      };
    };

    const flushMove = () => {
      frame = 0;
      cellElement.style.setProperty("--osionos-layout-cell-offset-x", `${latestMove.offset.x}px`);
      cellElement.style.setProperty("--osionos-layout-cell-offset-y", `${latestMove.offset.y}px`);
      cellElement.dataset.layoutCellCollision = latestPlacement.collided ? "true" : "";
    };

    const queueMove = (move: LayoutMovePreview, placement: typeof latestPlacement) => {
      latestMove = move;
      latestPlacement = placement;
      if (frame) return;
      frame = requestAnimationFrame(flushMove);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      autoScroller.update(moveEvent.clientX, moveEvent.clientY);
      const next = moveFromPointer(moveEvent.clientX, moveEvent.clientY);
      queueMove(next.move, next.placement);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      const next = moveFromPointer(upEvent.clientX, upEvent.clientY);
      latestMove = next.move;
      latestPlacement = next.placement;
      if (frame) cancelAnimationFrame(frame);
      globalThis.removeEventListener("pointermove", handlePointerMove);
      globalThis.removeEventListener("pointerup", handlePointerUp);
      globalThis.removeEventListener("pointercancel", handlePointerUp);
      autoScroller.stop();
      releaseLayoutPointer(pointerTarget, pointerId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      cellElement.style.removeProperty("--osionos-layout-cell-offset-x");
      cellElement.style.removeProperty("--osionos-layout-cell-offset-y");
      delete cellElement.dataset.layoutCellCollision;
      setMovingCell(null);
      setAlignmentGuides(null);
      setInteractionMode(null);
      if (latestPlacement.collided) {
        setCollisionCellId(cell.id);
        return;
      }
      updateCell(cell.id, {
        colStart: latestPlacement.colStart,
        rowStart: latestPlacement.rowStart,
        offset: undefined,
      });
    };

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    selectCell(cell.id);
    setMovingCell(latestMove);
    setAlignmentGuides(null);
    setInteractionMode("move");
    autoScroller.update(event.clientX, event.clientY);
    globalThis.addEventListener("pointermove", handlePointerMove);
    globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
    globalThis.addEventListener("pointercancel", handlePointerUp, { once: true });
  }, [config, selectCell, updateCell]);

  const clearLayoutCollision = useCallback(() => setCollisionCellId(null), []);

  useLayoutDismissAndUndo({
    selectedCellId,
    interactionMode,
    layoutRootRef,
    selectCell,
    undoLayout,
    redoLayout,
    clearCollision: clearLayoutCollision,
  });

  const shouldShowGuides = !config.preview && config.guideVisibility !== "never";
  const modeClass = layoutMode === "full_page" ? "osionos-layout-block--full-page" : "osionos-layout-block--inline";
  const canvasActive = Boolean(selectedCellId || draggingCellId || resizingCell || movingCell);
  const layoutPanelKind = getLayoutPanelKind(settingsOpen, selectedCell, config.preview);
  const layoutPanelStyle = {
    "--osionos-layout-panel-width": `${layoutPanelKind ? LAYOUT_PANEL_WIDTHS[layoutPanelKind] : 0}px`,
  } as React.CSSProperties;
  const gridStyle: LayoutGridStyle = {
    width: config.wrap ? "100%" : `${Math.max(960, config.columns * CELL_MIN_CONTENT_WIDTH)}px`,
    gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
    gridAutoRows: `${config.rowHeight}px`,
    gap: `${config.gap}px`,
    "--osionos-layout-dot-size": "16px",
    "--osionos-layout-row-size": `${config.rowHeight + config.gap}px`,
  };

  return (
    <section
      ref={layoutRootRef}
      className={`osionos-layout-block ${modeClass}`}
      data-layout-mode={layoutMode}
      data-layout-panel-open={dataFlag(Boolean(layoutPanelKind))}
      data-layout-panel-kind={layoutPanelKind ?? undefined}
      style={layoutPanelStyle}
    >
      <div className="osionos-layout-shell">
        <button
          type="button"
          aria-label="Layout settings"
          title="Layout settings"
          className="osionos-layout-settings-tab"
          onClick={() => {
            setSelectedCellId(null);
            setSettingsOpen((value) => !value);
          }}
        >
          ⚙
        </button>

        <div className="osionos-layout-toolbar" aria-label="Layout tools">
          <button type="button" onClick={() => addCell()}>
            <Plus size={14} aria-hidden />
            <span>Add cell</span>
          </button>
          <button type="button" onClick={() => applyTemplate("dashboard")}>
            <Grid3X3 size={14} aria-hidden />
            <span>Dashboard</span>
          </button>
          <button type="button" onClick={() => selectCell(selectedCellId ?? cells[0]?.id ?? null)}>
            <SlidersHorizontal size={14} aria-hidden />
            <span>Inspector</span>
          </button>
          <button type="button" onClick={() => updateConfig({ guideVisibility: config.guideVisibility === "never" ? "auto" : "never" })}>
            <Grid3X3 size={14} aria-hidden />
            <span>{config.guideVisibility === "never" ? "Show grid" : "Hide grid"}</span>
          </button>
        </div>

        {settingsOpen ? (
          <aside className="osionos-layout-settings-panel" aria-label="Layout settings">
            <button
              type="button"
              className="osionos-layout-panel-close-tab"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close layout settings"
              title="Close panel"
            >
              <X size={14} aria-hidden />
            </button>
            <LayoutNumberControl label="Columns" value={config.columns} min={1} max={24} onChange={(columns) => updateConfig({ columns })} />
            <LayoutNumberControl label="Row height" value={config.rowHeight} min={96} max={320} suffix="px" onChange={(rowHeight) => updateConfig({ rowHeight })} />
            <LayoutNumberControl label="Gap" value={config.gap} min={0} max={48} suffix="px" onChange={(gap) => updateConfig({ gap })} />
            <LayoutToggle label="Wrap" checked={config.wrap} onChange={(wrap) => updateConfig({ wrap })} />
            <LayoutToggle label="Auto-arrange" checked={config.autoArrange} onChange={(autoArrange) => updateConfig({ autoArrange })} />
            <LayoutToggle label="Snap to grid" checked={config.snapToGrid} onChange={(snapToGrid) => updateConfig({ snapToGrid })} />
            <LayoutSegmented
              label="Guides"
              value={config.guideVisibility}
              options={["auto", "always", "never"]}
              onChange={(guideVisibility) => updateConfig({ guideVisibility })}
            />
            <LayoutSegmented
              label="Mode"
              value={config.preview ? "view" : "edit"}
              options={["edit", "view"]}
              onChange={(mode) => updateConfig({ preview: mode === "view" })}
            />
            <LayoutSegmented
              label="Canvas"
              value={layoutMode === "full_page" ? "full" : "inline"}
              options={["inline", "full"]}
              onChange={(mode) => {
                pushLayoutSnapshot();
                updateLayout({ layoutMode: mode === "full" ? "full_page" : "inline" });
              }}
            />
          </aside>
        ) : null}

        {selectedCell && !config.preview ? (
          <LayoutCellInspector
            cell={selectedCell}
            onUpdate={updateSelectedCell}
            onClose={() => selectCell(null)}
          />
        ) : null}

        <div className={config.wrap ? "overflow-x-hidden" : "overflow-x-auto pb-2"}>
          <div
            data-layout-grid={block.id}
            data-layout-guides={dataFlag(shouldShowGuides)}
            data-canvas-active={dataFlag(canvasActive)}
            data-layout-interacting={dataFlag(Boolean(interactionMode))}
            data-layout-interaction-mode={interactionMode ?? undefined}
            className="osionos-layout-grid"
            onPointerDownCapture={(event) => {
              const target = event.target as HTMLElement | null;
              if (target?.closest("[data-layout-cell-id], .osionos-layout-empty-state")) return;
              selectCell(null);
            }}
            style={gridStyle}
          >
            <LayoutAlignmentGuidesLayer guides={alignmentGuides} />

            {resolvedCells.length === 0 ? (
              <LayoutEmptyState onAdd={() => addCell()} onTemplate={applyTemplate} />
            ) : null}

            {resolvedCells.map((cell) => (
              <LayoutCellView
                key={cell.id}
                cell={cell}
                config={config}
                pageId={pageId}
                layoutBlockId={block.id}
                isSelected={selectedCellId === cell.id}
                isDragging={draggingCellId === cell.id}
                isDropTarget={cellDropTargetId === cell.id}
                isCollision={collisionCellId === cell.id}
                resizePreview={resizingCell?.id === cell.id ? resizingCell : null}
                movePreview={movingCell?.id === cell.id ? movingCell : null}
                draggingCellId={draggingCellId}
                hasHeavyContent={layoutCellHasHeavyBlocks(cell.blocks)}
                renderBlockEditor={renderBlockEditor}
                onFocusCell={selectCell}
                onPreviewDrop={previewCellDrop}
                onClearDropTarget={() => setCellDropTargetId(null)}
                onReorderByDrop={reorderCellByDrop}
                onDragStart={(cellId) => {
                  setDraggingCellId(cellId);
                  setInteractionMode("drag");
                }}
                onDragEnd={() => {
                  setDraggingCellId(null);
                  setCellDropTargetId(null);
                  setInteractionMode(null);
                }}
                onRenameCell={(cellId, label) => updateCell(cellId, { label })}
                onAddCell={() => addCell()}
                onInspectCell={selectCell}
                onDuplicateCell={duplicateCell}
                onDeleteCell={removeCell}
                onStartResize={startResize}
                onStartMove={startMove}
                onMeasureCell={updateMeasuredCellHeight}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const LayoutBlockEditorV2Bridge: React.FC<LayoutBlockEditorProps> = (props) => {
  const { block, onUpdateBlock } = props;
  const persist = useCallback<CanvasPersistHandler>(
    (layoutBlockId, patch) => onUpdateBlock?.(layoutBlockId, patch),
    [onUpdateBlock],
  );
  useCanvasStoreBridge(block.id, block, onUpdateBlock ? persist : undefined);
  return <LayoutBlockEditorLegacy {...props} />;
};

export const LayoutBlockEditor: React.FC<LayoutBlockEditorProps> = (props) => {
  if (isCanvasV2Enabled()) return <LayoutBlockEditorV2Bridge {...props} />;
  return <LayoutBlockEditorLegacy {...props} />;
};

const LayoutAlignmentGuidesLayer: React.FC<{ guides: LayoutAlignmentGuides | null }> = ({ guides }) => (
  <>
    {typeof guides?.x === "number" ? (
      <div className="osionos-layout-alignment-guide osionos-layout-alignment-guide--x" style={{ left: `${guides.x}px` }} />
    ) : null}
    {typeof guides?.y === "number" ? (
      <div className="osionos-layout-alignment-guide osionos-layout-alignment-guide--y" style={{ top: `${guides.y}px` }} />
    ) : null}
  </>
);

interface LayoutCellViewProps {
  cell: LayoutCell;
  config: LayoutConfig;
  pageId: string;
  layoutBlockId: string;
  isSelected: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  isCollision: boolean;
  resizePreview: LayoutResizePreview | null;
  movePreview: LayoutMovePreview | null;
  draggingCellId: string | null;
  hasHeavyContent: boolean;
  renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
  onFocusCell: (cellId: string) => void;
  onPreviewDrop: (draggedCellId: string, targetCellId: string) => void;
  onClearDropTarget: () => void;
  onReorderByDrop: (draggedCellId: string, targetCellId: string) => void;
  onDragStart: (cellId: string) => void;
  onDragEnd: () => void;
  onRenameCell: (cellId: string, label: string) => void;
  onAddCell: () => void;
  onInspectCell: (cellId: string) => void;
  onDuplicateCell: (cellId: string) => void;
  onDeleteCell: (cellId: string) => void;
  onStartResize: (event: React.PointerEvent<HTMLElement>, cell: LayoutCell, edge: LayoutResizeEdge) => void;
  onStartMove: (event: React.PointerEvent<HTMLElement>, cell: LayoutCell) => void;
  onMeasureCell: (cellId: string, height: number | null) => void;
}

function layoutCellViewPropsEqual(left: LayoutCellViewProps, right: LayoutCellViewProps): boolean {
  return layoutCellShellEqual(left.cell, right.cell) &&
    left.config.preview === right.config.preview &&
    left.config.rowHeight === right.config.rowHeight &&
    left.config.gap === right.config.gap &&
    left.pageId === right.pageId &&
    left.layoutBlockId === right.layoutBlockId &&
    left.isSelected === right.isSelected &&
    left.isDragging === right.isDragging &&
    left.isDropTarget === right.isDropTarget &&
    left.isCollision === right.isCollision &&
    left.hasHeavyContent === right.hasHeavyContent &&
    resizePreviewEqual(left.resizePreview, right.resizePreview) &&
    movePreviewEqual(left.movePreview, right.movePreview);
}

const LayoutCellViewComponent: React.FC<LayoutCellViewProps> = ({
  cell,
  config,
  pageId,
  layoutBlockId,
  isSelected,
  isDragging,
  isDropTarget,
  isCollision,
  resizePreview,
  movePreview,
  draggingCellId,
  hasHeavyContent,
  renderBlockEditor,
  onFocusCell,
  onPreviewDrop,
  onClearDropTarget,
  onReorderByDrop,
  onDragStart,
  onDragEnd,
  onRenameCell,
  onAddCell,
  onInspectCell,
  onDuplicateCell,
  onDeleteCell,
  onStartResize,
  onStartMove,
  onMeasureCell,
}) => {
  const cellRef = useRef<HTMLElement | null>(null);
  const liveCell = resizePreview ?? cell;
  const visualResize = resizePreview?.visual;
  const liveOffset = visualResize ?? movePreview?.offset ?? cell.offset;
  const cellMinHeight = visualResize?.height ?? liveCell.rowSpan * config.rowHeight + Math.max(0, liveCell.rowSpan - 1) * config.gap;
  const usesContentHeight = layoutCellUsesContentHeight(cell);
  const source = useMemo(
    () => ({ kind: "cell" as const, pageId, layoutBlockId, cellId: cell.id }),
    [cell.id, layoutBlockId, pageId],
  );
  const databasePreview = useMemo(() => layoutCellDatabasePreview(cell.blocks), [cell.blocks]);
  const cellStyle = useMemo(() => ({
    gridColumn: `${cell.colStart} / span ${cell.colSpan}`,
    gridRow: `${cell.rowStart} / span ${cell.rowSpan}`,
    color: cell.textColor,
    backgroundColor: cell.backgroundColor,
    "--osionos-layout-cell-min-height": `${cellMinHeight}px`,
    "--osionos-layout-cell-offset-x": `${liveOffset?.x ?? 0}px`,
    "--osionos-layout-cell-offset-y": `${liveOffset?.y ?? 0}px`,
    ...(visualResize ? {
      "--osionos-layout-cell-preview-width": `${visualResize.width}px`,
      "--osionos-layout-cell-preview-height": `${visualResize.height}px`,
    } : null),
  }) as React.CSSProperties, [cell.backgroundColor, cell.colSpan, cell.colStart, cell.rowSpan, cell.rowStart, cell.textColor, cellMinHeight, liveOffset, visualResize]);

  const handlePointerDownCapture = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (config.preview || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest(".osionos-layout-cell-editor, .osionos-layout-cell-drag, .osionos-layout-cell-menu")) {
      const edge = resizeEdgeFromPoint(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY);
      if (edge) {
        onStartResize(event, cell, edge);
        return;
      }
    }
    if (isInteractiveLayoutPointerTarget(event.target)) return;
    onFocusCell(cell.id);
  }, [cell, config.preview, onFocusCell, onStartResize]);

  useEffect(() => {
    if (!usesContentHeight) {
      onMeasureCell(cell.id, null);
      return undefined;
    }

    const cellElement = cellRef.current;
    if (!cellElement) return undefined;

    const measureTarget = cellElement.querySelector<HTMLElement>(".osionos-layout-cell-editor") ?? cellElement;
    const measure = () => onMeasureCell(cell.id, Math.max(measureTarget.scrollHeight, measureTarget.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === "undefined") return () => onMeasureCell(cell.id, null);

    const observer = new ResizeObserver(measure);
    observer.observe(measureTarget);
    return () => {
      observer.disconnect();
      onMeasureCell(cell.id, null);
    };
  }, [cell.id, onMeasureCell, usesContentHeight]);

  return (
    <section
      ref={cellRef}
      aria-label={cell.label || "Layout cell"}
      className="osionos-layout-cell group/cell"
      data-layout-cell-id={cell.id}
      data-layout-cell-selected={dataFlag(isSelected)}
      data-layout-cell-dragging={dataFlag(isDragging)}
      data-layout-cell-drop-target={dataFlag(isDropTarget)}
      data-layout-cell-collision={dataFlag(isCollision)}
      data-layout-cell-moving={dataFlag(movePreview?.id === cell.id)}
      data-layout-cell-resizing={dataFlag(Boolean(resizePreview))}
      data-layout-cell-heavy={dataFlag(hasHeavyContent)}
      data-layout-sizing={cell.sizing ?? "fixed"}
      data-layout-wrap={cell.wrap === false ? "false" : "true"}
      data-layout-padding={cell.padding ?? "comfortable"}
      data-layout-font-size={cell.fontSize ?? "base"}
      style={cellStyle}
      onFocusCapture={() => onFocusCell(cell.id)}
      onPointerDownCapture={handlePointerDownCapture}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(LAYOUT_CELL_DND_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        const draggedId = event.dataTransfer.getData(LAYOUT_CELL_DND_TYPE) || draggingCellId;
        if (draggedId) onPreviewDrop(draggedId, cell.id);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) onClearDropTarget();
      }}
      onDrop={(event) => {
        const draggedId = event.dataTransfer.getData(LAYOUT_CELL_DND_TYPE);
        if (!draggedId) return;
        event.preventDefault();
        event.stopPropagation();
        onReorderByDrop(draggedId, cell.id);
        onDragEnd();
      }}
    >
      {config.preview ? null : (
        <LayoutCellHandleBar
          cell={cell}
          liveSize={resizePreview}
          onDragStart={() => onDragStart(cell.id)}
          onDragEnd={onDragEnd}
          onMoveStart={(event) => onStartMove(event, cell)}
          onRename={(label) => onRenameCell(cell.id, label)}
          onAddCell={onAddCell}
          onInspect={() => onInspectCell(cell.id)}
          onDuplicate={() => onDuplicateCell(cell.id)}
          onDelete={() => onDeleteCell(cell.id)}
        />
      )}
      <div className="osionos-layout-cell-editor">
        <LazyLayoutCellSurface
          pageId={pageId}
          source={source}
          locked={config.preview || cell.type === "spacer"}
          deferMount={hasHeavyContent}
          databasePreview={databasePreview}
          renderBlockEditor={renderBlockEditor}
        />
      </div>
      {config.preview ? null : <LayoutResizeOverlay cell={cell} onStartResize={onStartResize} />}
    </section>
  );
};

const LayoutCellView = React.memo(LayoutCellViewComponent, layoutCellViewPropsEqual);

LayoutCellView.displayName = "LayoutCellView";

const LazyLayoutCellSurface: React.FC<{
  pageId: string;
  source: { kind: "cell"; pageId: string; layoutBlockId: string; cellId: string };
  locked: boolean;
  deferMount: boolean;
  databasePreview: LayoutDatabasePreview | null;
  renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
}> = ({ pageId, source, locked, deferMount, databasePreview, renderBlockEditor }) => {
  const canUseIntersectionObserver = typeof IntersectionObserver !== "undefined";
  const [shouldMount, setShouldMount] = useState(false);
  const hasMountedRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const shouldRenderSurface = !deferMount || shouldMount || !canUseIntersectionObserver;

  // Ref-callback instead of useEffect — the observer attaches when the DOM
  // node is first mounted and detaches when it is unmounted. This sidesteps
  // the react-doctor/no-adjust-state-on-prop-change false positive that fires
  // on `setShouldMount(true)` being called inside a useEffect with prop deps,
  // while still preserving deferred mount semantics.
  const handleRootRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      observerRef.current?.disconnect();
      observerRef.current = null;
      return;
    }
    if (!deferMount || !canUseIntersectionObserver || hasMountedRef.current) return;

    observerRef.current?.disconnect();
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        hasMountedRef.current = true;
        setShouldMount(true);
        observer.disconnect();
      }
    }, { rootMargin: "360px 0px 360px 0px" });
    observer.observe(node);
    observerRef.current = observer;
  }, [canUseIntersectionObserver, deferMount]);

  return (
    <div ref={handleRootRef} className="osionos-layout-cell-surface-anchor">
      {shouldRenderSurface ? (
        <BlockEditorSurface
          pageId={pageId}
          source={source}
          locked={locked}
          compact
          emptyPlaceholder="Type / for blocks, [[ for pages…"
          renderBlockEditor={renderBlockEditor}
        />
      ) : (
        <div
          className={databasePreview ? "osionos-layout-cell-deferred osionos-database-block osionos-database-block--deferred" : "osionos-layout-cell-deferred"}
          data-database-id={databasePreview?.databaseId}
          data-database-view-id={databasePreview?.viewId}
          data-database-deferred={dataFlag(Boolean(databasePreview))}
          aria-hidden
        />
      )}
    </div>
  );
};

const LayoutResizeOverlay: React.FC<{
  cell: LayoutCell;
  onStartResize: (event: React.PointerEvent<HTMLElement>, cell: LayoutCell, edge: LayoutResizeEdge) => void;
}> = ({ cell, onStartResize }) => (
  <>
    <svg className="osionos-layout-resize-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden focusable="false">
      <rect className="osionos-layout-resize-outline" x="1" y="1" width="98" height="98" rx="2" vectorEffect="non-scaling-stroke" />
      <path className="osionos-layout-resize-corners" d="M1 16V1h16M83 1h16v16M99 83v16H83M17 99H1V83" vectorEffect="non-scaling-stroke" />
    </svg>
    {LAYOUT_RESIZE_EDGES.map((edge) => (
      <button
        key={edge}
        type="button"
        className={`osionos-layout-resize-hit osionos-layout-resize-hit--${edge}`}
        data-layout-resize-handle
        aria-label={`Resize cell ${edge}`}
        title={`Resize ${edge}`}
        onPointerDown={(event) => onStartResize(event, cell, edge)}
      />
    ))}
  </>
);

const LayoutNumberControl: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, suffix, onChange }) => (
  <label className="osionos-layout-control-row">
    <span>{label}</span>
    <span className="osionos-layout-number-input">
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {suffix ? <span>{suffix}</span> : null}
    </span>
  </label>
);

const LayoutToggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="osionos-layout-control-row">
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>
);

const LayoutSegmented = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) => (
  <div className="osionos-layout-control-row osionos-layout-control-row--stacked">
    <span>{label}</span>
    <div className="osionos-layout-segmented">
      {options.map((option) => (
        <button key={option} type="button" data-active={option === value ? "true" : undefined} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  </div>
);

const LayoutEmptyState: React.FC<{
  onAdd: () => void;
  onTemplate: (template: "dashboard" | "tracker" | "notes" | "kanban") => void;
}> = ({ onAdd, onTemplate }) => (
  <div className="osionos-layout-empty-state">
    <div className="text-3xl" aria-hidden>▦</div>
    <p className="text-sm font-medium text-[var(--osio-fg-default)]">Add cells to your layout</p>
    <div className="flex flex-wrap justify-center gap-2">
      <button type="button" onClick={onAdd}>+ Cell</button>
      <button type="button" onClick={() => onTemplate("dashboard")}>Use dashboard</button>
    </div>
    <div className="flex flex-wrap justify-center gap-1 text-xs text-[var(--osio-fg-subtle)]">
      <button type="button" onClick={() => onTemplate("kanban")}>Kanban</button>
      <span>·</span>
      <button type="button" onClick={() => onTemplate("tracker")}>Tracker</button>
      <span>·</span>
      <button type="button" onClick={() => onTemplate("notes")}>Two-column notes</button>
    </div>
  </div>
);

const LayoutCellInspector: React.FC<{
  cell: LayoutCell;
  onUpdate: (patch: Partial<LayoutCell>) => void;
  onClose: () => void;
}> = ({ cell, onUpdate, onClose }) => (
  <aside className="osionos-layout-cell-inspector" aria-label="Cell inspector">
    <div className="osionos-layout-inspector-header">
      <div>
        <p>Cell inspector</p>
        <span>{cell.label || "Untitled cell"}</span>
      </div>
      <button type="button" onClick={onClose} aria-label="Close cell inspector"><X size={14} aria-hidden /></button>
    </div>

    <LayoutSegmented<LayoutCellSizing>
      label="Auto-layout"
      value={cell.sizing ?? "fixed"}
      options={["fixed", "auto-height", "auto-width", "auto"]}
      onChange={(sizing) => onUpdate({ sizing })}
    />
    <LayoutSegmented<LayoutCellHorizontalConstraint>
      label="Width constraint"
      value={cell.horizontalConstraint ?? "stretch"}
      options={["left", "stretch", "scale"]}
      onChange={(horizontalConstraint) => onUpdate({ horizontalConstraint })}
    />
    <LayoutSegmented<LayoutCellVerticalConstraint>
      label="Height constraint"
      value={cell.verticalConstraint ?? "top"}
      options={["top", "stretch", "hug"]}
      onChange={(verticalConstraint) => onUpdate({ verticalConstraint })}
    />
    <LayoutToggle label="Wrap content" checked={cell.wrap !== false} onChange={(wrap) => onUpdate({ wrap })} />
    <LayoutSegmented<LayoutCellPadding>
      label="Padding"
      value={cell.padding ?? "comfortable"}
      options={["compact", "comfortable", "spacious"]}
      onChange={(padding) => onUpdate({ padding })}
    />
    <LayoutSegmented<LayoutCellFontSize>
      label="Text size"
      value={cell.fontSize ?? "base"}
      options={["small", "base", "large"]}
      onChange={(fontSize) => onUpdate({ fontSize })}
    />
    <LayoutNumberControl label="Column span" value={cell.colSpan} min={1} max={12} onChange={(colSpan) => onUpdate({ colSpan })} />
    <LayoutNumberControl label="Row span" value={cell.rowSpan} min={1} max={LAYOUT_CELL_ROW_SPAN_MAX} onChange={(rowSpan) => onUpdate({ rowSpan })} />
    <LayoutNumberControl
      label="Offset X"
      value={cell.offset?.x ?? 0}
      min={-2000}
      max={2000}
      suffix="px"
      onChange={(x) => onUpdate({ offset: normalizeLayoutOffset({ x, y: cell.offset?.y ?? 0 }) })}
    />
    <LayoutNumberControl
      label="Offset Y"
      value={cell.offset?.y ?? 0}
      min={-2000}
      max={2000}
      suffix="px"
      onChange={(y) => onUpdate({ offset: normalizeLayoutOffset({ x: cell.offset?.x ?? 0, y }) })}
    />

    <div className="osionos-layout-control-row osionos-layout-control-row--stacked">
      <span>Color</span>
      <div className="osionos-layout-swatches">
        {LAYOUT_CELL_COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch.label}
            type="button"
            aria-label={`${swatch.label} cell color`}
            title={swatch.label}
            className="osionos-layout-swatch"
            style={{ backgroundColor: swatch.backgroundColor }}
            onClick={() => onUpdate({ backgroundColor: swatch.backgroundColor, textColor: swatch.textColor })}
          />
        ))}
      </div>
    </div>
  </aside>
);

const LayoutCellHandleBar: React.FC<{
  cell: LayoutCell;
  liveSize: LayoutResizePreview | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMoveStart: (event: React.PointerEvent<HTMLElement>) => void;
  onRename: (label: string) => void;
  onAddCell: () => void;
  onInspect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}> = ({ cell, liveSize, onDragStart, onDragEnd, onMoveStart, onRename, onAddCell, onInspect, onDuplicate, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState(cell.label ?? "");
  const size = liveSize ?? cell;

  return (
    <div className="osionos-layout-cell-handle" data-layout-cell-handle>
      <button
        type="button"
        draggable={false}
        className="osionos-layout-cell-drag"
        title="Move cell"
        aria-label="Drag cell"
        onPointerDown={onMoveStart}
        onDragStart={(event) => {
          event.dataTransfer.setData(LAYOUT_CELL_DND_TYPE, cell.id);
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <span aria-hidden>⋮⋮</span>
      </button>
      <input
        value={labelDraft}
        onChange={(event) => setLabelDraft(event.target.value)}
        onBlur={() => onRename(labelDraft.trim())}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            event.currentTarget.closest<HTMLElement>("[data-layout-cell-id]")?.querySelector<HTMLElement>('[contenteditable="true"], textarea')?.focus();
          }
        }}
        placeholder="Untitled cell"
        aria-label="Cell title"
        name="cell-title"
        autoComplete="off"
      />
      <span className="osionos-layout-size-badge">⤢ {size.colSpan}×{size.rowSpan}</span>
      <div className="relative">
        <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="Cell menu" title="Cell menu">⋯</button>
        {menuOpen ? (
          <div className="osionos-layout-cell-menu">
            <button type="button" onClick={() => { onAddCell(); setMenuOpen(false); }}>Add cell</button>
            <button type="button" onClick={() => { onInspect(); setMenuOpen(false); }}>Inspect</button>
            <button type="button" onClick={() => { onDuplicate(); setMenuOpen(false); }}>Duplicate</button>
            <button type="button" onClick={() => { onDelete(); setMenuOpen(false); }}>Delete</button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
