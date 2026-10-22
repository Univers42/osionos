/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useHeightResizeGrip.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useRef, useState, type PointerEvent } from "react";

/** The height after dragging `deltaY` px from `startHeight`, rounded and clamped. */
export function resizedHeight(startHeight: number, deltaY: number, min: number, max = Infinity): number {
  return Math.min(max, Math.max(min, Math.round(startHeight + deltaY)));
}

interface Options {
  /** The height the block currently has. */
  height: number;
  min: number;
  max?: number;
  /** The element whose height the drag writes. */
  resolveTarget: (grip: HTMLElement) => HTMLElement | null;
  /** Called ONCE on release, with the final height, only if the pointer moved. */
  onCommit: (height: number) => void;
}

/** A bottom-edge resize grip. The sized element belongs to a parent that owns the
 *  height style, so a drag writes that element's style directly and commits once on
 *  release; committing per move would run the page-save pipeline at pointer rate.
 *  `isDragging` lets the caller set `pointer-events: none` on an iframe, which would
 *  otherwise swallow the drag at its edge. */
export function useHeightResizeGrip({ height, min, max, resolveTarget, onCommit }: Options) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number; latest: number | null } | null>(null);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = { startY: event.clientY, startHeight: height, latest: null };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    },
    [height],
  );
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.latest = resizedHeight(drag.startHeight, event.clientY - drag.startY, min, max);
      const target = resolveTarget(event.currentTarget);
      if (target) target.style.height = `${drag.latest}px`;
    },
    [min, max, resolveTarget],
  );
  const onPointerEnd = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (drag && drag.latest !== null) onCommit(drag.latest);
  }, [onCommit]);

  return {
    isDragging,
    gripProps: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  };
}
