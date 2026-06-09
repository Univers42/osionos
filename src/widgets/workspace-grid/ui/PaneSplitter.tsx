/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PaneSplitter.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef } from "react";
import { useSidebarTreeDnd } from "@/widgets/sidebar/model/sidebarTreeDnd";

interface Props {
  direction: "row" | "column";
  /** Pointer-down: snapshot the sizes the drag starts from (avoids stale-closure jitter). */
  onResizeStart: () => void;
  /** Signed fraction of the container the divider has moved SINCE pointer-down (absolute). */
  onResize: (deltaFraction: number) => void;
  /** Pointer-up: commit the final sizes (the drag itself never touches the store). */
  onResizeEnd: () => void;
}

/** Draggable divider between two panes. Pointer-capture keeps the drag alive even over the
 *  graph canvas / iframes, and the delta is absolute-from-start so sizes accumulate cleanly. */
export const PaneSplitter: React.FC<Props> = ({ direction, onResizeStart, onResize, onResizeEnd }) => {
  const ref = useRef<HTMLDivElement>(null);
  // The splitter sits at z-20 (above each pane's z-10 drop-capture layer). During an
  // external tab/page drag it must NOT intercept the drag, or a drop near a divider
  // (e.g. the bottom edge of a stacked pane) is rejected and the split never happens.
  const dragActive = useSidebarTreeDnd((s) => s.dragKind !== null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = ref.current;
    const container = handle?.parentElement;
    if (!handle || !container) return;
    const span = direction === "row" ? container.clientWidth : container.clientHeight;
    const start = direction === "row" ? event.clientX : event.clientY;
    handle.setPointerCapture(event.pointerId);
    onResizeStart();

    const move = (moveEvent: PointerEvent) => {
      const current = direction === "row" ? moveEvent.clientX : moveEvent.clientY;
      if (span > 0) onResize((current - start) / span);
    };
    const up = (upEvent: PointerEvent) => {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      delete document.body.dataset.paneResizing;
      onResizeEnd();
    };
    document.body.style.cursor = direction === "row" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    // Flags the drag for CSS: off-screen layout cells skip layout entirely
    // (content-visibility) while panes are being reshaped, which is where
    // most of a heavy dashboard's per-frame reflow cost lives.
    document.body.dataset.paneResizing = "true";
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={ref}
      role="separator"
      data-pane-splitter={direction}
      aria-orientation={direction === "row" ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      className={[
        "shrink-0 z-20 bg-[var(--osio-border)]/40 hover:bg-[var(--osio-accent)]/60 transition-colors",
        direction === "row" ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
        dragActive ? "pointer-events-none" : "",
      ].join(" ")}
    />
  );
};
