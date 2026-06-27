/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCanvasMarquee.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, type RefObject } from "react";

import { framesIntersect } from "../model/geometry";
import type { CanvasFrame } from "../model/types";
import type { CanvasStoreApi } from "../store/canvasStore";
import type { CanvasInteractionStore } from "./interactionStore";

function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): CanvasFrame {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Background drag = marquee multi-select. The rectangle lives in the
 * transient interaction store (frame space); intersecting cells are selected
 * live while dragging.
 */
export function useCanvasMarquee(
  store: CanvasStoreApi,
  interaction: CanvasInteractionStore,
  scaleRef: RefObject<number>,
  stageRef: RefObject<HTMLElement | null>,
): (event: React.PointerEvent<HTMLElement>) => void {
  return useCallback((event: React.PointerEvent<HTMLElement>) => {
    const stage = stageRef.current;
    if (!stage || event.button !== 0) return;
    const rect = stage.getBoundingClientRect();
    const startScrollY = globalThis.scrollY;
    const toFrame = (clientX: number, clientY: number) => ({
      x: Math.max(0, (clientX - rect.left) / Math.max(scaleRef.current, 0.01)),
      y: Math.max(0, clientY - rect.top + (globalThis.scrollY - startScrollY)),
    });
    const origin = toFrame(event.clientX, event.clientY);
    const { dispatch } = store.getState();
    if (store.getState().selectedIds.length > 0) dispatch({ type: "clearSelection" });

    let last = origin;
    let frame = 0;
    let dragging = false;

    const flush = () => {
      frame = 0;
      const marquee = rectFromPoints(origin, last);
      interaction.getState().setMarquee(marquee);
      const hits = store.getState().cells
        .filter((cell) => framesIntersect(marquee, cell.frame))
        .map((cell) => cell.id);
      const current = store.getState().selectedIds;
      if (hits.length !== current.length || hits.some((id, index) => current[index] !== id)) {
        dispatch({ type: "select", ids: hits });
      }
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      last = toFrame(moveEvent.clientX, moveEvent.clientY);
      if (!dragging && (Math.abs(last.x - origin.x) > 2 || Math.abs(last.y - origin.y) > 2)) {
        dragging = true;
        interaction.getState().setMode("marquee");
      }
      if (dragging && !frame) frame = requestAnimationFrame(flush);
    };

    const handlePointerUp = () => {
      if (frame) cancelAnimationFrame(frame);
      globalThis.removeEventListener("pointermove", handlePointerMove);
      globalThis.removeEventListener("pointerup", handlePointerUp);
      globalThis.removeEventListener("pointercancel", handlePointerUp);
      interaction.getState().reset();
    };

    globalThis.addEventListener("pointermove", handlePointerMove);
    globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
    globalThis.addEventListener("pointercancel", handlePointerUp, { once: true });
  }, [interaction, scaleRef, stageRef, store]);
}
