import { create } from "zustand";

/**
 * The single source of truth for "which blocks are selected" in the linear
 * editor — promoted out of BlockEditorSurface local state so the right-click
 * menu and the keyboard-automation dispatcher can read the same selection.
 *
 * Only ONE surface holds a selection at a time (matching today's behaviour):
 * the selection is keyed by `activeSourceKey`, and `selectedIdsFor` returns an
 * empty (stable) array for any other surface, so background panes never see a
 * stale selection.
 */

const EMPTY: readonly string[] = Object.freeze([]);

export interface BlockSelectionState {
  activeSourceKey: string | null;
  pageId: string | null;
  ids: string[];
  /** Replace the active selection (marquee commit / drag-handle click). */
  select: (sourceKey: string, pageId: string, ids: string[]) => void;
  /** Add/remove a single id from the active surface's selection. */
  toggleSelect: (sourceKey: string, pageId: string, id: string) => void;
  /** Drop the whole selection (focus into text, Escape, after delete). */
  clearSelection: () => void;
  /** The selected ids for a surface, or a stable empty array if it isn't active. */
  selectedIdsFor: (sourceKey: string) => readonly string[];
}

export const useBlockSelection = create<BlockSelectionState>((set, get) => ({
  activeSourceKey: null,
  pageId: null,
  ids: [],
  select: (sourceKey, pageId, ids) =>
    set((state) => {
      // Same membership → no state change: the marquee calls this per frame,
      // and an unguarded set re-rendered every block row on every mousemove.
      if (
        state.activeSourceKey === sourceKey &&
        state.pageId === pageId &&
        state.ids.length === ids.length &&
        ids.every((id, index) => state.ids[index] === id)
      ) {
        return state;
      }
      return { activeSourceKey: sourceKey, pageId, ids };
    }),
  toggleSelect: (sourceKey, pageId, id) =>
    set((state) => {
      const owned = state.activeSourceKey === sourceKey ? state.ids : [];
      const next = owned.includes(id) ? owned.filter((existing) => existing !== id) : [...owned, id];
      return { activeSourceKey: sourceKey, pageId, ids: next };
    }),
  clearSelection: () => set({ activeSourceKey: null, pageId: null, ids: [] }),
  selectedIdsFor: (sourceKey) => (get().activeSourceKey === sourceKey ? get().ids : EMPTY),
}));

/** Selector for components — stable empty array unless this surface is active. */
export function selectIdsForSurface(sourceKey: string) {
  return (state: BlockSelectionState): readonly string[] =>
    state.activeSourceKey === sourceKey ? state.ids : EMPTY;
}
