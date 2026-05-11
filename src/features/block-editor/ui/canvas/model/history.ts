import type { CanvasCell, CanvasHistorySnapshot, CanvasHistoryState } from "./types";

export function createCanvasHistory(limit = 80): CanvasHistoryState {
  return { past: [], future: [], limit };
}

export function snapshotCanvas(cells: CanvasCell[], selectedIds: string[]): CanvasHistorySnapshot {
  return { cells: structuredClone(cells), selectedIds: [...selectedIds] };
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
