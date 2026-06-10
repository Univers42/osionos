/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasStage.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";

import type { SurfaceBlockEditorProps } from "../../BlockEditorSurface";
import { createInteractionStore } from "../controller/interactionStore";
import { createLazyMounter } from "../controller/lazyMount";
import { useCanvasCellOps } from "../controller/useCanvasCellOps";
import { useCanvasKeyboard } from "../controller/useCanvasKeyboard";
import { useCanvasMarquee } from "../controller/useCanvasMarquee";
import { useCanvasScale } from "../controller/useCanvasScale";
import { useHugHeights } from "../controller/useHugHeights";
import { resolveHugDisplacements } from "../model/collision";
import { getCellsOrderedByZ } from "../model/selectors";
import type { CanvasStoreApi } from "../store/canvasStore";
import { CanvasCellView } from "./CanvasCellView";
import { CanvasGuidesLayer } from "./CanvasGuidesLayer";

export interface CanvasStageProps {
  store: CanvasStoreApi;
  pageId: string;
  layoutBlockId: string;
  renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
}

const STAGE_MIN_HEIGHT = 200;
const STAGE_BOTTOM_PADDING = 48;

export function CanvasStage({ store, pageId, layoutBlockId, renderBlockEditor }: CanvasStageProps) {
  const cells = useStore(store, (state) => state.cells);
  const selectedIds = useStore(store, (state) => state.selectedIds);
  const layoutConfig = useStore(store, (state) => state.layoutConfig);
  const dispatch = useStore(store, (state) => state.dispatch);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useCanvasScale(stageRef, layoutConfig);
  const { heights, measureCell } = useHugHeights();
  const interaction = useMemo(() => createInteractionStore(), []);
  const cellOps = useCanvasCellOps(store, interaction, scaleRef, stageRef);
  const startMarquee = useCanvasMarquee(store, interaction, scaleRef, stageRef);
  const handleKeyDown = useCanvasKeyboard(store);
  const lazyMounter = useMemo(() => createLazyMounter(), []);
  useEffect(() => () => lazyMounter.disconnect(), [lazyMounter]);

  // Hug cells whose content outgrew their frame push neighbours down at
  // render time only — this never writes back to the store (two panes at
  // different widths would fight over persisted heights).
  const displaced = useMemo(
    () => resolveHugDisplacements(cells, heights, layoutConfig.rowGap),
    [cells, heights, layoutConfig.rowGap],
  );
  const contentHeight = useMemo(() => {
    let max = STAGE_MIN_HEIGHT;
    for (const cell of cells) {
      const frame = displaced[cell.id] ?? cell.frame;
      const height = Math.max(frame.height, cell.sizing.height === "hug" ? heights.get(cell.id) ?? 0 : 0);
      max = Math.max(max, frame.y + height);
    }
    return Math.ceil(max + STAGE_BOTTOM_PADDING);
  }, [cells, displaced, heights]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const orderedCells = useMemo(() => getCellsOrderedByZ(cells), [cells]);
  const shouldShowGuides = !layoutConfig.preview && layoutConfig.guideVisibility !== "never";

  const handleBackgroundPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-layout-cell-id], .osionos-layout-empty-state")) return;
    if (layoutConfig.preview) {
      dispatch({ type: "clearSelection" });
      return;
    }
    startMarquee(event);
  }, [dispatch, layoutConfig.preview, startMarquee]);

  return (
    <div
      ref={stageRef}
      data-layout-grid={layoutBlockId}
      data-layout-guides={shouldShowGuides ? "true" : undefined}
      data-canvas-active={selectedIds.length > 0 ? "true" : undefined}
      className="osionos-layout-grid osio-canvas-v2-stage"
      tabIndex={-1}
      style={{
        height: `${contentHeight}px`,
        "--osionos-layout-dot-size": "16px",
        "--osionos-layout-row-size": `${layoutConfig.rowHeight + layoutConfig.rowGap}px`,
      } as React.CSSProperties}
      onPointerDownCapture={handleBackgroundPointerDown}
      onKeyDown={handleKeyDown}
    >
      <CanvasGuidesLayer interaction={interaction} />
      {orderedCells.map((cell) => (
        <CanvasCellView
          key={cell.id}
          cell={cell}
          displayFrame={displaced[cell.id] ?? cell.frame}
          gridConfig={layoutConfig}
          selected={selected.has(cell.id)}
          preview={layoutConfig.preview}
          pageId={pageId}
          layoutBlockId={layoutBlockId}
          lazyMounter={lazyMounter}
          renderBlockEditor={renderBlockEditor}
          onSelectCell={cellOps.selectCell}
          onStartMove={cellOps.startMove}
          onStartResize={cellOps.startResize}
          onMeasureCell={measureCell}
          onRenameCell={cellOps.renameCell}
          onAddCell={cellOps.addCell}
          onInspectCell={cellOps.inspectCell}
          onDuplicateCell={cellOps.duplicateCell}
          onDeleteCell={cellOps.deleteCell}
        />
      ))}
    </div>
  );
}
