/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCanvasKeyboard.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback } from "react";

import { translateFrame } from "../model/geometry";
import { nudgeFrames, resizeFrames } from "../model/frameOps";
import { gridStep } from "../model/resolveLayout";
import type { CanvasStoreApi } from "../store/canvasStore";

const FINE_STEP_PX = 1;

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * Keyboard control for the selected cells, attached to the layout block root
 * (NOT document — the legacy editor ran a capture-phase document listener per
 * layout block on every keystroke in the app). Arrows nudge by the grid step
 * (1px when snap-to-grid is off), shift+arrows resize, Delete removes,
 * Ctrl+D duplicates, Ctrl+Z/Shift+Z undo/redo, Ctrl+A selects all, Escape
 * clears the selection.
 */
export function useCanvasKeyboard(store: CanvasStoreApi): (event: React.KeyboardEvent<HTMLElement>) => void {
  return useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const { cells, selectedIds, layoutConfig, dispatch } = store.getState();
    const editable = isEditableTarget(event.target);

    if (event.key === "Escape" && !editable) {
      if (selectedIds.length === 0) return;
      dispatch({ type: "clearSelection" });
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (editable) return;

    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        dispatch({ type: (key === "z" && !event.shiftKey) ? "undo" : "redo" });
      } else if (key === "a") {
        dispatch({ type: "select", ids: cells.map((cell) => cell.id) });
      } else if (key === "d" && selectedIds.length > 0) {
        for (const id of selectedIds) {
          const cell = cells.find((candidate) => candidate.id === id);
          if (!cell) continue;
          dispatch({ type: "duplicateCell", id, newId: crypto.randomUUID(), frame: translateFrame(cell.frame, { x: 24, y: 24 }) });
        }
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (selectedIds.length === 0) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      dispatch({ type: "removeCells", ids: selectedIds });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = arrows[event.key];
    if (!direction) return;
    const step = layoutConfig.snapToGrid && !event.altKey ? gridStep(layoutConfig) : { x: FINE_STEP_PX, y: FINE_STEP_PX };
    const ids = new Set(selectedIds);
    const frames = event.shiftKey
      ? resizeFrames(cells, ids, direction[0] * step.x, direction[1] * step.y)
      : nudgeFrames(cells, ids, direction[0] * step.x, direction[1] * step.y);
    if (Object.keys(frames).length === 0) return;
    dispatch({ type: "updateCellFrames", frames, resolveCollisions: true });
    event.preventDefault();
    event.stopPropagation();
  }, [store]);
}
