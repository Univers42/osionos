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
        // The splitter IS the gap between two cards. Its hit area is never under
        // --osio-splitter-hit-min (the ::before) even when the gap is 0; the hairline
        // (::after) is the seam at gap 0 and otherwise shows on hover or drag.
        "relative shrink-0 z-20 bg-transparent before:absolute after:absolute after:bg-[var(--osio-pane-seam)] hover:after:bg-[var(--osio-accent)]/60 active:after:bg-[var(--osio-accent)]/60 after:transition-colors after:duration-[120ms]",
        direction === "row"
          ? "w-[var(--osio-frame-gap)] cursor-col-resize before:inset-y-0 before:left-1/2 before:w-[max(100%,var(--osio-splitter-hit-min))] before:-translate-x-1/2 after:inset-y-0 after:left-1/2 after:w-px"
          : "h-[var(--osio-frame-gap)] cursor-row-resize before:inset-x-0 before:top-1/2 before:h-[max(100%,var(--osio-splitter-hit-min))] before:-translate-y-1/2 after:inset-x-0 after:top-1/2 after:h-px",
        dragActive ? "pointer-events-none" : "",
      ].join(" ")}
    />
  );
};
