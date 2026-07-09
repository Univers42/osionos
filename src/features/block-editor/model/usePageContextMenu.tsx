import { useCallback, useMemo, useState } from "react";

import { useBlockSelection } from "./blockSelectionStore";
import { useEditorCommandBus } from "./editorCommandBus";
import { buildSelectionMenuSections } from "./pageContextMenuSections";
import type { BlockContextMenuSection, BlockContextMenuState } from "./blockContextMenu.helpers";

/** Accepts both React and native mouse events (background right-clicks use native). */
interface PointerLike {
  preventDefault: () => void;
  clientX: number;
  clientY: number;
}

export interface PageContextMenuApi {
  menu: BlockContextMenuState | null;
  sections: BlockContextMenuSection[];
  open: (event: PointerLike) => void;
  close: () => void;
}

/**
 * The selection/background right-click menu, rendered through the existing
 * BlockContextMenu (a synthetic anchor supplies the position; the renderer ignores
 * blockId). Acts on the ACTIVE editor + the current selection.
 */
export function usePageContextMenu(sourceKey: string): PageContextMenuApi {
  const [menu, setMenu] = useState<BlockContextMenuState | null>(null);
  const selectedIds = useBlockSelection((state) => state.selectedIdsFor(sourceKey));

  const close = useCallback(() => setMenu(null), []);
  const open = useCallback((event: PointerLike) => {
    event.preventDefault();
    setMenu({ blockId: "", x: event.clientX, y: event.clientY });
  }, []);

  const sections = useMemo<BlockContextMenuSection[]>(() => {
    if (!menu) return [];
    const handle = useEditorCommandBus.getState().active;
    return handle ? buildSelectionMenuSections(handle, selectedIds, close) : [];
  }, [menu, selectedIds, close]);

  return { menu, sections, open, close };
}
