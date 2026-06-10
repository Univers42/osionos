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

import React, { useCallback } from "react";

import type { Block } from "@/entities/block";
import { usePageStore } from "@/store/usePageStore";
import type { SurfaceBlockEditorProps } from "../../BlockEditorSurface";
import { useCanvasStoreBridge, type CanvasPersistHandler } from "../store/canvasStore";
import { CanvasStage } from "./CanvasStage";
import "../canvas.css";

export interface CanvasRootProps {
  block: Block;
  pageId: string;
  onUpdateBlock?: (blockId: string, updates: Partial<Block>) => void;
  renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
}

/**
 * Canvas V2 entry: bridges the layout block into the per-block canvas store
 * and renders the stage. Persistence flows back through the same block patch
 * shape as the legacy editor (`layoutCells`/`layoutConfig`), so the stored
 * document format is unchanged.
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
  const modeClass = block.layoutMode === "full_page" ? "osionos-layout-block--full-page" : "osionos-layout-block--inline";

  return (
    <section
      className={`osionos-layout-block ${modeClass} osio-canvas-v2-root`}
      data-layout-mode={block.layoutMode === "full_page" ? "full_page" : "inline"}
    >
      <div className="osionos-layout-shell">
        <CanvasStage
          store={store}
          pageId={pageId}
          layoutBlockId={block.id}
          renderBlockEditor={renderBlockEditor}
        />
      </div>
    </section>
  );
};
