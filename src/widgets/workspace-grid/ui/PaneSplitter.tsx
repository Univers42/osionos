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

interface Props {
  direction: "row" | "column";
  /** Pointer-down: snapshot the sizes the drag starts from (avoids stale-closure jitter). */
  onResizeStart: () => void;
  /** Signed fraction of the container the divider has moved SINCE pointer-down (absolute). */
  onResize: (deltaFraction: number) => void;
}

/** Draggable divider between two panes. Pointer-capture keeps the drag alive even over the
 *  graph canvas / iframes, and the delta is absolute-from-start so sizes accumulate cleanly. */
export const PaneSplitter: React.FC<Props> = ({ direction, onResizeStart, onResize }) => {
  const ref = useRef<HTMLDivElement>(null);

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
    };
    document.body.style.cursor = direction === "row" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={direction === "row" ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      className={[
        "shrink-0 z-20 bg-[var(--osio-border)]/40 hover:bg-[var(--osio-accent)]/60 transition-colors",
        direction === "row" ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
      ].join(" ")}
    />
  );
};
