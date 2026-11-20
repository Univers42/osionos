import { create } from "zustand";
import type { Block } from "@/entities/block/model/types";

/**
 * The "active editor" command bus — generalises the surfaceRegistry so an
 * imperative caller (the keyboard-automation dispatcher, the context menu)
 * can run a command against whichever editor currently has focus, without
 * threading callbacks through React. The focused surface registers its handle
 * on focus-in and clears it on unmount.
 */

export type InlineFormatCommand = "bold" | "italic" | "underline" | "strikethrough" | "code" | "link";

export interface EditorHandle {
  sourceKey: string;
  pageId: string;
  kind: "linear" | "canvas";
  /** The current block tree of this surface's page. */
  getContent: () => Block[];
  /** Commit a new block tree as one undo step (page surfaces pass commitContent, which snapshots first). */
  updateContent: (blocks: Block[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  focusBlock: (blockId: string, atEnd?: boolean) => void;
  /** Select all top-level blocks of the page into the block-selection store. */
  selectAll: () => void;
  /** Toggle an inline format on the current text selection (optional per surface). */
  applyInlineFormat?: (command: InlineFormatCommand) => void;
}

interface EditorCommandBusState {
  active: EditorHandle | null;
  setActive: (handle: EditorHandle) => void;
  /** Clear only if this surface still owns the active slot (avoids races). */
  clearActive: (sourceKey: string) => void;
  /** Page-body editors by pageId (TD1), mount order; apply resolves the newest, never `active`.
   *  A list because one page can be open in two panes: closing one must not orphan the other. */
  pageHandles: Record<string, EditorHandle[]>;
  registerPageHandle: (handle: EditorHandle) => void;
  unregisterPageHandle: (handle: EditorHandle) => void;
}

export const useEditorCommandBus = create<EditorCommandBusState>((set, get) => ({
  active: null,
  setActive: (handle) => set({ active: handle }),
  clearActive: (sourceKey) => {
    if (get().active?.sourceKey === sourceKey) set({ active: null });
  },
  pageHandles: {},
  registerPageHandle: (handle) => {
    if (handle.sourceKey !== `page:${handle.pageId}`) return;
    const others = (get().pageHandles[handle.pageId] ?? []).filter((h) => h !== handle);
    set((state) => ({ pageHandles: { ...state.pageHandles, [handle.pageId]: [...others, handle] } }));
  },
  unregisterPageHandle: (handle) => {
    const current = get().pageHandles[handle.pageId];
    if (!current?.includes(handle)) return;
    const rest = current.filter((h) => h !== handle);
    set((state) => {
      const pageHandles = { ...state.pageHandles };
      if (rest.length === 0) delete pageHandles[handle.pageId];
      else pageHandles[handle.pageId] = rest;
      return { pageHandles };
    });
  },
}));

export function pageHandleFor(pageId: string): EditorHandle | null {
  return useEditorCommandBus.getState().pageHandles[pageId]?.at(-1) ?? null;
}
