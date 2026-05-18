/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, LayoutCell, LayoutConfig } from "@/entities/block";

export const CANVAS_SCHEMA_VERSION = 2;
export const CANVAS_DEFAULT_COLUMN_WIDTH = 96;
export const CANVAS_DEFAULT_FRAME: CanvasFrame = { x: 0, y: 0, width: 1184, height: 768 };

export type CanvasAxisConstraint = "min" | "max" | "min-max" | "scale" | "center" | "hug";
export type CanvasSizingMode = "fixed" | "hug";
export type CanvasTool = "select" | "frame" | "pan";
export type CanvasParentMode = "layout-root";

export interface CanvasFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasConstraints {
  horizontal: CanvasAxisConstraint;
  vertical: CanvasAxisConstraint;
}

export interface CanvasSizing {
  width: CanvasSizingMode;
  height: CanvasSizingMode;
}

export interface CanvasCellVisuals {
  label?: string;
  tint?: string;
  foreground?: string;
  background?: string;
  padding?: "compact" | "comfortable" | "spacious";
  fontSize?: "small" | "base" | "large";
}

export interface CanvasCell {
  id: string;
  frame: CanvasFrame;
  constraints: CanvasConstraints;
  sizing: CanvasSizing;
  visuals: CanvasCellVisuals;
  blocks: Block[];
  z: number;
  type?: LayoutCell["type"];
  content?: string;
  blockType?: Block["type"];
  wrap?: boolean;
}

export interface CanvasGridConfig {
  columns: number;
  rows?: number;
  columnWidth: number;
  rowHeight: number;
  columnGap: number;
  rowGap: number;
  snapToGrid: boolean;
}

export interface CanvasLayoutConfig extends CanvasGridConfig {
  rootFrame: CanvasFrame;
  parentMode: CanvasParentMode;
  noOverlap: boolean;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasHistorySnapshot {
  cells: CanvasCell[];
  selectedIds: string[];
}

export interface CanvasHistoryState {
  past: CanvasHistorySnapshot[];
  future: CanvasHistorySnapshot[];
  limit: number;
}

export interface CanvasMigrationState {
  sourceSignature: string;
  legacyConfig: Partial<LayoutConfig>;
}

export interface CanvasState {
  layoutBlockId: string;
  schemaVersion: typeof CANVAS_SCHEMA_VERSION;
  cells: CanvasCell[];
  selectedIds: string[];
  viewport: CanvasViewport;
  layoutConfig: CanvasLayoutConfig;
  history: CanvasHistoryState;
  migration: CanvasMigrationState;
  tool: CanvasTool;
}

export type CanvasCellPatch = Partial<Omit<CanvasCell, "id">>;

export type CanvasAction =
  | { type: "hydrate"; state: CanvasState }
  | { type: "select"; ids: string[] }
  | { type: "clearSelection" }
  | { type: "setTool"; tool: CanvasTool }
  | { type: "setViewport"; viewport: Partial<CanvasViewport> }
  | { type: "setSnapToGrid"; enabled: boolean }
  | { type: "setNoOverlap"; enabled: boolean }
  | { type: "addCell"; cell: CanvasCell }
  | { type: "updateCellFrame"; id: string; frame: CanvasFrame }
  | { type: "updateCell"; id: string; patch: CanvasCellPatch }
  | { type: "removeCell"; id: string }
  | { type: "duplicateCell"; id: string; newId: string; frame?: CanvasFrame }
  | { type: "setCellZ"; id: string; z: number }
  | { type: "undo" }
  | { type: "redo" };

export interface CanvasPersistedBlockPatch extends Partial<Block> {
  layoutCells: LayoutCell[];
  layoutConfig: Partial<LayoutConfig>;
  schemaVersion: typeof CANVAS_SCHEMA_VERSION;
}
