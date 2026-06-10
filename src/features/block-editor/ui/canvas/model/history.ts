/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   history.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { CanvasCell, CanvasHistorySnapshot, CanvasHistoryState } from "./types";

export function createCanvasHistory(limit = 80): CanvasHistoryState {
  return { past: [], future: [], limit };
}

export function snapshotCanvas(cells: CanvasCell[], selectedIds: string[]): CanvasHistorySnapshot {
  // Shallow copies, sharing `blocks` (and other nested values) by reference.
  // Invariant: the reducer never mutates a cell in place — it replaces cell
  // objects — and nested block content is owned by the page store, re-entering
  // only through hydrateFromBlock. Deep-cloning here (the old structuredClone)
  // made every committed gesture O(total nested blocks).
  return { cells: cells.map((cell) => ({ ...cell })), selectedIds: [...selectedIds] };
}

export function pushCanvasHistory(history: CanvasHistoryState, snapshot: CanvasHistorySnapshot): CanvasHistoryState {
  return {
    past: [...history.past, snapshot].slice(-history.limit),
    future: [],
    limit: history.limit,
  };
}

export function undoCanvasHistory(history: CanvasHistoryState, current: CanvasHistorySnapshot): { history: CanvasHistoryState; snapshot: CanvasHistorySnapshot | null } {
  const snapshot = history.past.at(-1) ?? null;
  if (!snapshot) return { history, snapshot: null };
  return {
    history: { past: history.past.slice(0, -1), future: [current, ...history.future], limit: history.limit },
    snapshot,
  };
}

export function redoCanvasHistory(history: CanvasHistoryState, current: CanvasHistorySnapshot): { history: CanvasHistoryState; snapshot: CanvasHistorySnapshot | null } {
  const snapshot = history.future[0] ?? null;
  if (!snapshot) return { history, snapshot: null };
  return {
    history: { past: [...history.past, current].slice(-history.limit), future: history.future.slice(1), limit: history.limit },
    snapshot,
  };
}
