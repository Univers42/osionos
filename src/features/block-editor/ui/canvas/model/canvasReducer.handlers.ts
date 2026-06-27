/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   canvasReducer.handlers.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { resolveOverlapsByPushDown } from "./collision";
import { redoCanvasHistory, snapshotCanvas, undoCanvasHistory } from "./history";
import { getNextZ } from "./selectors";
import type { CanvasCell, CanvasFrame, CanvasGridConfig, CanvasState } from "./types";

export function updateCellHandler(state: CanvasState, id: string, update: (cell: CanvasCell) => CanvasCell, withHistory: (previous: CanvasState, next: CanvasState) => CanvasState): CanvasState {
  let changed = false;
  const cells = state.cells.map((cell) => {
    if (cell.id !== id) return cell;
    changed = true;
    return update(cell);
  });
  return changed ? withHistory(state, { ...state, cells }) : state;
}

/**
 * Commit one or many frames in a single history entry. With
 * `resolveCollisions` and `noOverlap` enabled, overlapped neighbours are
 * pushed straight down instead of reverting the gesture.
 */
export function updateCellFramesHandler(state: CanvasState, frames: Record<string, CanvasFrame>, resolveCollisions: boolean, withHistory: (previous: CanvasState, next: CanvasState) => CanvasState): CanvasState {
  let merged = frames;
  if (resolveCollisions && state.layoutConfig.noOverlap) {
    const placed = state.cells.map((cell) => (frames[cell.id] ? { ...cell, frame: frames[cell.id] } : cell));
    const displaced = resolveOverlapsByPushDown(placed, new Set(Object.keys(frames)), state.layoutConfig.rowGap);
    merged = { ...displaced, ...frames };
  }
  let changed = false;
  const cells = state.cells.map((cell) => {
    const frame = merged[cell.id];
    if (!frame || (frame.x === cell.frame.x && frame.y === cell.frame.y && frame.width === cell.frame.width && frame.height === cell.frame.height)) return cell;
    changed = true;
    return { ...cell, frame };
  });
  return changed ? withHistory(state, { ...state, cells }) : state;
}

export function duplicateCellHandler(state: CanvasState, id: string, newId: string, frame: CanvasFrame | undefined, withHistory: (previous: CanvasState, next: CanvasState) => CanvasState): CanvasState {
  const source = state.cells.find((cell) => cell.id === id);
  const targetFrame = frame ?? source?.frame;
  if (!source || !targetFrame) return state;
  const duplicate: CanvasCell = structuredClone({ ...source, id: newId, frame: targetFrame, z: getNextZ(state.cells) });
  return withHistory(state, { ...state, cells: [...state.cells, duplicate], selectedIds: [newId] });
}

export function restoreHistoryHandler(state: CanvasState, direction: "undo" | "redo"): CanvasState {
  const current = snapshotCanvas(state.cells, state.selectedIds);
  const result = direction === "undo" ? undoCanvasHistory(state.history, current) : redoCanvasHistory(state.history, current);
  if (!result.snapshot) return state;
  return { ...state, cells: result.snapshot.cells, selectedIds: result.snapshot.selectedIds, history: result.history };
}

export function updateLayoutConfigHandler(state: CanvasState, patch: Partial<CanvasGridConfig>, withHistory: (previous: CanvasState, next: CanvasState) => CanvasState): CanvasState {
  return withHistory(state, { ...state, layoutConfig: { ...state.layoutConfig, ...patch } });
}
