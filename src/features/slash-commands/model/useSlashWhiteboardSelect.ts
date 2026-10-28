import { useCallback } from "react";

import { createWhiteboardBlock, findBlockInTree, type Block } from "@/entities/block";
import type { SlashMenuState } from "@/features/block-editor/model/playgroundBlockEditor.helpers";
import { mintBoardSlug, normalizeBoardTitle } from "@/features/whiteboard/model/boardRefs";
import { isWhiteboardReady } from "@/features/whiteboard/model/whiteboardAvailability";

import { stripSlashQuery } from "./useSlashSelect";

interface UseSlashWhiteboardSelectOptions {
  pageId: string;
  slashMenu: SlashMenuState | null;
  setSlashMenu: (menu: SlashMenuState | null) => void;
  updateBlock: (pageId: string, blockId: string, updates: Partial<Block>) => void;
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
}

/** `/whiteboard <name>`: drop an inline whiteboard block holding a freshly minted board slug,
 *  so its frame opens an empty canvas at once; hydrawn creates the board titled `<name>` on
 *  the first save. Nothing waits on the network.
 *  The availability gate is re-checked here, at dispatch, because the menu list is only a view:
 *  a stale menu or a keypress on a row filtered out a moment ago must not create a board. */
export function useSlashWhiteboardSelect({ pageId, slashMenu, setSlashMenu, updateBlock, insertBlock }: UseSlashWhiteboardSelectOptions) {
  return useCallback(
    (argument: string, content: Block[]) => {
      if (!slashMenu) return;
      if (!isWhiteboardReady()) return;
      const { blockId } = slashMenu;
      setSlashMenu(null);

      const source = findBlockInTree(content, blockId);
      if (source) updateBlock(pageId, blockId, { content: stripSlashQuery(source.content ?? "", slashMenu.anchor), placeholderText: undefined });

      const title = normalizeBoardTitle(argument);
      insertBlock(pageId, blockId, createWhiteboardBlock({ title, boardSlug: mintBoardSlug() }));
    },
    [pageId, slashMenu, setSlashMenu, updateBlock, insertBlock],
  );
}
