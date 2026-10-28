import { useCallback } from "react";

import { createWhiteboardBlock, findBlockInTree, type Block } from "@/entities/block";
import type { SlashMenuState } from "@/features/block-editor/model/playgroundBlockEditor.helpers";
import { normalizeBoardTitle } from "@/features/whiteboard/model/boardRefs";
import { requestNewBoard } from "@/features/whiteboard/model/pendingBoards";
import { isWhiteboardReady } from "@/features/whiteboard/model/whiteboardAvailability";

import { stripSlashQuery } from "./useSlashSelect";

interface UseSlashWhiteboardSelectOptions {
  pageId: string;
  slashMenu: SlashMenuState | null;
  setSlashMenu: (menu: SlashMenuState | null) => void;
  updateBlock: (pageId: string, blockId: string, updates: Partial<Block>) => void;
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
}

/** `/whiteboard <name>`: drop an inline whiteboard block whose frame opens hydrawn's `/new`
 *  page, which creates an empty board titled `<name>` and reports its slug back to the block.
 *  The block exists immediately, so the page never waits on the network.
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
      const block = createWhiteboardBlock({ title });
      insertBlock(pageId, blockId, block);
      requestNewBoard(block.id);
    },
    [pageId, slashMenu, setSlashMenu, updateBlock, insertBlock],
  );
}
