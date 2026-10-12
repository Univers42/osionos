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

import { DOCK_MIN_HEIGHT, clampDockHeight } from "@/widgets/workbench/model/workbenchLayout";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";

const KEY_STEP = 16;

/** Horizontal separator above the dock. Dragging up grows the dock. The
 *  sidebar's resize hook is X-axis only, so this owns its (small) Y drag. */
export const DockSplitter: React.FC = () => {
  const height = useWorkbenchStore((s) => s.dockHeight);
  const setHeight = useWorkbenchStore((s) => s.setDockHeight);
  const drag = React.useRef<{ startY: number; startHeight: number } | null>(null);
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
      className="h-1 shrink-0 cursor-row-resize touch-none bg-[var(--osio-border-default)] hover:bg-[var(--osio-accent)] focus-visible:bg-[var(--osio-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--osio-focus-ring-color)]"
    />
  );
};
