import type { Block, LayoutCell, LayoutConfig } from "@/entities/block";
import { createCanvasStateFromLegacy, legacySourceSignature, unmigrateCanvasCells } from "../model/migration";
import type { CanvasPersistedBlockPatch, CanvasState } from "../model/types";

const EMPTY_LEGACY_CELLS: LayoutCell[] = [];

export function createCanvasStateFromBlock(block: Block): CanvasState {
  const layoutCells = Array.isArray(block.layoutCells) ? block.layoutCells : EMPTY_LEGACY_CELLS;
  return createCanvasStateFromLegacy(block.id, block.layoutConfig, layoutCells);
}

export function getBlockHydrationSignature(block: Block): string {
  const layoutCells = Array.isArray(block.layoutCells) ? block.layoutCells : EMPTY_LEGACY_CELLS;
  return legacySourceSignature(block.layoutConfig, layoutCells);
}

export function buildCanvasBlockPatch(state: CanvasState): CanvasPersistedBlockPatch {
  const layoutCells = unmigrateCanvasCells(state.cells, state.layoutConfig);
  const layoutConfig = legacyConfigFromCanvasState(state);
  return { layoutConfig, layoutCells, schemaVersion: 2 };
}

function legacyConfigFromCanvasState(state: CanvasState): Partial<LayoutConfig> {
  return {
    ...state.migration.legacyConfig,
    columns: state.layoutConfig.columns,
    rows: state.layoutConfig.rows,
    rowHeight: state.layoutConfig.rowHeight,
    gap: Math.max(state.layoutConfig.columnGap, state.layoutConfig.rowGap),
    columnGap: state.layoutConfig.columnGap,
    rowGap: state.layoutConfig.rowGap,
    snapToGrid: state.layoutConfig.snapToGrid,
    autoArrange: !state.layoutConfig.noOverlap,
  };
}
