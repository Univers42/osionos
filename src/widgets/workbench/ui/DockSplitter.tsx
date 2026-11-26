/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DockSplitter.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { useDragSession } from "@/store/dragSession";
import {
  DOCK_MIN_HEIGHT,
  DOCK_MIN_WIDTH,
  clampDockHeight,
  clampDockWidth,
  dockDragDelta,
  dockKeySize,
  type DockPosition,
} from "@/widgets/workbench/model/workbenchLayout";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";
import { SPLITTER_CLASS } from "./dockSplitterClasses";

/** What one axis of the splitter reads and writes: the shown size, its bounds and its setter. */
interface Axis {
  shown: number;
  min: number;
  max: number;
  set: (px: number) => void;
}

/** The size, bounds and setter for `position`: height at the bottom, width on a side.
 *  The stored size can predate a smaller window, so `shown` is what is actually drawn. */
function useAxis(position: DockPosition): Axis {
  const height = useWorkbenchStore((s) => s.dockHeight);
  const width = useWorkbenchStore((s) => s.dockWidth);
  const setHeight = useWorkbenchStore((s) => s.setDockHeight);
  const setWidth = useWorkbenchStore((s) => s.setDockWidth);
  if (position === "bottom") {
    const max = clampDockHeight(Number.MAX_SAFE_INTEGER, globalThis.innerHeight);
    return { shown: clampDockHeight(height, globalThis.innerHeight), min: DOCK_MIN_HEIGHT, max, set: setHeight };
  }
  const max = clampDockWidth(Number.MAX_SAFE_INTEGER, globalThis.innerWidth);
  return { shown: clampDockWidth(width, globalThis.innerWidth), min: DOCK_MIN_WIDTH, max, set: setWidth };
}

/** The separator between the editor area and the dock. Dragging toward the editor grows the
 *  dock, whichever side it is on. The sidebar's resize hook is X-axis only, so this owns its
 *  own drag. Like PaneSplitter it IS the gap between two cards: the box is the frame gap (pulled
 *  over the grid's own gutter so the two do not add up), the hit area never under
 *  --osio-splitter-hit-min (::before), and the hairline (::after) is the seam at gap 0,
 *  otherwise shown on hover, drag and focus. While a tab is being dragged it ignores the pointer,
 *  because edge to edge its hit area overlaps the panes' edge and the tab must reach them. */
export const DockSplitter: React.FC<{ position: DockPosition }> = ({ position }) => {
  const { shown, min, max, set } = useAxis(position);
  const drag = React.useRef<{ x: number; y: number; start: number } | null>(null);
  const dragActive = useDragSession((s) => s.dragKind !== null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = dockKeySize(position, e.key, shown, min, max);
    if (next === null) return;
    e.preventDefault();
    set(next);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: shown };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { x, y, start } = drag.current;
    set(start + dockDragDelta(position, { x, y }, { x: e.clientX, y: e.clientY }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      role="separator"
      aria-orientation={position === "bottom" ? "horizontal" : "vertical"}
      aria-label="Resize panel"
      aria-valuenow={shown}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-testid="dock-splitter"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-osio-dock-splitter
      className={dragActive ? `${SPLITTER_CLASS[position]} pointer-events-none` : SPLITTER_CLASS[position]}
    />
  );
};
