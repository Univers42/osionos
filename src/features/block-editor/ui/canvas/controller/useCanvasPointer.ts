/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCanvasPointer.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, type RefObject } from "react";

import { translateFrame } from "../model/geometry";
import { gridCellFromFrame } from "../model/migration";
import { screenDeltaToFrame, snapFrameToGrid } from "../model/resolveLayout";
import type { CanvasFrame } from "../model/types";
import type { CanvasStoreApi } from "../store/canvasStore";
import { resizeCursorForEdge, type CanvasResizeEdge } from "../view/CanvasResizeHandles";
import type { CanvasInteractionStore } from "./interactionStore";
import {
  clearGestureVars,
  createVerticalAutoScroller,
  moveSnap,
  resizeDeltas,
  setGestureVars,
} from "./useCanvasPointer.helpers";

export interface CanvasPointerHandlers {
  startMove: (event: React.PointerEvent<HTMLElement>, cellId: string) => void;
  startResize: (event: React.PointerEvent<HTMLElement>, cellId: string, edge: CanvasResizeEdge) => void;
}

/**
 * Move/resize gestures, legacy-proven pattern: while the pointer is down
 * nothing dispatches — rAF-batched CSS custom property writes drive the
 * preview, alignment guides go to the transient interaction store, and a
 * single `updateCellFrames` (one history entry, collision push-down) commits
 * on pointerup. Escape cancels.
 */
export function useCanvasPointer(
  store: CanvasStoreApi,
  interaction: CanvasInteractionStore,
  scaleRef: RefObject<number>,
  stageRef: RefObject<HTMLElement | null>,
): CanvasPointerHandlers {
  const beginGesture = useCallback((event: React.PointerEvent<HTMLElement>, cellId: string, edge: CanvasResizeEdge | null) => {
    const stage = stageRef.current;
    const state = store.getState();
    const primary = state.cells.find((cell) => cell.id === cellId);
    if (!stage || !primary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerTarget = event.currentTarget;
    const pointerId = event.pointerId;
    try { pointerTarget.setPointerCapture?.(pointerId); } catch { /* synthetic pointers in tests */ }

    const kind = edge ? "resize" : "move";
    const movingIds = kind === "move" && state.selectedIds.includes(cellId) ? [...state.selectedIds] : [cellId];
    if (!state.selectedIds.includes(cellId)) state.dispatch({ type: "select", ids: [cellId] });
    const movingSet = new Set(movingIds);
    const startFrames = new Map<string, CanvasFrame>();
    const elements = new Map<string, HTMLElement>();
    for (const id of movingIds) {
      const cell = state.cells.find((candidate) => candidate.id === id);
      const element = stage.querySelector<HTMLElement>(`[data-layout-cell-id="${CSS.escape(id)}"]`);
      if (!cell || !element) continue;
      startFrames.set(id, cell.frame);
      elements.set(id, element);
    }
    const sizeBadge = elements.get(cellId)?.querySelector<HTMLElement>(".osionos-layout-size-badge");
    const autoScroller = createVerticalAutoScroller();
    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollY = globalThis.scrollY;
    let lastDelta = { x: 0, y: 0 };
    let frame = 0;
    let cancelled = false;

    const flushPreview = () => {
      frame = 0;
      const config = store.getState().layoutConfig;
      if (kind === "move") {
        const primaryStart = startFrames.get(cellId) ?? primary.frame;
        const snapped = moveSnap(translateFrame(primaryStart, lastDelta), store.getState().cells, movingSet, config, scaleRef.current);
        const applied = { dx: snapped.frame.x - primaryStart.x, dy: snapped.frame.y - primaryStart.y };
        for (const element of elements.values()) setGestureVars(element, applied);
        interaction.getState().setGuides(snapped.guides);
        return;
      }
      const deltas = resizeDeltas(edge!, lastDelta, startFrames.get(cellId) ?? primary.frame);
      const element = elements.get(cellId);
      if (element) setGestureVars(element, deltas);
      if (sizeBadge) {
        const start = startFrames.get(cellId) ?? primary.frame;
        const previewFrame = { x: start.x + deltas.dx, y: start.y + deltas.dy, width: start.width + deltas.dw, height: start.height + deltas.dh };
        const span = gridCellFromFrame(previewFrame, config);
        sizeBadge.textContent = `⤢ ${span.colSpan}×${span.rowSpan}`;
      }
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      autoScroller.update(moveEvent.clientY);
      lastDelta = screenDeltaToFrame(
        { x: moveEvent.clientX - startX, y: moveEvent.clientY - startY + (globalThis.scrollY - startScrollY) },
        scaleRef.current,
      );
      if (!frame) frame = requestAnimationFrame(flushPreview);
    };

    const finish = () => {
      if (frame) cancelAnimationFrame(frame);
      globalThis.removeEventListener("pointermove", handlePointerMove);
      globalThis.removeEventListener("pointerup", handlePointerUp);
      globalThis.removeEventListener("pointercancel", handlePointerUp);
      document.removeEventListener("keydown", handleKeyDown, true);
      autoScroller.stop();
      try { if (pointerTarget.hasPointerCapture?.(pointerId)) pointerTarget.releasePointerCapture(pointerId); } catch { /* already released */ }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      stage.removeAttribute("data-layout-interacting");
      stage.removeAttribute("data-layout-interaction-mode");
      for (const element of elements.values()) clearGestureVars(element);
      interaction.getState().reset();
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      handlePointerMove(upEvent);
      if (frame) cancelAnimationFrame(frame);
      const config = store.getState().layoutConfig;
      const liveCells = store.getState().cells;
      const frames: Record<string, CanvasFrame> = {};
      if (!cancelled && kind === "move") {
        const primaryStart = startFrames.get(cellId) ?? primary.frame;
        const snapped = moveSnap(translateFrame(primaryStart, lastDelta), liveCells, movingSet, config, scaleRef.current);
        const applied = { x: snapped.frame.x - primaryStart.x, y: snapped.frame.y - primaryStart.y };
        for (const [id, start] of startFrames) {
          frames[id] = { ...start, x: Math.max(0, start.x + applied.x), y: Math.max(0, start.y + applied.y) };
        }
      } else if (!cancelled) {
        const start = startFrames.get(cellId) ?? primary.frame;
        const deltas = resizeDeltas(edge!, lastDelta, start);
        const resized = { x: start.x + deltas.dx, y: start.y + deltas.dy, width: start.width + deltas.dw, height: start.height + deltas.dh };
        frames[cellId] = config.snapToGrid ? snapFrameToGrid(resized, config) : resized;
      }
      finish();
      if (!cancelled && Object.keys(frames).length > 0) {
        store.getState().dispatch({ type: "updateCellFrames", frames, resolveCollisions: true });
      }
    };

    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cancelled = true;
      finish();
    };

    document.body.style.cursor = kind === "move" ? "grabbing" : resizeCursorForEdge(edge!);
    document.body.style.userSelect = "none";
    stage.setAttribute("data-layout-interacting", "true");
    stage.setAttribute("data-layout-interaction-mode", kind);
    interaction.getState().setMode(kind);
    globalThis.addEventListener("pointermove", handlePointerMove);
    globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
    globalThis.addEventListener("pointercancel", handlePointerUp, { once: true });
    document.addEventListener("keydown", handleKeyDown, true);
  }, [interaction, scaleRef, stageRef, store]);

  const startMove = useCallback((event: React.PointerEvent<HTMLElement>, cellId: string) => {
    beginGesture(event, cellId, null);
  }, [beginGesture]);

  const startResize = useCallback((event: React.PointerEvent<HTMLElement>, cellId: string, edge: CanvasResizeEdge) => {
    beginGesture(event, cellId, edge);
  }, [beginGesture]);

  return { startMove, startResize };
}
