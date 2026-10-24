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
import { DOCK_MIN_HEIGHT, clampDockHeight } from "@/widgets/workbench/model/workbenchLayout";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";

const KEY_STEP = 16;

/** Horizontal separator above the dock. Dragging up grows the dock. The
 *  sidebar's resize hook is X-axis only, so this owns its (small) Y drag.
 *  Like PaneSplitter it IS the gap between two cards: the box is the frame gap
 *  (pulled up over the grid's own bottom gutter so the two do not add up), the
 *  hit area never under --osio-splitter-hit-min (::before), and the hairline
 *  (::after) is the seam at gap 0, otherwise shown on hover, drag and focus. */
export const DockSplitter: React.FC = () => {
  const height = useWorkbenchStore((s) => s.dockHeight);
  const setHeight = useWorkbenchStore((s) => s.setDockHeight);
  const drag = React.useRef<{ startY: number; startHeight: number } | null>(null);
  // Edge to edge the 6px hit area overlaps the panes' bottom edge, so a tab
  // being dragged must reach them, as with PaneSplitter.
  const dragActive = useDragSession((s) => s.dragKind !== null);
  const max = clampDockHeight(Number.MAX_SAFE_INTEGER, globalThis.innerHeight);
  // Stored height can predate a smaller window; report what is actually drawn.
  const shown = clampDockHeight(height, globalThis.innerHeight);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next: Record<string, number> = {
      ArrowUp: shown + KEY_STEP,
      ArrowDown: shown - KEY_STEP,
      Home: DOCK_MIN_HEIGHT,
      End: max,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    setHeight(next[e.key] ?? height);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startHeight: shown };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) setHeight(drag.current.startHeight + (drag.current.startY - e.clientY));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize panel"
      aria-valuenow={shown}
      aria-valuemin={DOCK_MIN_HEIGHT}
      aria-valuemax={max}
      tabIndex={0}
      data-testid="dock-splitter"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-osio-dock-splitter
      className={[
        "relative z-20 mx-[var(--osio-frame-gap)] -mt-[var(--osio-frame-gap)] h-[var(--osio-frame-gap)] shrink-0 cursor-row-resize touch-none bg-transparent",
        "before:absolute before:inset-x-0 before:top-1/2 before:h-[max(100%,var(--osio-splitter-hit-min))] before:-translate-y-1/2",
        "after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-[var(--osio-pane-seam)] after:transition-colors after:duration-(--osio-dur-fast)",
        "hover:after:bg-[var(--osio-accent)]/60 active:after:bg-[var(--osio-accent)] focus-visible:after:h-[var(--osio-focus-ring-width)] focus-visible:after:bg-[var(--osio-accent)]",
        dragActive ? "pointer-events-none" : "",
      ].join(" ")}
    />
  );
};
