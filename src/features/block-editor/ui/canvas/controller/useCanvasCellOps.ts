/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCanvasCellOps.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useMemo, type RefObject } from "react";

import { bottom, translateFrame } from "../model/geometry";
import { getNextZ } from "../model/selectors";
import { createTemplateCells, type CanvasTemplateKind } from "../model/templates";
import type { CanvasStoreApi } from "../store/canvasStore";
import type { CanvasInteractionStore } from "./interactionStore";
import { useCanvasPointer, type CanvasPointerHandlers } from "./useCanvasPointer";

export interface CanvasCellOps extends CanvasPointerHandlers {
  selectCell: (cellId: string, additive: boolean) => void;
  inspectCell: (cellId: string) => void;
  renameCell: (cellId: string, label: string) => void;
  addCell: () => void;
  duplicateCell: (cellId: string) => void;
  deleteCell: (cellId: string) => void;
  applyTemplate: (kind: CanvasTemplateKind) => void;
}

const NEW_CELL_COL_SPAN = 4;
const NEW_CELL_ROW_SPAN = 2;
const DUPLICATE_OFFSET_PX = 24;

/**
 * Stable cell-operation callbacks for the memoized cell views. Identity never
 * changes (everything reads live state through `store.getState()`), so a
 * regenerated closure can never go stale inside a memo-skipped cell — the
 * legacy comparator bug class.
 */
export function useCanvasCellOps(
  store: CanvasStoreApi,
  interaction: CanvasInteractionStore,
  scaleRef: RefObject<number>,
  stageRef: RefObject<HTMLElement | null>,
): CanvasCellOps {
  const pointer = useCanvasPointer(store, interaction, scaleRef, stageRef);

  return useMemo<CanvasCellOps>(() => ({
    ...pointer,
    selectCell: (cellId, additive) => {
      const { dispatch, selectedIds } = store.getState();
      if (additive) {
        dispatch({ type: "toggleSelect", id: cellId });
        return;
      }
      if (selectedIds.length === 1 && selectedIds[0] === cellId) return;
      dispatch({ type: "select", ids: [cellId] });
    },
    inspectCell: (cellId) => {
      store.getState().dispatch({ type: "select", ids: [cellId] });
    },
    renameCell: (cellId, label) => {
      const { cells, dispatch } = store.getState();
      const cell = cells.find((candidate) => candidate.id === cellId);
      if (!cell) return;
      dispatch({ type: "updateCell", id: cellId, patch: { visuals: { ...cell.visuals, label: label || undefined } } });
    },
    addCell: () => {
      const { cells, layoutConfig, dispatch } = store.getState();
      const y = cells.length > 0 ? Math.max(...cells.map((cell) => bottom(cell.frame))) + layoutConfig.rowGap : 0;
      dispatch({
        type: "addCell",
        cell: {
          id: crypto.randomUUID(),
          frame: {
            x: 0,
            y,
            width: NEW_CELL_COL_SPAN * layoutConfig.columnWidth + (NEW_CELL_COL_SPAN - 1) * layoutConfig.columnGap,
            height: NEW_CELL_ROW_SPAN * layoutConfig.rowHeight + (NEW_CELL_ROW_SPAN - 1) * layoutConfig.rowGap,
          },
          constraints: { horizontal: "min-max", vertical: "min" },
          sizing: { width: "fixed", height: "fixed" },
          visuals: {},
          blocks: [{ id: crypto.randomUUID(), type: "paragraph", content: "" }],
          z: getNextZ(cells),
          type: "text",
          content: "",
          wrap: true,
        },
      });
    },
    duplicateCell: (cellId) => {
      const { cells, dispatch } = store.getState();
      const cell = cells.find((candidate) => candidate.id === cellId);
      if (!cell) return;
      dispatch({
        type: "duplicateCell",
        id: cellId,
        newId: crypto.randomUUID(),
        frame: translateFrame(cell.frame, { x: DUPLICATE_OFFSET_PX, y: DUPLICATE_OFFSET_PX }),
      });
    },
    deleteCell: (cellId) => {
      store.getState().dispatch({ type: "removeCells", ids: [cellId] });
    },
    applyTemplate: (kind) => {
      const { layoutConfig, dispatch } = store.getState();
      dispatch({ type: "setCells", cells: createTemplateCells(kind, layoutConfig) });
    },
  }), [pointer, store]);
}
