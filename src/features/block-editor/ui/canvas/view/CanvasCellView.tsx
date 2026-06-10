/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasCellView.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback } from "react";

import type { SurfaceBlockEditorProps } from "../../BlockEditorSurface";
import type { LazyMounter } from "../controller/lazyMount";
import { frameEquals, roundFrameForDom } from "../model/geometry";
import { gridCellFromFrame } from "../model/migration";
import { legacySizingFromCanvas } from "../model/migrationMaps";
import type { CanvasCell, CanvasFrame, CanvasGridConfig } from "../model/types";
import { CanvasCellChrome } from "./CanvasCellChrome";
import { CanvasCellSurface } from "./CanvasCellSurface";
import { CanvasResizeHandles, type CanvasResizeEdge } from "./CanvasResizeHandles";

export interface CanvasCellViewProps {
  cell: CanvasCell;
  /** Authored frame, or the hug-displaced presentation frame for this stage. */
  displayFrame: CanvasFrame;
  gridConfig: CanvasGridConfig;
  selected: boolean;
  preview: boolean;
  pageId: string;
  layoutBlockId: string;
  lazyMounter: LazyMounter;
  renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
  onSelectCell: (cellId: string, additive: boolean) => void;
  onStartMove: (event: React.PointerEvent<HTMLElement>, cellId: string) => void;
  onStartResize: (event: React.PointerEvent<HTMLElement>, cellId: string, edge: CanvasResizeEdge) => void;
  onMeasureCell: (cellId: string, element: HTMLElement | null) => void;
  onRenameCell: (cellId: string, label: string) => void;
  onAddCell: () => void;
  onInspectCell: (cellId: string) => void;
  onDuplicateCell: (cellId: string) => void;
  onDeleteCell: (cellId: string) => void;
}

function isInteractivePointerTarget(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest(
    'button, input, textarea, select, a, [contenteditable="true"], [data-layout-cell-handle], [data-layout-resize-handle]',
  ));
}

// Cells re-render only when their own data changes: the reducer preserves
// object identity for untouched cells, so comparing the cell reference (plus
// the few presentation inputs) replaces the legacy field-by-field comparator
// and its stale-config bug class. Callbacks are identity-ignored — the stage
// keeps them stable and internally reads live refs.
function cellViewPropsEqual(prev: CanvasCellViewProps, next: CanvasCellViewProps): boolean {
  return prev.cell === next.cell &&
    prev.selected === next.selected &&
    prev.preview === next.preview &&
    prev.gridConfig === next.gridConfig &&
    prev.pageId === next.pageId &&
    prev.layoutBlockId === next.layoutBlockId &&
    frameEquals(prev.displayFrame, next.displayFrame);
}

const CanvasCellViewComponent: React.FC<CanvasCellViewProps> = ({
  cell,
  displayFrame,
  gridConfig,
  selected,
  preview,
  pageId,
  layoutBlockId,
  lazyMounter,
  renderBlockEditor,
  onSelectCell,
  onStartMove,
  onStartResize,
  onMeasureCell,
  onRenameCell,
  onAddCell,
  onInspectCell,
  onDuplicateCell,
  onDeleteCell,
}) => {
  const frame = roundFrameForDom(displayFrame);
  const span = gridCellFromFrame(cell.frame, gridConfig);
  const sizing = legacySizingFromCanvas(cell.sizing);
  const hugHeight = cell.sizing.height === "hug";

  const handlePointerDownCapture = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (preview || event.button !== 0) return;
    if (isInteractivePointerTarget(event.target)) return;
    onSelectCell(cell.id, event.shiftKey);
  }, [cell.id, onSelectCell, preview]);

  const measureRef = useCallback(
    (node: HTMLDivElement | null) => onMeasureCell(cell.id, hugHeight ? node : null),
    [cell.id, hugHeight, onMeasureCell],
  );

  return (
    <section
      aria-label={cell.visuals.label || "Layout cell"}
      className="osionos-layout-cell group/cell"
      data-layout-cell-id={cell.id}
      data-layout-cell-selected={selected ? "true" : undefined}
      data-layout-sizing={sizing}
      data-layout-wrap={cell.wrap === false ? "false" : "true"}
      data-layout-padding={cell.visuals.padding ?? "comfortable"}
      data-layout-font-size={cell.visuals.fontSize ?? "base"}
      data-layout-col-start={span.colStart}
      data-layout-col-span={span.colSpan}
      data-layout-row-start={span.rowStart}
      data-layout-row-span={span.rowSpan}
      style={{
        zIndex: cell.z + 1,
        color: cell.visuals.foreground,
        backgroundColor: cell.visuals.background,
        "--osio-cell-x": `${frame.x}px`,
        "--osio-cell-y": `${frame.y}px`,
        "--osio-cell-w": `${frame.width}px`,
        "--osionos-layout-cell-min-height": `${frame.height}px`,
      } as React.CSSProperties}
      onFocusCapture={() => onSelectCell(cell.id, false)}
      onPointerDownCapture={handlePointerDownCapture}
    >
      {preview ? null : (
        <CanvasCellChrome
          label={cell.visuals.label ?? ""}
          colSpan={span.colSpan ?? 1}
          rowSpan={span.rowSpan ?? 1}
          onStartMove={(event) => onStartMove(event, cell.id)}
          onRename={(label) => onRenameCell(cell.id, label)}
          onAddCell={onAddCell}
          onInspect={() => onInspectCell(cell.id)}
          onDuplicate={() => onDuplicateCell(cell.id)}
          onDelete={() => onDeleteCell(cell.id)}
        />
      )}
      <div ref={measureRef} className="osionos-layout-cell-editor">
        <CanvasCellSurface
          pageId={pageId}
          layoutBlockId={layoutBlockId}
          cellId={cell.id}
          blocks={cell.blocks}
          locked={preview || cell.type === "spacer"}
          lazyMounter={lazyMounter}
          renderBlockEditor={renderBlockEditor}
        />
      </div>
      {preview ? null : <CanvasResizeHandles onStartResize={(event, edge) => onStartResize(event, cell.id, edge)} />}
    </section>
  );
};

export const CanvasCellView = React.memo(CanvasCellViewComponent, cellViewPropsEqual);
CanvasCellView.displayName = "CanvasCellView";
