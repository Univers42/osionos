/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   migration.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { LayoutCell, LayoutConfig } from "@/entities/block";
import {
  CANVAS_DEFAULT_COLUMN_WIDTH,
  CANVAS_DEFAULT_FRAME,
  CANVAS_SCHEMA_VERSION,
  type CanvasCell,
  type CanvasFrame,
  type CanvasGridConfig,
  type CanvasLayoutConfig,
  type CanvasMigrationState,
  type CanvasState,
} from "./types";
import { createCanvasHistory } from "./history";
import {
  legacySizingFromCanvas,
  migrateHorizontalConstraint,
  migrateVerticalConstraint,
  sizingFromLegacy,
  unmigrateHorizontalConstraint,
  unmigrateVerticalConstraint,
} from "./migrationMaps";

export function gridConfigFromLegacy(config: Partial<LayoutConfig> | undefined): CanvasGridConfig {
  const gap = finiteNumber(config?.gap, 16);
  return {
    columns: Math.max(1, Math.round(finiteNumber(config?.columns, 12))),
    rows: config?.rows === undefined ? undefined : Math.max(1, Math.round(finiteNumber(config.rows, 1))),
    columnWidth: CANVAS_DEFAULT_COLUMN_WIDTH,
    rowHeight: Math.max(1, finiteNumber(config?.rowHeight, 96)),
    columnGap: finiteNumber(config?.columnGap, gap),
    rowGap: finiteNumber(config?.rowGap, gap),
    snapToGrid: config?.snapToGrid ?? true,
  };
}

export function layoutConfigFromLegacy(config: Partial<LayoutConfig> | undefined): CanvasLayoutConfig {
  const guideVisibility = config?.guideVisibility;
  return {
    ...gridConfigFromLegacy(config),
    rootFrame: CANVAS_DEFAULT_FRAME,
    parentMode: "layout-root",
    noOverlap: !(config?.autoArrange ?? false),
    preview: Boolean(config?.preview),
    guideVisibility: guideVisibility === "always" || guideVisibility === "never" ? guideVisibility : "auto",
  };
}

export function migrate(legacyCell: LayoutCell, gridConfig: CanvasGridConfig, index = 0): CanvasCell {
  const frame = frameFromGridCell(legacyCell, gridConfig);
  return {
    id: legacyCell.id,
    frame,
    constraints: {
      horizontal: migrateHorizontalConstraint(legacyCell.horizontalConstraint),
      vertical: migrateVerticalConstraint(legacyCell.verticalConstraint),
    },
    sizing: sizingFromLegacy(legacyCell.sizing),
    visuals: {
      label: legacyCell.label,
      tint: legacyCell.tint,
      foreground: legacyCell.textColor,
      background: legacyCell.backgroundColor,
      padding: legacyCell.padding,
      fontSize: legacyCell.fontSize,
    },
    blocks: legacyCell.blocks,
    z: index,
    type: legacyCell.type,
    content: legacyCell.content,
    blockType: legacyCell.blockType,
    wrap: legacyCell.wrap,
  };
}

export function unmigrate(canvasCell: CanvasCell, gridConfig: CanvasGridConfig): LayoutCell {
  const gridCell = gridCellFromFrame(canvasCell.frame, gridConfig);
  return pruneUndefined({
    id: canvasCell.id,
    ...gridCell,
    label: canvasCell.visuals.label,
    tint: canvasCell.visuals.tint,
    blocks: canvasCell.blocks,
    type: canvasCell.type,
    content: canvasCell.content,
    blockType: canvasCell.blockType,
    textColor: canvasCell.visuals.foreground,
    backgroundColor: canvasCell.visuals.background,
    sizing: legacySizingFromCanvas(canvasCell.sizing),
    horizontalConstraint: unmigrateHorizontalConstraint(canvasCell.constraints.horizontal),
    verticalConstraint: unmigrateVerticalConstraint(canvasCell.constraints.vertical),
    wrap: canvasCell.wrap,
    padding: canvasCell.visuals.padding,
    fontSize: canvasCell.visuals.fontSize,
  });
}

export function migrateLayoutCells(cells: LayoutCell[], config: Partial<LayoutConfig> | undefined): CanvasCell[] {
  const gridConfig = gridConfigFromLegacy(config);
  return cells.map((cell, index) => migrate(cell, gridConfig, index));
}

export function unmigrateCanvasCells(cells: CanvasCell[], gridConfig: CanvasGridConfig): LayoutCell[] {
  return cells.map((cell) => unmigrate(cell, gridConfig));
}

export function createCanvasStateFromLegacy(layoutBlockId: string, config: Partial<LayoutConfig> | undefined, cells: LayoutCell[]): CanvasState {
  const layoutConfig = layoutConfigFromLegacy(config);
  return {
    layoutBlockId,
    schemaVersion: CANVAS_SCHEMA_VERSION,
    cells: migrateLayoutCells(cells, config),
    selectedIds: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    layoutConfig,
    history: createCanvasHistory(),
    migration: migrationStateFromLegacy(config, cells),
    tool: "select",
  };
}

export function migrationStateFromLegacy(config: Partial<LayoutConfig> | undefined, cells: LayoutCell[]): CanvasMigrationState {
  return { sourceSignature: legacySourceSignature(config, cells), legacyConfig: structuredClone(config ?? {}) };
}

export function legacySourceSignature(config: Partial<LayoutConfig> | undefined, cells: LayoutCell[]): string {
  return JSON.stringify({ config: config ?? {}, cells });
}

function frameFromGridCell(cell: LayoutCell, config: CanvasGridConfig): CanvasFrame {
  const offset = cell.offset ?? { x: 0, y: 0 };
  return {
    x: (cell.colStart - 1) * (config.columnWidth + config.columnGap) + offset.x,
    y: (cell.rowStart - 1) * (config.rowHeight + config.rowGap) + offset.y,
    width: cell.colSpan * config.columnWidth + Math.max(0, cell.colSpan - 1) * config.columnGap,
    height: cell.rowSpan * config.rowHeight + Math.max(0, cell.rowSpan - 1) * config.rowGap,
  };
}

export function gridCellFromFrame(frame: CanvasFrame, config: CanvasGridConfig): Pick<LayoutCell, "colStart" | "colSpan" | "rowStart" | "rowSpan" | "offset"> {
  const colStart = Math.max(1, Math.round(frame.x / (config.columnWidth + config.columnGap)) + 1);
  const rowStart = Math.max(1, Math.round(frame.y / (config.rowHeight + config.rowGap)) + 1);
  const colSpan = Math.max(1, Math.round((frame.width + config.columnGap) / (config.columnWidth + config.columnGap)));
  const rowSpan = Math.max(1, Math.round((frame.height + config.rowGap) / (config.rowHeight + config.rowGap)));
  const offset = { x: frame.x - (colStart - 1) * (config.columnWidth + config.columnGap), y: frame.y - (rowStart - 1) * (config.rowHeight + config.rowGap) };
  return pruneUndefined({ colStart, colSpan, rowStart, rowSpan, offset: offset.x || offset.y ? offset : undefined });
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pruneUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
