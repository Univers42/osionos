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

import {
  duplicateCellHandler,
  restoreHistoryHandler,
  updateCellFramesHandler,
  updateCellHandler,
  updateLayoutConfigHandler,
} from "./canvasReducer.handlers";
import { pushCanvasHistory, snapshotCanvas } from "./history";
import { getNextZ } from "./selectors";
import type { CanvasAction, CanvasState } from "./types";

const PERSISTABLE_ACTIONS = new Set<CanvasAction["type"]>([
  "addCell", "setCells", "updateCellFrame", "updateCellFrames", "updateCell", "removeCell", "removeCells",
  "duplicateCell", "setCellZ", "setCellsZ", "setSnapToGrid", "setNoOverlap", "updateLayoutConfig",
  "undo", "redo",
]);

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "select":
      return { ...state, selectedIds: [...new Set(action.ids)] };
    case "toggleSelect":
      return {
        ...state,
        selectedIds: state.selectedIds.includes(action.id)
          ? state.selectedIds.filter((id) => id !== action.id)
          : [...state.selectedIds, action.id],
      };
    case "clearSelection":
      return state.selectedIds.length === 0 ? state : { ...state, selectedIds: [] };
    case "setTool":
      return { ...state, tool: action.tool };
    case "setViewport":
      return { ...state, viewport: { ...state.viewport, ...action.viewport } };
    case "setSnapToGrid":
      return { ...state, layoutConfig: { ...state.layoutConfig, snapToGrid: action.enabled } };
    case "setNoOverlap":
      return { ...state, layoutConfig: { ...state.layoutConfig, noOverlap: action.enabled } };
    case "updateLayoutConfig":
      return updateLayoutConfigHandler(state, action.patch, withHistory);
    case "addCell":
      return withHistory(state, { ...state, cells: [...state.cells, { ...action.cell, z: action.cell.z ?? getNextZ(state.cells) }], selectedIds: [action.cell.id] });
    case "setCells":
      return withHistory(state, { ...state, cells: action.cells, selectedIds: [] });
    case "updateCellFrame":
      return updateCellFramesHandler(state, { [action.id]: action.frame }, false, withHistory);
    case "updateCellFrames":
      return updateCellFramesHandler(state, action.frames, action.resolveCollisions ?? false, withHistory);
    case "updateCell":
      return updateCellHandler(state, action.id, (cell) => ({ ...cell, ...action.patch }), withHistory);
    case "removeCell":
      return canvasReducer(state, { type: "removeCells", ids: [action.id] });
    case "removeCells": {
      const removed = new Set(action.ids);
      if (!state.cells.some((cell) => removed.has(cell.id))) return state;
      return withHistory(state, {
        ...state,
        cells: state.cells.filter((cell) => !removed.has(cell.id)),
        selectedIds: state.selectedIds.filter((id) => !removed.has(id)),
      });
    }
    case "duplicateCell":
      return duplicateCellHandler(state, action.id, action.newId, action.frame, withHistory);
    case "setCellZ":
      return updateCellHandler(state, action.id, (cell) => ({ ...cell, z: action.z }), withHistory);
    case "setCellsZ": {
      let changed = false;
      const cells = state.cells.map((cell) => {
        const z = action.zs[cell.id];
        if (z === undefined || z === cell.z) return cell;
        changed = true;
        return { ...cell, z };
      });
      return changed ? withHistory(state, { ...state, cells }) : state;
    }
    case "undo":
      return restoreHistoryHandler(state, "undo");
    case "redo":
      return restoreHistoryHandler(state, "redo");
    default:
      return state;
  }
}

export function isPersistableCanvasAction(action: CanvasAction): boolean {
  return PERSISTABLE_ACTIONS.has(action.type);
}

function withHistory(previous: CanvasState, next: CanvasState): CanvasState {
  return { ...next, history: pushCanvasHistory(previous.history, snapshotCanvas(previous.cells, previous.selectedIds)) };
}
