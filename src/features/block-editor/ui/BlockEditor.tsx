/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockEditor.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 05:16:36 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Copy, Grid3X3, Plus, SlidersHorizontal, X } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";
import katex from "katex";
import "katex/dist/katex.min.css";

import { EditableContent } from "@/components/blocks/EditableContent";
import { DatabaseBlock } from "@/widgets/database-view/ui/DatabaseBlock";
import { createViewShowcaseCells } from "@/widgets/database-view/model/databaseViewCatalog";
import {
  getBlockPlaceholder,
  type Block,
} from "@/entities/block";

import { usePageStore } from "@/store/usePageStore";
import { MermaidDiagram, CodeSyntaxHighlight, EmojiPicker } from "@/shared/ui";
import { getNumberedMarker, getBulletMarker } from "@/entities/block/model/listMarkers";
import { MediaBlockEditor } from "./MediaBlockEditor";
import { TodoBlockEditor } from "./TodoBlockEditor";
import { ToggleBlockEditor } from "./ToggleBlockEditor";
import { getBlockSurfaceStyle, getBlockTextStyle } from "../model/blockColors";
import { BlockEditorSurface, type SurfaceBlockEditorProps } from "./BlockEditorSurface";

const LANGUAGES = [
  "plaintext",
  "javascript",
  "typescript",
  "python",
  "rust",
  "cpp",
  "c",
  "java",
  "go",
  "html",
  "css",
  "json",
  "yaml",
  "markdown",
  "bash",
  "sql",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "lua",
  "toml",
  "mermaid",
];

function renderEquationToHtml(source: string): string {
  try {
    return katex.renderToString(source || "E = mc^2", {
      displayMode: true,
      throwOnError: false,
      strict: "ignore",
    });
  } catch {
    return katex.renderToString(String.raw`\text{Invalid equation}`, {
      displayMode: true,
      throwOnError: false,
    });
  }
}



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
    rowSpan: clampNumber(cell.rowSpan, Math.max(1, Math.ceil(CELL_MIN_ROW_HEIGHT / config.rowHeight)), LAYOUT_CONFIG_LIMITS.rows[1], 1),
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

function cellsOverlap(left: LayoutCell, right: LayoutCell): boolean {
  return !(
    left.colStart + left.colSpan <= right.colStart ||
    right.colStart + right.colSpan <= left.colStart ||
    left.rowStart + left.rowSpan <= right.rowStart ||
    right.rowStart + right.rowSpan <= left.rowStart
  );
}

function findLayoutPlacement(
  placedCells: LayoutCell[],
  config: LayoutConfig,
  colSpan: number,
  rowSpan: number,
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
      if (placedCells.every((cell) => !cellsOverlap(candidate, cell))) {
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

function hasLayoutCellCollision(cells: LayoutCell[]): boolean {
  return cells.some((cell, index) => cells.slice(index + 1).some((candidate) => cellsOverlap(cell, candidate)));
}

function layoutCellOverlapsAny(cell: LayoutCell, cells: LayoutCell[]): boolean {
  return cells.some((candidate) => candidate.id !== cell.id && cellsOverlap(cell, candidate));
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
): Pick<LayoutCell, "colStart" | "rowStart"> & { collided: boolean } {
  const desired = normalizeMovePlacement(movingCell, config, desiredPlacement);
  const desiredCell = { ...movingCell, ...desired, offset: undefined };
  if (!layoutCellOverlapsAny(desiredCell, cells)) return { ...desired, collided: false };
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

function applyCollisionPolicy(cells: LayoutCell[], config: LayoutConfig, fallbackCells: LayoutCell[]): LayoutCell[] {
  const normalizedCells = cells.map((cell) => clampLayoutCell(cell, config));
  if (config.autoArrange) return packLayoutCells(normalizedCells, config);
  return hasLayoutCellCollision(normalizedCells) ? fallbackCells : normalizedCells;
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

interface BlockEditorProps {
  pageId: string;
  block: Block;
  numberedIndex: number;
  numberedDepth: number;
  bulletDepth: number;
  isSelected?: boolean;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  onDeleteCodeBlock?: () => void;
  onUpdateBlock?: (blockId: string, updates: Partial<Block>) => void;
  onRequestSlashMenu?: (position: { x: number; y: number }) => void;
  renderChildren?: () => React.ReactNode;
  focusBlock: (blockId: string, cursorEnd?: boolean) => void;
}

export const BlockEditor: React.FC<BlockEditorProps> = ({
  pageId,
  block,
  numberedIndex,
  numberedDepth,
  bulletDepth,
  isSelected = false,
  onChange,
  onKeyDown,
  onPaste,
  onDeleteCodeBlock,
  onUpdateBlock,
  focusBlock,
  onRequestSlashMenu,
  renderChildren,
}) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showCalloutIconPicker, setShowCalloutIconPicker] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isEquationEditing, setIsEquationEditing] = useState(false);
  const equationTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const langPickerRef = useRef<HTMLDivElement | null>(null);
  const editableStyle = useMemo(
    () => getBlockTextStyle(block),
    [block],
  );
  const surfaceStyle = useMemo(
    () => getBlockSurfaceStyle(block),
    [block],
  );
  const isMermaidCode =
    block.type === "code" &&
    (block.language || "plaintext").trim().toLowerCase() === "mermaid";
  const codeCaretColor = editableStyle?.color ?? "var(--osio-fg-default)";

  const commitBlockUpdate = useCallback(
    (blockId: string, updates: Partial<Block>) => {
      if (onUpdateBlock) {
        onUpdateBlock(blockId, updates);
        return;
      }

      updateBlock(pageId, blockId, updates);
    },
    [onUpdateBlock, pageId, updateBlock],
  );

  const handleLangSelect = useCallback(
    (language: string) => {
      commitBlockUpdate(block.id, { language });
      setShowLangPicker(false);
    },
    [commitBlockUpdate, block.id],
  );

  const handleCodeTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = e.currentTarget;
        const { selectionStart, selectionEnd, value } = ta;
        const indent = "    ";
        const next =
          value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart + indent.length;
        });
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const ta = e.currentTarget;
        const { selectionStart, selectionEnd, value } = ta;
        const next =
          value.slice(0, selectionStart) + "\n" + value.slice(selectionEnd);
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = selectionStart + 1;
        });
        return;
      }

      onKeyDown(e);
    },
    [onChange, onKeyDown],
  );

  const openEquationEditor = useCallback(() => {
    setIsEquationEditing(true);
    requestAnimationFrame(() => equationTextareaRef.current?.focus());
  }, []);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(block.content).then(() => {
      setCopiedCode(true);
      globalThis.setTimeout(() => setCopiedCode(false), 1200);
    }).catch(() => undefined);
  }, [block.content]);

  useEffect(() => {
    if (!showLangPicker) return;

    const handleOutside = (e: MouseEvent) => {
      if (
        langPickerRef.current &&
        !langPickerRef.current.contains(e.target as Node)
      ) {
        setShowLangPicker(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showLangPicker]);

  switch (block.type) {
    case "heading_1":
      return (
        <EditableContent
          content={block.content}
          className="text-2xl font-bold text-[var(--osio-fg-default)] mt-6 mb-1 leading-tight"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 1")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );
    case "heading_2":
      return (
        <EditableContent
          content={block.content}
          className="text-xl font-semibold text-[var(--osio-fg-default)] mt-5 mb-1 leading-tight"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 2")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );
    case "heading_3":
      return (
        <EditableContent
          content={block.content}
          className="text-lg font-semibold text-[var(--osio-fg-default)] mt-4 mb-0.5 leading-snug"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 3")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "heading_4":
      return (
        <EditableContent
          content={block.content}
          className="text-base font-semibold text-[var(--osio-fg-default)] mt-3 mb-0.5 leading-snug"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 4")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "heading_5":
      return (
        <EditableContent
          content={block.content}
          className="text-sm font-semibold text-[var(--osio-fg-default)] mt-2 mb-0.5 leading-snug"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 5")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "heading_6":
      return (
        <EditableContent
          content={block.content}
          className="text-xs font-semibold text-[var(--osio-fg-muted)] mt-2 mb-0.5 leading-snug tracking-wide"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Heading 6")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "paragraph":
      return (
        <EditableContent
          content={block.content}
          className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 min-h-[1.5em]"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Type '/' for commands…")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );

    case "bulleted_list": {
      const bulletStyle = getBulletMarker(bulletDepth);
      return (
        <div className="flex items-start gap-2 pl-5">
          <span className="text-sm leading-relaxed py-0.5 select-none shrink-0 w-6 text-center">
            {bulletStyle === "disc" && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--osio-fg-subtle)] mt-[7px]" />
            )}
            {bulletStyle === "circle" && (
              <span className="inline-block w-1.5 h-1.5 rounded-full border border-[var(--osio-fg-subtle)] mt-[7px]" />
            )}
            {bulletStyle === "square" && (
              <span className="inline-block w-1.5 h-1.5 bg-[var(--osio-fg-subtle)] mt-[7px]" />
            )}
          </span>
          <div className="flex-1">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 whitespace-pre-wrap"
              style={editableStyle}
              placeholder={getBlockPlaceholder(block, "List item")}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onRequestSlashMenu={onRequestSlashMenu}
              pageId={pageId}
            />
          </div>
        </div>
      );
    }

    case "numbered_list":
      return (
        <div className="flex items-start gap-2 pl-5">
          <span className="text-sm leading-relaxed py-0.5 text-[var(--osio-fg-muted)] select-none shrink-0 w-6 text-center font-medium">
            {getNumberedMarker(numberedIndex, numberedDepth)}
          </span>
          <div className="flex-1">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 whitespace-pre-wrap"
              style={editableStyle}
              placeholder={getBlockPlaceholder(block, "List item")}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onRequestSlashMenu={onRequestSlashMenu}
              pageId={pageId}
            />
          </div>
        </div>
      );

    case "to_do":
      return (
        <TodoBlockEditor
          block={block}
          pageId={pageId}
          style={editableStyle}
          onUpdateBlock={commitBlockUpdate}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onRequestSlashMenu={onRequestSlashMenu}
        />
      );

    case "toggle":
      return (
        <ToggleBlockEditor
          block={block}
          pageId={pageId}
          style={editableStyle}
          onUpdateBlock={commitBlockUpdate}
          onChange={onChange}
          onKeyDown={onKeyDown}
          focusBlock={focusBlock}
          onRequestSlashMenu={onRequestSlashMenu}
        />
      );

    case "column_list":
      return (
        <div className="my-1 rounded-lg border border-dashed border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-2">
          {renderChildren?.() ?? (
            <span className="text-xs text-[var(--osio-fg-subtle)]">Columns</span>
          )}
        </div>
      );

    case "column":
      return (
        <div className="min-h-10 rounded-md border border-dashed border-[var(--osio-border-default)] px-2 py-1">
          {renderChildren?.() ?? (
            <span className="text-xs text-[var(--osio-fg-subtle)]">Empty column</span>
          )}
        </div>
      );

    case "image":
    case "video":
    case "audio":
    case "file":
      return (
        <MediaBlockEditor
          pageId={pageId}
          block={block}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
      );

    case "code":
      return (
        <div
          className="my-2 overflow-visible rounded-md border border-[var(--osio-border-default)] shadow-sm"
          style={surfaceStyle}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--osio-border-default)] bg-black/[0.03] px-3 py-1.5">
            <div ref={langPickerRef} className="relative">
              <button
                type="button"
                onClick={() => setShowLangPicker((v) => !v)}
                className="rounded px-1.5 py-0.5 font-mono text-xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
              >
                {block.language || "plaintext"}
              </button>
              {showLangPicker && (
                <div className="absolute top-full left-0 mt-1 bg-[var(--osio-bg-surface)] border border-[var(--osio-border-default)] rounded-lg shadow-lg z-[var(--osio-z-popover)] max-h-48 overflow-y-auto w-40">
                  {LANGUAGES.map((language) => (
                    <button
                      key={language}
                      type="button"
                      onClick={() => handleLangSelect(language)}
                      className={[
                        "w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-[var(--osio-bg-hover)]",
                        language === (block.language || "plaintext")
                          ? "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]"
                          : "text-[var(--osio-fg-muted)]",
                      ].join(" ")}
                    >
                      {language}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              title="Copy code"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
              onClick={handleCopyCode}
            >
              {copiedCode ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div className="p-0">
            <div className="relative min-h-[150px] overflow-hidden">
              <CodeSyntaxHighlight
                code={block.content || " "}
                language={block.language}
                className="pointer-events-none min-h-[150px] overflow-hidden p-3"
                codeClassName="block min-h-[150px] whitespace-pre-wrap break-words font-mono text-sm leading-6"
              />
              <textarea
                value={block.content}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleCodeTextareaKeyDown}
                placeholder={getBlockPlaceholder(block, "Code…")}
                spellCheck={false}
                className="absolute inset-0 h-full min-h-[150px] w-full resize-y overflow-auto bg-transparent p-3 font-mono text-sm leading-6 text-transparent outline-none selection:bg-[rgba(35,131,226,0.28)] placeholder:text-[var(--osio-fg-subtle)]"
                style={{
                  tabSize: 2,
                  color: "transparent",
                  caretColor: codeCaretColor,
                  WebkitTextFillColor: "transparent",
                }}
              />
            </div>
            {isMermaidCode && block.content.trim() && (
              <div className="mt-3 pt-3 border-t border-[var(--osio-border-default)]">
                <p className="mb-2 font-mono text-xs text-[var(--osio-fg-muted)]">
                  Mermaid preview
                </p>
                <MermaidDiagram
                  chart={block.content}
                  className="rounded-md border border-[var(--osio-border-default)] p-3 bg-[var(--osio-bg-subtle)] overflow-x-auto"
                />
              </div>
            )}
          </div>
        </div>
      );

    case "quote":
      return (
        <div className="flex my-0.5 rounded-md px-1">
          <div className="w-1 bg-[var(--osio-fg-default)] rounded-full shrink-0 mr-3" style={editableStyle} />
          <div className="flex-1 min-w-0">
            <EditableContent
              content={block.content}
              className="text-sm text-[var(--osio-fg-muted)] leading-relaxed py-0.5 italic"
              style={editableStyle}
              placeholder="Quote…"
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onRequestSlashMenu={onRequestSlashMenu}
            />
            {renderChildren?.()}
          </div>
        </div>
      );

    case "callout": {
      const icon = block.color || "💡";
      return (
        <div
          className="my-0.5 flex items-start gap-3 rounded-lg border border-[var(--osio-border-default)] p-3"
          style={surfaceStyle}
        >
          <div className="relative shrink-0">
            <button
              type="button"
              className="inline-flex cursor-pointer items-center justify-center rounded text-[var(--osio-fg-default)]"
              aria-label="Change callout icon"
              title="Change callout icon"
              onClick={() => setShowCalloutIconPicker((prev) => !prev)}
            >
              <AssetRenderer value={icon} size={20} />
            </button>
            {showCalloutIconPicker && (
              <EmojiPicker
                current={icon}
                onSelect={(nextIcon) => {
                  commitBlockUpdate(block.id, { color: nextIcon });
                }}
                onRemove={() => {
                  commitBlockUpdate(block.id, { color: "💡" });
                }}
                onClose={() => setShowCalloutIconPicker(false)}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <EditableContent
              content={block.content}
              className="py-0.5 text-sm leading-relaxed text-[var(--osio-fg-default)]"
              style={editableStyle}
              placeholder={getBlockPlaceholder(block, "Type '/' for commands…")}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onRequestSlashMenu={onRequestSlashMenu}
            />
            {renderChildren?.()}
          </div>
        </div>
      );
    }
    case "equation": {
      const equationHtml = renderEquationToHtml(block.content.trim());
      const shouldEditEquation = isSelected || isEquationEditing;

      return (
        <div
          className="relative my-2 rounded-lg border border-[var(--osio-border-default)] p-3"
          style={surfaceStyle}
        >
          {shouldEditEquation ? null : (
            <button
              type="button"
              aria-label="Edit equation"
              className="absolute inset-0 z-[var(--osio-z-raised)] cursor-text rounded-lg bg-transparent"
              onClick={openEquationEditor}
            />
          )}
          <div
            className="overflow-x-auto text-[var(--osio-fg-default)]"
            style={editableStyle}
            dangerouslySetInnerHTML={{ __html: equationHtml }}
          />
          {shouldEditEquation ? (
            <textarea
              ref={equationTextareaRef}
              value={block.content}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onFocus={() => setIsEquationEditing(true)}
              onBlur={() => setIsEquationEditing(false)}
              placeholder="Write LaTeX, e.g. E = mc^2"
              className="mt-2 min-h-[56px] w-full resize-y rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-2 font-mono text-xs text-[var(--osio-fg-default)] outline-none focus:border-[var(--osio-accent)]"
              style={editableStyle}
            />
          ) : null}
        </div>
      );
    }

    case "layout":
      return <LayoutBlockEditor block={block} pageId={pageId} onUpdateBlock={commitBlockUpdate} />;

    case "divider":
      return (
        <button
          type="button"
          className="w-full py-2 rounded outline-none focus:bg-[var(--osio-bg-subtle)]"
          onKeyDown={(e) => {
            onKeyDown(e);
          }}
          aria-label="Divider block"
        >
          <hr className="w-full h-px border-0 bg-[var(--osio-fg-subtle)]" />
        </button>
      );

    case "table_block":
      return (
        <div // NOSONAR - keyboard navigation wrapper for non-editable block
          onKeyDown={(e) => {
            if (
              e.key === "ArrowUp" ||
              e.key === "ArrowDown" ||
              e.key === "Backspace" ||
              e.key === "Delete" ||
              e.key === "Enter" ||
              e.key === "Escape"
            ) {
              onKeyDown(e);
            }
          }}
          tabIndex={-1}
          aria-label="Table block"
        >
          <TableBlockEditor
            block={block}
            pageId={pageId}
            style={editableStyle}
            textStyle={editableStyle}
            onDeleteTable={onDeleteCodeBlock}
          />
        </div>
      );

    case "database_inline":
      return (
        <div // NOSONAR - keyboard navigation wrapper for non-editable block
          onKeyDown={(e) => {
            if (
              e.key === "ArrowUp" ||
              e.key === "ArrowDown" ||
              e.key === "Backspace" ||
              e.key === "Delete" ||
              e.key === "Enter" ||
              e.key === "Escape"
            ) {
              onKeyDown(e);
            }
          }}
          tabIndex={-1}
          aria-label="Database block"
        >
          <DatabaseBlock
            databaseId={block.databaseId}
            initialViewId={block.viewId}
            mode="inline"
          />
        </div>
      );

    case "database_full_page":
      return (
        <div // NOSONAR - keyboard navigation wrapper for non-editable block
          onKeyDown={(e) => {
            if (
              e.key === "ArrowUp" ||
              e.key === "ArrowDown" ||
              e.key === "Backspace" ||
              e.key === "Delete" ||
              e.key === "Enter" ||
              e.key === "Escape"
            ) {
              onKeyDown(e);
            }
          }}
          tabIndex={-1}
          aria-label="Full-page database block"
          className="my-3 min-h-[520px] overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]"
        >
          <DatabaseBlock
            databaseId={block.databaseId}
            initialViewId={block.viewId}
            mode="full"
          />
        </div>
      );

    default:
      return (
        <EditableContent
          content={block.content}
          className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5"
          style={editableStyle}
          placeholder={getBlockPlaceholder(block, "Type something…")}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onRequestSlashMenu={onRequestSlashMenu}
          pageId={pageId}
        />
      );
  }
};

const TableBlockEditor: React.FC<{
  block: Block;
  pageId: string;
  style?: React.CSSProperties;
  textStyle?: React.CSSProperties;
  onDeleteTable?: () => void;
}> = ({ block, pageId, style, textStyle, onDeleteTable }) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    row: number;
    col: number;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const data = useMemo(
    () =>
      block.tableData || [
        ["", "", ""],
        ["", "", ""],
        ["", "", ""],
      ],
    [block.tableData],
  );

  const handleCellChange = useCallback(
    (row: number, col: number, value: string) => {
      const next = data.map((r, ri) =>
        ri === row ? r.map((c, ci) => (ci === col ? value : c)) : [...r],
      );
      updateBlock(pageId, block.id, { tableData: next });
    },
    [data, updateBlock, pageId, block.id],
  );

  const addRow = useCallback(() => {
    const cols = data[0]?.length || 3;
    updateBlock(pageId, block.id, {
      tableData: [...data, new Array(cols).fill("")],
    });
  }, [data, updateBlock, pageId, block.id]);

  const addCol = useCallback(() => {
    updateBlock(pageId, block.id, {
      tableData: data.map((row) => [...row, ""]),
    });
  }, [data, updateBlock, pageId, block.id]);

  const removeRow = useCallback(
    (rowIndex: number) => {
      if (data.length <= 1) return;
      updateBlock(pageId, block.id, {
        tableData: data.filter((_, idx) => idx !== rowIndex),
      });
    },
    [data, updateBlock, pageId, block.id],
  );

  const removeCol = useCallback(
    (colIndex: number) => {
      const colCount = data[0]?.length ?? 0;
      if (colCount <= 1) return;
      updateBlock(pageId, block.id, {
        tableData: data.map((row) => row.filter((_, idx) => idx !== colIndex)),
      });
    },
    [data, updateBlock, pageId, block.id],
  );

  const openContextMenu = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, row, col });
    },
    [],
  );

  useEffect(() => {
    if (!contextMenu) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  const tableContextMenuStyle = useMemo<React.CSSProperties>(() => {
    if (!contextMenu) return {};
    const width = 180;
    const height = 160;
    const viewportWidth = globalThis.innerWidth;
    const viewportHeight = globalThis.innerHeight;
    const left = clampNumber(contextMenu.x, 8, viewportWidth - width - 8, 8);
    const belowTop = contextMenu.y;
    const aboveTop = contextMenu.y - height;
    const top = belowTop + height > viewportHeight - 8 && aboveTop > 8
      ? aboveTop
      : clampNumber(belowTop, 8, viewportHeight - height - 8, 8);
    return { left, top };
  }, [contextMenu]);

  return (
    <div className="group/table my-2 border border-[var(--osio-border-default)] rounded-lg overflow-visible relative" style={style}>
      <div className="overflow-auto max-h-[26rem]">
        <table className="w-max min-w-full text-sm">
          <tbody>
            {data.map((row, ri) => (
              <tr
                key={`row-${ri}`} // NOSONAR - positional keys are correct for table grid cells
                className={
                  ri === 0
                    ? "bg-[var(--osio-bg-subtle)] font-medium"
                    : ""
                }
              >
                {row.map((cell, ci) => (
                  <td
                    key={`cell-${ri}-${ci}`} // NOSONAR - positional keys are correct for table grid cells
                    className="border-b border-r border-[var(--osio-border-default)] last:border-r-0 px-0 py-0 min-w-[120px] text-[var(--osio-fg-default)]"
                    style={textStyle}
                    onContextMenu={(e) => openContextMenu(e, ri, ci)}
                  >
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => handleCellChange(ri, ci, e.target.value)}
                      className="w-full bg-transparent px-3 py-1.5 outline-none focus:bg-[var(--osio-bg-hover)]"
                      style={textStyle}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addCol}
        aria-label="Add column"
        className="absolute -right-3 top-1/2 z-[var(--osio-z-raised)] flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-sm text-[var(--osio-fg-muted)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)] group-hover/table:opacity-100"
      >
        +
      </button>
      <button
        type="button"
        onClick={addRow}
        aria-label="Add row"
        className="absolute -bottom-3 left-1/2 z-[var(--osio-z-raised)] flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-sm text-[var(--osio-fg-muted)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)] group-hover/table:opacity-100"
      >
        +
      </button>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[var(--osio-z-popover)] min-w-[180px] rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-lg py-1"
          style={tableContextMenuStyle}
        >
          <button
            type="button"
            onClick={() => {
              removeRow(contextMenu.row);
              setContextMenu(null);
            }}
            disabled={data.length <= 1}
            className="w-full px-3 py-1.5 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete row
          </button>
          <button
            type="button"
            onClick={() => {
              removeCol(contextMenu.col);
              setContextMenu(null);
            }}
            disabled={(data[0]?.length ?? 0) <= 1}
            className="w-full px-3 py-1.5 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete column
          </button>
          <div className="my-1 border-t border-[var(--osio-border-default)]" />
          <button
            type="button"
            onClick={() => {
              onDeleteTable?.();
              setContextMenu(null);
            }}
            disabled={!onDeleteTable}
            className="w-full px-3 py-1.5 text-left text-sm text-[var(--osio-danger)] hover:bg-[var(--osio-bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete table
          </button>
        </div>
      )}
    </div>
  );
};

const LayoutBlockEditor: React.FC<{
  block: Block;
  pageId: string;
  onUpdateBlock?: (blockId: string, updates: Partial<Block>) => void;
}> = ({ block, pageId, onUpdateBlock }) => {
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
  const layoutRootRef = useRef<HTMLElement | null>(null);
  const layoutHistoryRef = useRef<{ undoStack: LayoutHistorySnapshot[]; redoStack: LayoutHistorySnapshot[] }>({
    undoStack: [],
    redoStack: [],
  });
  const selectedCell = useMemo(
    () => cells.find((cell) => cell.id === selectedCellId) ?? null,
    [cells, selectedCellId],
  );
  const renderBlockEditor = useCallback((props: SurfaceBlockEditorProps) => <BlockEditor {...props} />, []);

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

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
    if (!config.autoArrange && !options.allowCollisionFallback && hasLayoutCellCollision(normalizedCells)) {
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
    const placement = findLayoutPlacement(currentCells, config, colSpan, rowSpan);
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
      cellElement.dataset.layoutCellCollision = layoutCellOverlapsAny({ ...cell, ...latestPreview }, cellsRef.current) ? "true" : "";
      setResizingCell((currentPreview) => resizePreviewEqual(currentPreview, latestPreview) ? currentPreview : latestPreview);
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
      updateCell(cell.id, {
        colStart: latestPreview.colStart,
        colSpan: latestPreview.colSpan,
        rowStart: latestPreview.rowStart,
        rowSpan: latestPreview.rowSpan,
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
      const resolvedPlacement = resolveMovePlacement(currentCells, cell, config, desiredPlacement);
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
            style={{
              width: config.wrap ? "100%" : `${Math.max(960, config.columns * CELL_MIN_CONTENT_WIDTH)}px`,
              gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
              gridAutoRows: `${config.rowHeight}px`,
              gap: `${config.gap}px`,
              "--osionos-layout-dot-size": "16px",
              "--osionos-layout-row-size": `${config.rowHeight + config.gap}px`,
            }}
          >
            <LayoutAlignmentGuidesLayer guides={alignmentGuides} />

            {cells.length === 0 ? (
              <LayoutEmptyState onAdd={() => addCell()} onTemplate={applyTemplate} />
            ) : null}

            {cells.map((cell) => (
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
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
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
}) => {
  const liveCell = resizePreview ?? cell;
  const visualResize = resizePreview?.visual;
  const liveOffset = visualResize ?? movePreview?.offset ?? cell.offset;
  const cellMinHeight = visualResize?.height ?? liveCell.rowSpan * config.rowHeight + Math.max(0, liveCell.rowSpan - 1) * config.gap;
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

  return (
    <section
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canUseIntersectionObserver = typeof IntersectionObserver !== "undefined";
  const [shouldMount, setShouldMount] = useState(false);
  const shouldRenderSurface = !deferMount || shouldMount || !canUseIntersectionObserver;

  useEffect(() => {
    if (!deferMount || shouldMount || !canUseIntersectionObserver) return undefined;
    const target = rootRef.current;
    if (!target) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldMount(true);
        observer.disconnect();
      }
    }, { rootMargin: "360px 0px 360px 0px" });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [canUseIntersectionObserver, deferMount, shouldMount]);

  return (
    <div ref={rootRef} className="osionos-layout-cell-surface-anchor">
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
    <LayoutNumberControl label="Row span" value={cell.rowSpan} min={1} max={24} onChange={(rowSpan) => onUpdate({ rowSpan })} />
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
