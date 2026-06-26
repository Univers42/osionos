/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSidebarResize.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useRef } from "react";

interface Options {
  /** Width the drag starts from (px). */
  getStartWidth: () => number;
  /** Called (rAF-paced) during the drag with the live width — write the DOM here, NOT the store. */
  onLiveWidth: (width: number) => void;
  /** Called once on pointer-up with the final width — commit mode/width to the store here. */
  onCommit: (width: number) => void;
}

/**
 * Pointer-capture, rAF-paced drag handler for the sidebar's right edge — the
 * same discipline as the pane splitter (capture survives over iframes/canvas;
 * the drag writes the DOM each frame and commits to the store only on release).
 * Returns an `onPointerDown` to spread onto the resize handle.
 */
export function useSidebarResize({ getStartWidth, onLiveWidth, onCommit }: Options) {
  const raf = useRef<number | null>(null);
  const latest = useRef(0);

  return useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      const startX = event.clientX;
      const startWidth = getStartWidth();
      latest.current = startWidth;
      handle.setPointerCapture(event.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.body.dataset.sidebarResizing = "true";

      const move = (moveEvent: PointerEvent) => {
        latest.current = startWidth + (moveEvent.clientX - startX);
        if (raf.current !== null) return;
        raf.current = requestAnimationFrame(() => {
          raf.current = null;
          onLiveWidth(latest.current);
        });
      };
      const up = (upEvent: PointerEvent) => {
        if (raf.current !== null) {
          cancelAnimationFrame(raf.current);
          raf.current = null;
        }
        handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
        delete document.body.dataset.sidebarResizing;
        onCommit(latest.current);
      };

      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    },
    [getStartWidth, onLiveWidth, onCommit],
  );
}
