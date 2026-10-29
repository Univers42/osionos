/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasStage.tsx                                    :+:      :+:    :+:   */
/*                                                    +#+#+ +#+        :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, type RefObject } from "react";
import { useStore } from "zustand";

import type { PropertyMap } from "@/shared/notion-database-sys/src/lib/engine/bridge";
import type { SurfaceBlockEditorProps } from "../../BlockEditorSurface";
import type { CanvasInteractionStore } from "../controller/interactionStore";
import { createLazyMounter } from "../controller/lazyMount";
import type { CanvasCellOps } from "../controller/useCanvasCellOps";
import { useCanvasKeyboard } from "../controller/useCanvasKeyboard";
import { useCanvasMarquee } from "../controller/useCanvasMarquee";
import { useHugHeights } from "../controller/useHugHeights";
import { resolveHugDisplacements } from "../model/collision";
import { getCellsOrderedByZ } from "../model/selectors";
import { filterVisibleCells } from "@/entities/block/model/visibility";
import type { CanvasStoreApi } from "../store/canvasStore";
import { CanvasCellView } from "./CanvasCellView";
import { CanvasEmptyState } from "./CanvasEmptyState";
import { CanvasGuidesLayer } from "./CanvasGuidesLayer";
import { CanvasMeasuredHeightsProvider } from "./CanvasInspector";
import { CanvasSelectionToolbar } from "./CanvasSelectionToolbar";

export interface CanvasStageProps {
  store: CanvasStoreApi;
  interaction: CanvasInteractionStore;
  cellOps: CanvasCellOps;
  stageRef: RefObject<HTMLDivElement | null>;
  scaleRef: RefObject<number>;
  pageId: string;
  layoutBlockId: string;
  /** The page's own properties — the context every cell formula is evaluated against. */
  propertyMap: PropertyMap;
  /** True once the WASM formula engine has booted (it loads lazily). */
  formulaEngineReady: boolean;
  renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
}

const STAGE_MIN_HEIGHT = 200;
const STAGE_BOTTOM_PADDING = 48;

export function CanvasStage({ store, interaction, cellOps, stageRef, scaleRef, pageId, layoutBlockId, propertyMap, formulaEngineReady, renderBlockEditor }: CanvasStageProps) {
  const cells = useStore(store, (state) => state.cells);
  const selectedIds = useStore(store, (state) => state.selectedIds);
  const layoutConfig = useStore(store, (state) => state.layoutConfig);
  const dispatch = useStore(store, (state) => state.dispatch);
  const { heights, measureCell } = useHugHeights();
  const startMarquee = useCanvasMarquee(store, interaction, scaleRef, stageRef);
  const handleKeyDown = useCanvasKeyboard(store);
  const lazyMounter = useMemo(() => createLazyMounter(), []);
  useEffect(() => () => lazyMounter.disconnect(), [lazyMounter]);

  const orderedCells = useMemo(() => getCellsOrderedByZ(cells), [cells]);
  // A hidden cell is filtered out of the RENDER LIST, never out of the store:
  // the inspector can still select it, its formula can still be edited, and
  // undo still restores it. Every render re-evaluates, so a property edit
  // re-answers every formula (no dependency-narrowed cache in the first cut).
  const visibleCells = filterVisibleCells(orderedCells, propertyMap);

  // Hug cells whose content outgrew their frame push neighbours down at
  // render time only — this never writes back to the store (two panes at
  // different widths would fight over persisted heights).
  const displaced = resolveHugDisplacements(visibleCells, heights, layoutConfig.rowGap);
  let contentHeight = STAGE_MIN_HEIGHT;
  for (const cell of visibleCells) {
    const frame = displaced[cell.id] ?? cell.frame;
    const height = Math.max(frame.height, cell.sizing.height === "hug" ? heights.get(cell.id) ?? 0 : 0);
    contentHeight = Math.max(contentHeight, frame.y + height);
  }
  contentHeight = Math.ceil(contentHeight + STAGE_BOTTOM_PADDING);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const shouldShowGuides = !layoutConfig.preview && layoutConfig.guideVisibility !== "never";

  const handleBackgroundPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-layout-cell-id], .osionos-layout-empty-state, .osio-canvas-toolbar")) return;
    if (layoutConfig.preview) {
      dispatch({ type: "clearSelection" });
      return;
    }
    startMarquee(event);
  }, [dispatch, layoutConfig.preview, startMarquee]);

  return (
    <CanvasMeasuredHeightsProvider heights={heights}>
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
        {cells.length === 0 ? (
          <CanvasEmptyState onAdd={cellOps.addCell} onTemplate={cellOps.applyTemplate} />
        ) : null}
        {visibleCells.map((cell) => (
          <CanvasCellView
            key={cell.id}
            cell={cell}
            displayFrame={displaced[cell.id] ?? cell.frame}
            gridConfig={layoutConfig}
            selected={selected.has(cell.id)}
            preview={layoutConfig.preview}
            pageId={pageId}
            layoutBlockId={layoutBlockId}
            properties={propertyMap}
            formulaEngineReady={formulaEngineReady}
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
        <CanvasSelectionToolbar store={store} interaction={interaction} stageRef={stageRef} />
      </div>
    </CanvasMeasuredHeightsProvider>
  );
}
