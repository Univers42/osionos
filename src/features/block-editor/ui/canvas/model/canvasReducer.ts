/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   canvasReducer.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { pushCanvasHistory, redoCanvasHistory, snapshotCanvas, undoCanvasHistory } from "./history";
import { getNextZ } from "./selectors";
import type { CanvasAction, CanvasCell, CanvasState } from "./types";

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "select":
      return { ...state, selectedIds: uniqueIds(action.ids) };
    case "clearSelection":
      return { ...state, selectedIds: [] };
    case "setTool":
      return { ...state, tool: action.tool };
    case "setViewport":
      return { ...state, viewport: { ...state.viewport, ...action.viewport } };
    case "setSnapToGrid":
      return { ...state, layoutConfig: { ...state.layoutConfig, snapToGrid: action.enabled } };
    case "setNoOverlap":
      return { ...state, layoutConfig: { ...state.layoutConfig, noOverlap: action.enabled } };
    case "addCell":
      return withHistory(state, { ...state, cells: [...state.cells, { ...action.cell, z: action.cell.z ?? getNextZ(state.cells) }], selectedIds: [action.cell.id] });
    case "updateCellFrame":
      return updateCell(state, action.id, (cell) => ({ ...cell, frame: action.frame }));
    case "updateCell":
      return updateCell(state, action.id, (cell) => ({ ...cell, ...action.patch }));
    case "removeCell":
      return withHistory(state, { ...state, cells: state.cells.filter((cell) => cell.id !== action.id), selectedIds: state.selectedIds.filter((id) => id !== action.id) });
    case "duplicateCell":
      return duplicateCell(state, action.id, action.newId, action.frame);
    case "setCellZ":
      return updateCell(state, action.id, (cell) => ({ ...cell, z: action.z }));
    case "undo":
      return restoreHistory(state, "undo");
    case "redo":
      return restoreHistory(state, "redo");
    default:
      return state;
  }
}

export function isPersistableCanvasAction(action: CanvasAction): boolean {
  return ["addCell", "updateCellFrame", "updateCell", "removeCell", "duplicateCell", "setCellZ", "setSnapToGrid", "setNoOverlap", "undo", "redo"].includes(action.type);
}

function updateCell(state: CanvasState, id: string, update: (cell: CanvasCell) => CanvasCell): CanvasState {
  let changed = false;
  const cells = state.cells.map((cell) => {
    if (cell.id !== id) return cell;
    changed = true;
    return update(cell);
  });
  return changed ? withHistory(state, { ...state, cells }) : state;
}

function duplicateCell(state: CanvasState, id: string, newId: string, frame = state.cells.find((cell) => cell.id === id)?.frame): CanvasState {
  const source = state.cells.find((cell) => cell.id === id);
  if (!source || !frame) return state;
  const duplicate: CanvasCell = structuredClone({ ...source, id: newId, frame, z: getNextZ(state.cells) });
  return withHistory(state, { ...state, cells: [...state.cells, duplicate], selectedIds: [newId] });
}

function restoreHistory(state: CanvasState, direction: "undo" | "redo"): CanvasState {
  const current = snapshotCanvas(state.cells, state.selectedIds);
  const result = direction === "undo" ? undoCanvasHistory(state.history, current) : redoCanvasHistory(state.history, current);
  if (!result.snapshot) return state;
  return { ...state, cells: result.snapshot.cells, selectedIds: result.snapshot.selectedIds, history: result.history };
}

function withHistory(previous: CanvasState, next: CanvasState): CanvasState {
  return { ...next, history: pushCanvasHistory(previous.history, snapshotCanvas(previous.cells, previous.selectedIds)) };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}
