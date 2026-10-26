/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasInspector.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { X } from "lucide-react";
import { useStore } from "zustand";

import { bringToFront, sendToBack } from "../model/frameOps";
import { gridCellFromFrame, normalizeVisibilityFormula } from "../model/migration";
import { legacySizingFromCanvas, migrateHorizontalConstraint, migrateVerticalConstraint, sizingFromLegacy, unmigrateHorizontalConstraint, unmigrateVerticalConstraint } from "../model/migrationMaps";
import type { CanvasStoreApi } from "../store/canvasStore";
import { CanvasNumberControl, CanvasSegmented, CanvasToggle } from "./CanvasInspectorControls";
import { VisibilityFormulaField } from "../../visibility/VisibilityFormulaField";

const CELL_COLOR_SWATCHES = [
  { label: "Surface", background: "var(--osio-bg-surface)", foreground: "var(--osio-fg-default)" },
  { label: "Blue", background: "color-mix(in srgb, #2563eb 8%, var(--osio-bg-surface))", foreground: "var(--osio-fg-default)" },
  { label: "Green", background: "color-mix(in srgb, #0f766e 10%, var(--osio-bg-surface))", foreground: "var(--osio-fg-default)" },
  { label: "Gold", background: "color-mix(in srgb, #b45309 10%, var(--osio-bg-surface))", foreground: "var(--osio-fg-default)" },
  { label: "Rose", background: "color-mix(in srgb, #be123c 8%, var(--osio-bg-surface))", foreground: "var(--osio-fg-default)" },
];

const MAX_ROW_SPAN = 512;

const EMPTY_MEASURED_HEIGHTS: ReadonlyMap<string, number> = new Map();

/**
 * Live hug measurements of the stage. The stage owns the ResizeObserver (one
 * observer for every hug cell), the inspector reads the map through this
 * context to pin the height it currently sees.
 */
const MeasuredHeightsContext = React.createContext<ReadonlyMap<string, number>>(EMPTY_MEASURED_HEIGHTS);

export const CanvasMeasuredHeightsProvider: React.FC<{ heights: ReadonlyMap<string, number>; children: React.ReactNode }> = ({ heights, children }) => (
  <MeasuredHeightsContext.Provider value={heights}>{children}</MeasuredHeightsContext.Provider>
);

export function useMeasuredCellHeight(cellId: string | undefined): number | undefined {
  const heights = React.useContext(MeasuredHeightsContext);
  return cellId === undefined ? undefined : heights.get(cellId);
}

/**
 * The hug measurement is the CONTENT height of the cell editor (a
 * contentRect), while a cell's frame height is its border box: pinning the
 * raw measurement would freeze the card below its own padding and clip the
 * text. The padding is a CSS value (a clamp), so it is read from the
 * rendered cell.
 * Caveat: a cell that is not mounted (a background pane) falls back to the
 * raw measurement, so the frozen card clips its text there.
 */
function measuredHeightWithPadding(cellId: string, measuredHeight: number): number {
  const editor = document.querySelector(`[data-layout-cell-id="${CSS.escape(cellId)}"] .osionos-layout-cell-editor`);
  if (!editor) return measuredHeight;
  const style = window.getComputedStyle(editor);
  const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  return Number.isFinite(padding) ? measuredHeight + padding : measuredHeight;
}

export const CanvasInspector: React.FC<{ store: CanvasStoreApi; cellId: string; onClose: () => void }> = ({ store, cellId, onClose }) => {
  const cell = useStore(store, (state) => state.cells.find((candidate) => candidate.id === cellId));
  const layoutConfig = useStore(store, (state) => state.layoutConfig);
  const dispatch = useStore(store, (state) => state.dispatch);
  const measuredHeight = useMeasuredCellHeight(cell?.id);
  if (!cell) return null;

  const span = gridCellFromFrame(cell.frame, layoutConfig);
  const gridHeight = (span.rowSpan ?? 1) * layoutConfig.rowHeight + Math.max(0, (span.rowSpan ?? 1) - 1) * layoutConfig.rowGap;
  const setSpan = (colSpan: number, rowSpan: number) => {
    dispatch({
      type: "updateCellFrames",
      frames: {
        [cell.id]: {
          ...cell.frame,
          width: colSpan * layoutConfig.columnWidth + Math.max(0, colSpan - 1) * layoutConfig.columnGap,
          height: rowSpan * layoutConfig.rowHeight + Math.max(0, rowSpan - 1) * layoutConfig.rowGap,
        },
      },
      resolveCollisions: true,
    });
  };
  return (
    <div className="osionos-layout-cell-inspector osio-canvas-advanced" aria-label="Cell options">
      <div className="osionos-layout-inspector-header">
        <div>
          <p>Cell options</p>
          <span>{cell.visuals.label || "Untitled cell"}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close cell options"><X size={14} aria-hidden /></button>
      </div>

      <CanvasSegmented
        label="Auto-layout"
        value={legacySizingFromCanvas(cell.sizing)}
        options={["fixed", "auto-height", "auto-width", "auto"] as const}
        onChange={(sizing) => dispatch({ type: "updateCell", id: cell.id, patch: { sizing: sizingFromLegacy(sizing) } })}
      />
      <CanvasSegmented
        label="Width constraint"
        value={unmigrateHorizontalConstraint(cell.constraints.horizontal) ?? "stretch"}
        options={["left", "stretch", "scale"] as const}
        onChange={(horizontal) => dispatch({ type: "updateCell", id: cell.id, patch: { constraints: { ...cell.constraints, horizontal: migrateHorizontalConstraint(horizontal) } } })}
      />
      <CanvasSegmented
        label="Height constraint"
        value={unmigrateVerticalConstraint(cell.constraints.vertical) ?? "top"}
        options={["top", "stretch", "hug"] as const}
        onChange={(vertical) => dispatch({ type: "updateCell", id: cell.id, patch: { constraints: { ...cell.constraints, vertical: migrateVerticalConstraint(vertical) } } })}
      />
      <div className="osionos-layout-control-row osionos-layout-control-row--stacked">
        <span>Height</span>
        <div className="osionos-layout-segmented">
          {cell.sizing.height === "hug" ? (
            <button
              type="button"
              disabled={measuredHeight === undefined}
              title="Freeze the cell at the height its content measures right now"
              onClick={() => {
                if (measuredHeight === undefined) return;
                dispatch({ type: "setCellMeasuredHeight", id: cell.id, height: measuredHeightWithPadding(cell.id, measuredHeight) });
              }}
            >
              Save measured height
            </button>
          ) : (
            <button
              type="button"
              title="Let the content drive the height again"
              onClick={() => dispatch({
                type: "updateCell",
                id: cell.id,
                patch: {
                  sizing: { ...cell.sizing, height: "hug" },
                  // A pin moved the frame off the grid, so the grid height is
                  // restored with it: a hug cell is never smaller than its row.
                  ...(cell.measuredHeight === undefined ? {} : { frame: { ...cell.frame, height: gridHeight } }),
                  measuredHeight: undefined,
                },
              })}
            >
              Auto height
            </button>
          )}
        </div>
      </div>
      <div className="osionos-layout-control-row osionos-layout-control-row--stacked">
        <span>Visibility formula</span>
        <VisibilityFormulaField
          value={cell.visibilityFormula}
          onCommit={(next: string) => {
            const normalized = normalizeVisibilityFormula(next);
            if (normalized === normalizeVisibilityFormula(cell.visibilityFormula)) return;
            dispatch({ type: "updateCell", id: cell.id, patch: { visibilityFormula: normalized } });
          }}
        />
      </div>
      <CanvasToggle label="Wrap content" checked={cell.wrap !== false} onChange={(wrap) => dispatch({ type: "updateCell", id: cell.id, patch: { wrap } })} />
      <CanvasSegmented
        label="Padding"
        value={cell.visuals.padding ?? "comfortable"}
        options={["compact", "comfortable", "spacious"] as const}
        onChange={(padding) => dispatch({ type: "updateCell", id: cell.id, patch: { visuals: { ...cell.visuals, padding } } })}
      />
      <CanvasSegmented
        label="Text size"
        value={cell.visuals.fontSize ?? "base"}
        options={["small", "base", "large"] as const}
        onChange={(fontSize) => dispatch({ type: "updateCell", id: cell.id, patch: { visuals: { ...cell.visuals, fontSize } } })}
      />
      <CanvasNumberControl label="Column span" value={span.colSpan ?? 1} min={1} max={layoutConfig.columns} onChange={(colSpan) => setSpan(colSpan, span.rowSpan ?? 1)} />
      <CanvasNumberControl label="Row span" value={span.rowSpan ?? 1} min={1} max={MAX_ROW_SPAN} onChange={(rowSpan) => setSpan(span.colSpan ?? 1, rowSpan)} />
      <CanvasNumberControl
        label="X"
        value={Math.round(cell.frame.x)}
        min={0}
        max={20000}
        suffix="px"
        onChange={(x) => dispatch({ type: "updateCellFrames", frames: { [cell.id]: { ...cell.frame, x } }, resolveCollisions: true })}
      />
      <CanvasNumberControl
        label="Y"
        value={Math.round(cell.frame.y)}
        min={0}
        max={200000}
        suffix="px"
        onChange={(y) => dispatch({ type: "updateCellFrames", frames: { [cell.id]: { ...cell.frame, y } }, resolveCollisions: true })}
      />

      <div className="osionos-layout-control-row osionos-layout-control-row--stacked">
        <span>Order</span>
        <div className="osionos-layout-segmented">
          <button type="button" onClick={() => dispatch({ type: "setCellsZ", zs: bringToFront(store.getState().cells, new Set([cell.id])) })}>front</button>
          <button type="button" onClick={() => dispatch({ type: "setCellsZ", zs: sendToBack(store.getState().cells, new Set([cell.id])) })}>back</button>
        </div>
      </div>

      <div className="osionos-layout-control-row osionos-layout-control-row--stacked">
        <span>Color</span>
        <div className="osionos-layout-swatches">
          {CELL_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.label}
              type="button"
              aria-label={`${swatch.label} cell color`}
              title={swatch.label}
              className="osionos-layout-swatch"
              style={{ backgroundColor: swatch.background }}
              onClick={() => dispatch({ type: "updateCell", id: cell.id, patch: { visuals: { ...cell.visuals, background: swatch.background, foreground: swatch.foreground } } })}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
