import { create } from "zustand";

import type { CrossTextRange } from "./crossTextOps";

/**
 * The committed cross-block text selection (drag finished, still highlighted).
 * One at a time, keyed by surface — mirrors blockSelectionStore's contract.
 * While active, the owning hook intercepts copy/cut/keydown, and the body
 * carries `data-cross-text-active` so per-block selection UI stands down.
 */
export interface CrossTextSelectionState {
  sourceKey: string | null;
  pageId: string | null;
  range: CrossTextRange | null;
  set: (sourceKey: string, pageId: string, range: CrossTextRange) => void;
  clear: () => void;
}

export const useCrossTextSelection = create<CrossTextSelectionState>((set) => ({
  sourceKey: null,
  pageId: null,
  range: null,
  set: (sourceKey, pageId, range) => set({ sourceKey, pageId, range }),
  clear: () => set({ sourceKey: null, pageId: null, range: null }),
}));
