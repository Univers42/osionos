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

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import type { Block } from "@/entities/block";
import { usePageStore } from "@/store/usePageStore";
import type { SurfaceBlockEditorProps } from "../../BlockEditorSurface";
import { createInteractionStore } from "../controller/interactionStore";
import { useCanvasCellOps } from "../controller/useCanvasCellOps";
import { useCanvasScale } from "../controller/useCanvasScale";
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
  const persist = useCallback<CanvasPersistHandler>((layoutBlockId, patch) => {
    if (onUpdateBlock) {
      onUpdateBlock(layoutBlockId, patch);
      return;
    }
    updateBlock(pageId, layoutBlockId, patch);
  }, [onUpdateBlock, pageId, updateBlock]);
  const store = useCanvasStoreBridge(block.id, block, persist);

  const layoutConfig = useStore(store, (state) => state.layoutConfig);
  const inspectedCellId = useStore(store, (state) => (state.selectedIds.length === 1 ? state.selectedIds[0] : null));
  const dispatch = useStore(store, (state) => state.dispatch);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useCanvasScale(stageRef, layoutConfig);
  const interaction = useMemo(() => createInteractionStore(), []);
  const cellOps = useCanvasCellOps(store, interaction, scaleRef, stageRef);

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
    if (target) dispatch({ type: "select", ids: [target] });
  }, [dispatch, store]);

  return (
    <section
      className={`osionos-layout-block ${modeClass} osio-canvas-v2-root`}
      data-layout-mode={layoutMode}
    >
      <div className="osionos-layout-shell">
        <button
          type="button"
          aria-label="Layout settings"
          title="Layout settings"
          className="osionos-layout-settings-tab"
          onClick={openSettings}
        >
          ⚙
        </button>

        <CanvasToolbar
          store={store}
          onAddCell={cellOps.addCell}
          onApplyTemplate={cellOps.applyTemplate}
          onOpenInspector={openInspector}
        />

        {settingsOpen ? (
          <CanvasSettingsPanel
            store={store}
            layoutMode={layoutMode}
            onSetLayoutMode={setLayoutMode}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}

        {inspectedCellId && !settingsOpen && !layoutConfig.preview ? (
          <CanvasInspector
            store={store}
            cellId={inspectedCellId}
            onClose={() => dispatch({ type: "clearSelection" })}
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
          renderBlockEditor={renderBlockEditor}
        />
      </div>
    </section>
  );
};
