/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasDebugRoute.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useMemo } from "react";
import { useStore } from "zustand";

import legacyLayout from "@/__fixtures__/legacy-layout.json";
import type { Block, LayoutCell, LayoutConfig } from "@/entities/block";
import { createCanvasStateFromBlock } from "../controller/persistence";
import { roundFrameForDom, translateFrame } from "../model/geometry";
import { getCellsOrderedByZ, getContentExtent, getNextZ } from "../model/selectors";
import type { CanvasAction, CanvasCell } from "../model/types";
import { createCanvasStore } from "../store/canvasStore";
import "../canvas.css";

const legacyLayoutFixture = legacyLayout as {
  layoutConfig: Partial<LayoutConfig>;
  layoutCells: LayoutCell[];
};

const debugBlock: Block = {
  id: "canvas-debug-layout",
  type: "layout",
  content: "",
  layoutMode: "inline",
  layoutConfig: legacyLayoutFixture.layoutConfig,
  layoutCells: legacyLayoutFixture.layoutCells,
};

export function CanvasDebugRoute() {
  const store = useMemo(() => createCanvasStore(createCanvasStateFromBlock(debugBlock)), []);
  const cells = useStore(store, (state) => state.cells);
  const selectedIds = useStore(store, (state) => state.selectedIds);
  const viewport = useStore(store, (state) => state.viewport);
  const layoutConfig = useStore(store, (state) => state.layoutConfig);
  const history = useStore(store, (state) => state.history);
  const dispatch = useStore(store, (state) => state.dispatch);
  const debugJson = useMemo(() => JSON.stringify({ cells, selectedIds, viewport, layoutConfig }, null, 2), [cells, layoutConfig, selectedIds, viewport]);

  return (
    <div className="osio-canvas-v2-debug-shell">
      <aside className="osio-canvas-v2-panel">
        <div className="osio-canvas-v2-toolbar">
          <button type="button" onClick={() => dispatch({ type: "addCell", cell: createDebugCell(cells) })}>Add</button>
          <button type="button" onClick={() => moveSelected(cells, selectedIds, dispatch, 24, 0)}>Right</button>
          <button type="button" onClick={() => moveSelected(cells, selectedIds, dispatch, 0, 24)}>Down</button>
          <button type="button" onClick={() => dispatch({ type: "undo" })} disabled={history.past.length === 0}>Undo</button>
          <button type="button" onClick={() => dispatch({ type: "redo" })} disabled={history.future.length === 0}>Redo</button>
        </div>
      </aside>
      <main className="osio-canvas-v2-workspace">
        <DebugStage cells={cells} selectedIds={selectedIds} onSelect={(cellId) => dispatch({ type: "select", ids: [cellId] })} />
      </main>
      <aside className="osio-canvas-v2-panel">
        <pre className="osio-canvas-v2-json">{debugJson}</pre>
      </aside>
    </div>
  );
}

function DebugStage({ cells, selectedIds, onSelect }: { cells: CanvasCell[]; selectedIds: string[]; onSelect: (cellId: string) => void }) {
  const selected = new Set(selectedIds);
  const extent = getContentExtent(cells);
  return (
    <div className="osio-canvas-v2-stage" style={{ width: extent.width, height: extent.height }}>
      {getCellsOrderedByZ(cells).map((cell) => {
        const frame = roundFrameForDom(cell.frame);
        return (
          <button
            key={cell.id}
            type="button"
            className="osio-canvas-v2-cell"
            data-selected={selected.has(cell.id) ? "true" : "false"}
            style={{
              transform: `translate(${frame.x}px, ${frame.y}px)`,
              width: `${frame.width}px`,
              height: `${frame.height}px`,
              zIndex: cell.z,
              color: cell.visuals.foreground,
              background: cell.visuals.background ?? cell.visuals.tint,
            }}
            onClick={() => onSelect(cell.id)}
          >
            <span className="osio-canvas-v2-cell-label">{cell.visuals.label || "Untitled"}</span>
            <span className="osio-canvas-v2-cell-meta">{cell.frame.width} x {cell.frame.height}</span>
          </button>
        );
      })}
    </div>
  );
}

function createDebugCell(cells: CanvasCell[]): CanvasCell {
  const z = getNextZ(cells);
  return {
    id: `debug-cell-${z}`,
    frame: { x: 80 + z * 24, y: 80 + z * 24, width: 224, height: 128 },
    constraints: { horizontal: "min", vertical: "min" },
    sizing: { width: "fixed", height: "fixed" },
    visuals: { label: `Debug ${z + 1}`, background: "var(--osio-bg-elevated)", foreground: "var(--osio-fg-default)", padding: "comfortable", fontSize: "base" },
    blocks: [],
    z,
    wrap: true,
  };
}

function moveSelected(cells: CanvasCell[], selectedIds: string[], dispatch: (action: CanvasAction) => void, x: number, y: number) {
  const selected = cells.find((cell) => selectedIds.includes(cell.id));
  if (!selected) return;
  dispatch({ type: "updateCellFrame", id: selected.id, frame: translateFrame(selected.frame, { x, y }) });
}
