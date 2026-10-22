/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasRoot.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import type { Block } from "@/entities/block";
import { usePageStore } from "@/store/usePageStore";
import { initFormulaEngine } from "@/shared/notion-database-sys/src/lib/engine/bridge";
import type { SurfaceBlockEditorProps } from "../../BlockEditorSurface";
import { createInteractionStore } from "../controller/interactionStore";
import { useCanvasCellOps } from "../controller/useCanvasCellOps";
import { useCanvasScale } from "../controller/useCanvasScale";
import { evaluateCellVisibility, toPropertyMap } from "../model/visibility";
import { useCanvasStoreBridge, type CanvasPersistHandler } from "../store/canvasStore";
import { CanvasInspector } from "./CanvasInspector";
import { CanvasSettingsPanel } from "./CanvasSettingsPanel";
import { CanvasStage } from "./CanvasStage";
import { CanvasToolbar } from "./CanvasToolbar";
import "../canvas.css";

export interface CanvasRootProps {
  block: Block;
  pageId: string;
  onUpdateBlock?: (blockId: string, updates: Partial<Block>) => void;
  renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
}

/**
 * Canvas V2 entry: bridges the layout block into the per-block canvas store
 * and composes toolbar, panels and stage. Persistence flows back through the
 * same block patch shape as the legacy editor (`layoutCells`/`layoutConfig`),
 * so the stored document format is unchanged.
 */
export const CanvasRoot: React.FC<CanvasRootProps> = ({ block, pageId, onUpdateBlock, renderBlockEditor }) => {
  const updateBlock = usePageStore((state) => state.updateBlock);
  // The formula's context: the page's own properties, the same lookup the
  // header slots use. A property edit re-renders the canvas, and every cell
  // formula answers again against the new values.
  const properties = usePageStore((state) => state.pageById(pageId)?.properties);
  // The formula engine is a lazy WASM module. Until it boots, every formula
  // answers "unavailable" and every cell stays visible, so the canvas asks for
  // it once and re-renders when it is ready.
  const [formulaEngineReady, setFormulaEngineReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    initFormulaEngine()
      .catch(() => false)
      .then((ready) => {
        if (!cancelled) setFormulaEngineReady(ready);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const persist = useCallback<CanvasPersistHandler>((layoutBlockId, patch) => {
    if (onUpdateBlock) {
      onUpdateBlock(layoutBlockId, patch);
      return;
    }
    updateBlock(pageId, layoutBlockId, patch);
  }, [onUpdateBlock, pageId, updateBlock]);
  const store = useCanvasStoreBridge(block.id, block, persist);

  const layoutConfig = useStore(store, (state) => state.layoutConfig);
  const hasSelection = useStore(store, (state) => state.selectedIds.length > 0);
  const cells = useStore(store, (state) => state.cells);
  const dispatch = useStore(store, (state) => state.dispatch);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A cell hidden by its formula has no DOM, so the selection toolbar cannot
  // anchor an inspector to it. The store still keeps the cell, so the canvas
  // toolbar's "Inspector" button opens the panel here instead: the formula of
  // a hidden cell stays editable.
  const [hiddenInspectorId, setHiddenInspectorId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useCanvasScale(stageRef, layoutConfig);
  const interaction = useMemo(() => createInteractionStore(), []);
  const cellOps = useCanvasCellOps(store, interaction, scaleRef, stageRef);
  const propertyMap = useMemo(() => toPropertyMap(properties), [properties]);
  // The panel shows while the cell is still hidden: as soon as its formula
  // lets the cell through again, the panel closes with it.
  const hiddenCell = hiddenInspectorId ? cells.find((candidate) => candidate.id === hiddenInspectorId) : undefined;
  const hiddenCellVisible = hiddenCell ? evaluateCellVisibility(hiddenCell.visibilityFormula, propertyMap) : true;

  const rootRef = useRef<HTMLElement | null>(null);
  // Selection-scoped outside-click dismiss: the listener exists only while a
  // cell is selected (the legacy editor kept a document listener per layout
  // block alive permanently).
  useEffect(() => {
    if (!hasSelection) return undefined;
    const dismissOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      store.getState().dispatch({ type: "clearSelection" });
    };
    document.addEventListener("pointerdown", dismissOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", dismissOnOutsidePress, true);
  }, [hasSelection, store]);

  // Same dismissal for the settings panel: it has no backdrop, and panes stay
  // mounted in the background — without this, a forgotten open panel lingered
  // while the user moved on to other pages.
  useEffect(() => {
    if (!settingsOpen) return undefined;
    const dismissOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", dismissOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", dismissOnOutsidePress, true);
  }, [settingsOpen]);

  const layoutMode = block.layoutMode === "full_page" ? "full_page" : "inline";
  const modeClass = layoutMode === "full_page" ? "osionos-layout-block--full-page" : "osionos-layout-block--inline";
  const setLayoutMode = useCallback((mode: "inline" | "full_page") => {
    if (onUpdateBlock) {
      onUpdateBlock(block.id, { layoutMode: mode });
      return;
    }
    updateBlock(pageId, block.id, { layoutMode: mode });
  }, [block.id, onUpdateBlock, pageId, updateBlock]);
  const openSettings = useCallback(() => {
    dispatch({ type: "clearSelection" });
    setSettingsOpen((value) => !value);
  }, [dispatch]);
  const openInspector = useCallback(() => {
    setSettingsOpen(false);
    const { cells, selectedIds } = store.getState();
    const target = selectedIds[0] ?? cells[0]?.id;
    if (!target) return;
    dispatch({ type: "select", ids: [target] });
    const cell = cells.find((candidate) => candidate.id === target);
    setHiddenInspectorId(cell && !evaluateCellVisibility(cell.visibilityFormula, propertyMap) ? target : null);
  }, [dispatch, propertyMap, store]);

  return (
    <section
      ref={rootRef}
      className={`osionos-layout-block ${modeClass} osio-canvas-v2-root`}
      data-layout-mode={layoutMode}
      data-layout-role={block.layoutRole}
    >
      <div className="osionos-layout-shell">
        {!settingsOpen ? (
          <button
            type="button"
            aria-label="Layout settings"
            title="Layout settings"
            className="osionos-layout-settings-tab"
            onClick={openSettings}
          >
            ⚙
          </button>
        ) : null}

        <CanvasToolbar
          store={store}
          onAddCell={cellOps.addCell}
          onApplyTemplate={cellOps.applyTemplate}
          onOpenInspector={openInspector}
        />

        {hiddenCell && !hiddenCellVisible ? (
          <div
            className="osio-canvas-tb-pop osio-canvas-tb-pop--wide"
            style={{ position: "absolute", left: 8, top: 48, zIndex: "calc(var(--osio-z-popover) + 30)" }}
          >
            <CanvasInspector store={store} cellId={hiddenCell.id} onClose={() => setHiddenInspectorId(null)} />
          </div>
        ) : null}

        {settingsOpen ? (
          <CanvasSettingsPanel
            store={store}
            layoutMode={layoutMode}
            onSetLayoutMode={setLayoutMode}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}

        <CanvasStage
          store={store}
          interaction={interaction}
          cellOps={cellOps}
          stageRef={stageRef}
          scaleRef={scaleRef}
          pageId={pageId}
          layoutBlockId={block.id}
          propertyMap={propertyMap}
          formulaEngineReady={formulaEngineReady}
          renderBlockEditor={renderBlockEditor}
        />
      </div>
    </section>
  );
};
