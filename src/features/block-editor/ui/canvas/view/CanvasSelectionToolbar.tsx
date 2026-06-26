/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasSelectionToolbar.tsx                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, type RefObject } from "react";
import { BringToFront, Copy, Palette, SendToBack, SlidersHorizontal, Trash2 } from "lucide-react";
import { useStore } from "zustand";

import { translateFrame } from "../model/geometry";
import { bringToFront, sendToBack } from "../model/frameOps";
import type { CanvasFrame } from "../model/types";
import type { CanvasInteractionStore } from "../controller/interactionStore";
import { useSelectionAnchor } from "../controller/useSelectionAnchor";
import type { CanvasStoreApi } from "../store/canvasStore";
import { CanvasInspector } from "./CanvasInspector";
import { CanvasAlignControls, CanvasFillSwatches } from "./CanvasToolbarExtras";

type ToolbarPanel = "none" | "fill" | "advanced";
const DUPLICATE_OFFSET = 24;

/**
 * In-place selection toolbar — replaces the side inspector. A stage-child
 * overlay anchored over the selection (see useSelectionAnchor); every control
 * dispatches the SAME reducer actions the inspector used, so persistence and
 * undo are unchanged. Hidden during any drag/resize/marquee.
 */
export const CanvasSelectionToolbar: React.FC<{
  store: CanvasStoreApi;
  interaction: CanvasInteractionStore;
  stageRef: RefObject<HTMLElement | null>;
}> = ({ store, interaction, stageRef }) => {
  const anchor = useSelectionAnchor(store, interaction, stageRef);
  const selectedIds = useStore(store, (state) => state.selectedIds);
  const cells = useStore(store, (state) => state.cells);
  const [panel, setPanel] = useState<ToolbarPanel>("none");
  if (!anchor || selectedIds.length === 0) return null;

  const ids = new Set(selectedIds);
  const multi = selectedIds.length > 1;
  const dispatch = store.getState().dispatch;

  const setFill = (background?: string, foreground?: string) => {
    const live = store.getState().cells;
    for (const id of selectedIds) {
      const cell = live.find((candidate) => candidate.id === id);
      if (cell) dispatch({ type: "updateCell", id, patch: { visuals: { ...cell.visuals, background, foreground } } });
    }
    setPanel("none");
  };
  const onFrames = (frames: Record<string, CanvasFrame>) => dispatch({ type: "updateCellFrames", frames });
  const duplicate = () => {
    for (const cell of store.getState().cells.filter((candidate) => ids.has(candidate.id))) {
      dispatch({ type: "duplicateCell", id: cell.id, newId: crypto.randomUUID(), frame: translateFrame(cell.frame, { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET }) });
    }
  };
  const place = anchor.top >= 52 ? "above" : "below";
  const top = place === "above" ? anchor.top : anchor.top + anchor.height;

  return (
    <div
      className="osio-canvas-toolbar"
      role="toolbar"
      aria-label="Selection controls"
      data-place={place}
      style={{ left: `${anchor.left + anchor.width / 2}px`, top: `${top}px` }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === "Escape") setPanel("none"); }}
    >
      <div className="osio-canvas-tb-bar">
        <button type="button" className="osio-canvas-tb-btn" data-on={panel === "fill" || undefined} title="Fill" aria-label="Fill" onClick={() => setPanel((value) => (value === "fill" ? "none" : "fill"))}>
          <Palette size={15} strokeWidth={1.75} aria-hidden />
        </button>
        {multi ? <CanvasAlignControls cells={cells} ids={ids} onFrames={onFrames} /> : null}
        <div className="osio-canvas-tb-group">
          <button type="button" className="osio-canvas-tb-btn" title="Bring to front" aria-label="Bring to front" onClick={() => dispatch({ type: "setCellsZ", zs: bringToFront(store.getState().cells, ids) })}>
            <BringToFront size={15} strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" className="osio-canvas-tb-btn" title="Send to back" aria-label="Send to back" onClick={() => dispatch({ type: "setCellsZ", zs: sendToBack(store.getState().cells, ids) })}>
            <SendToBack size={15} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="osio-canvas-tb-group">
          <button type="button" className="osio-canvas-tb-btn" title="Duplicate" aria-label="Duplicate" onClick={duplicate}>
            <Copy size={15} strokeWidth={1.75} aria-hidden />
          </button>
          {!multi ? (
            <button type="button" className="osio-canvas-tb-btn" data-on={panel === "advanced" || undefined} title="More options" aria-label="More options" onClick={() => setPanel((value) => (value === "advanced" ? "none" : "advanced"))}>
              <SlidersHorizontal size={15} strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
          <button type="button" className="osio-canvas-tb-btn osio-canvas-tb-btn--danger" title="Delete" aria-label="Delete" onClick={() => dispatch({ type: "removeCells", ids: selectedIds })}>
            <Trash2 size={15} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>

      {panel === "fill" ? (
        <div className="osio-canvas-tb-pop"><CanvasFillSwatches onPick={setFill} /></div>
      ) : null}
      {panel === "advanced" && !multi ? (
        <div className="osio-canvas-tb-pop osio-canvas-tb-pop--wide">
          <CanvasInspector store={store} cellId={selectedIds[0]} onClose={() => setPanel("none")} />
        </div>
      ) : null}
    </div>
  );
};
