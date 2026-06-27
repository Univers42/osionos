/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSelectionAnchor.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useLayoutEffect, useState, type RefObject } from "react";
import { useStore } from "zustand";

import type { CanvasInteractionStore } from "./interactionStore";
import type { CanvasStoreApi } from "../store/canvasStore";

/** Position of the in-place selection toolbar, in the stage's own (unscaled,
 *  scroll-stable) coordinate box — left/top/width/height of the selection
 *  bounding rect relative to the stage element. */
export interface SelectionAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Anchors the floating toolbar to the current selection by reading the selected
 * cells' bounding rects (transform-aware: the canvas scales X but not Y). It
 * recomputes only on selection / frame-commit / container-resize, and HIDES
 * during any active gesture (`interaction.mode !== null`) so the toolbar never
 * repositions per-frame — the cells already isolate the drag from React.
 */
export function useSelectionAnchor(
  store: CanvasStoreApi,
  interaction: CanvasInteractionStore,
  stageRef: RefObject<HTMLElement | null>,
): SelectionAnchor | null {
  const selectedIds = useStore(store, (state) => state.selectedIds);
  const cells = useStore(store, (state) => state.cells); // frame-commit reactivity
  const mode = useStore(interaction, (state) => state.mode);
  const preview = useStore(store, (state) => state.layoutConfig.preview);
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const active = Boolean(stage) && !preview && mode === null && selectedIds.length > 0;
    // setAnchor is only ever called from `measure` (run via rAF / ResizeObserver),
    // never synchronously in the effect body — measuring the DOM a frame later
    // avoids cascading-render churn and is imperceptible.
    const measure = () => {
      if (!active || !stage) return setAnchor(null);
      const stageRect = stage.getBoundingClientRect();
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const id of selectedIds) {
        const element = stage.querySelector(`[data-layout-cell-id="${CSS.escape(id)}"]`);
        if (!(element instanceof HTMLElement)) continue;
        const rect = element.getBoundingClientRect();
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
      }
      return setAnchor(Number.isFinite(left) ? { left: left - stageRect.left, top: top - stageRect.top, width: right - left, height: bottom - top } : null);
    };
    const raf = requestAnimationFrame(measure);
    if (!active || !stage || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(raf);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [selectedIds, cells, mode, preview, stageRef]);

  return anchor;
}
