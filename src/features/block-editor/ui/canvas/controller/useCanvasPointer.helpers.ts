/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCanvasPointer.helpers.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { CANVAS_CELL_MIN_SIZE } from "../model/frameOps";
import { snapFrameToGrid } from "../model/resolveLayout";
import { snapFrameToCells, type SnapGuide } from "../model/snapping";
import type { CanvasCell, CanvasFrame, CanvasLayoutConfig } from "../model/types";
import type { CanvasResizeEdge } from "../view/CanvasResizeHandles";

export interface GestureDeltas {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

const SNAP_GUIDE_THRESHOLD_PX = 6;
const AUTOSCROLL_ZONE_PX = 72;
const AUTOSCROLL_MAX_SPEED = 28;

/** Per-edge resize deltas in frame space, clamped to the minimum cell size. */
export function resizeDeltas(edge: CanvasResizeEdge, delta: { x: number; y: number }, start: CanvasFrame): GestureDeltas {
  const out: GestureDeltas = { dx: 0, dy: 0, dw: 0, dh: 0 };
  if (edge.includes("right")) out.dw = Math.max(delta.x, CANVAS_CELL_MIN_SIZE - start.width);
  if (edge.includes("left")) {
    const clamped = Math.min(Math.max(delta.x, -start.x), start.width - CANVAS_CELL_MIN_SIZE);
    out.dx = clamped;
    out.dw = -clamped;
  }
  if (edge.includes("bottom")) out.dh = Math.max(delta.y, CANVAS_CELL_MIN_SIZE - start.height);
  if (edge.includes("top")) {
    const clamped = Math.min(Math.max(delta.y, -start.y), start.height - CANVAS_CELL_MIN_SIZE);
    out.dy = clamped;
    out.dh = -clamped;
  }
  return out;
}

/**
 * Move target for the gesture's primary cell: grid snap (when enabled) first,
 * then alignment snap against the other cells — alignment intentionally wins
 * so neighbours can be matched even off-grid.
 */
export function moveSnap(
  desired: CanvasFrame,
  cells: CanvasCell[],
  movingIds: ReadonlySet<string>,
  config: CanvasLayoutConfig,
  scaleX: number,
): { frame: CanvasFrame; guides: SnapGuide[] } {
  const clamped = { ...desired, x: Math.max(0, desired.x), y: Math.max(0, desired.y) };
  const gridded = config.snapToGrid ? snapFrameToGrid(clamped, config) : clamped;
  const aligned = snapFrameToCells(gridded, cells, { zoom: scaleX, thresholdPx: SNAP_GUIDE_THRESHOLD_PX }, new Set(movingIds));
  return {
    frame: { ...aligned.frame, x: Math.max(0, aligned.frame.x), y: Math.max(0, aligned.frame.y) },
    guides: aligned.guides,
  };
}

export function setGestureVars(element: HTMLElement, deltas: Partial<GestureDeltas>): void {
  if (deltas.dx !== undefined) element.style.setProperty("--osio-cell-dx", `${deltas.dx}px`);
  if (deltas.dy !== undefined) element.style.setProperty("--osio-cell-dy", `${deltas.dy}px`);
  if (deltas.dw !== undefined) element.style.setProperty("--osio-cell-dw", `${deltas.dw}px`);
  if (deltas.dh !== undefined) element.style.setProperty("--osio-cell-dh", `${deltas.dh}px`);
}

export function clearGestureVars(element: HTMLElement): void {
  element.style.removeProperty("--osio-cell-dx");
  element.style.removeProperty("--osio-cell-dy");
  element.style.removeProperty("--osio-cell-dw");
  element.style.removeProperty("--osio-cell-dh");
}

/** Window auto-scroll while dragging near the vertical viewport edges. */
export function createVerticalAutoScroller(): { update: (clientY: number) => void; stop: () => void } {
  let pointerY = 0;
  let frame = 0;
  let active = true;

  const speedAt = (pointer: number, end: number): number => {
    if (pointer < AUTOSCROLL_ZONE_PX) {
      return -Math.ceil(Math.min(1, (AUTOSCROLL_ZONE_PX - pointer) / AUTOSCROLL_ZONE_PX) * AUTOSCROLL_MAX_SPEED);
    }
    if (pointer > end - AUTOSCROLL_ZONE_PX) {
      return Math.ceil(Math.min(1, (pointer - (end - AUTOSCROLL_ZONE_PX)) / AUTOSCROLL_ZONE_PX) * AUTOSCROLL_MAX_SPEED);
    }
    return 0;
  };

  const tick = () => {
    frame = 0;
    if (!active) return;
    const speed = speedAt(pointerY, document.documentElement.clientHeight);
    if (!speed) return;
    globalThis.scrollBy(0, speed);
    frame = requestAnimationFrame(tick);
  };

  return {
    update(clientY: number) {
      pointerY = clientY;
      if (!frame) frame = requestAnimationFrame(tick);
    },
    stop() {
      active = false;
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
