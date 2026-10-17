import { useCallback } from "react";

import { createWhiteboardBlock, findBlockInTree, type Block } from "@/entities/block";
import type { SlashMenuState } from "@/features/block-editor/model/playgroundBlockEditor.helpers";
import { normalizeBoardTitle } from "@/features/whiteboard/model/boardRefs";
import { startBoardCreation } from "@/features/whiteboard/model/pendingBoards";
import { isWhiteboardReady } from "@/features/whiteboard/model/whiteboardAvailability";

import { stripSlashQuery } from "./useSlashSelect";

interface UseSlashWhiteboardSelectOptions {
  pageId: string;
  slashMenu: SlashMenuState | null;
  setSlashMenu: (menu: SlashMenuState | null) => void;
  updateBlock: (pageId: string, blockId: string, updates: Partial<Block>) => void;
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
  /** The page's CURRENT blocks, read when the board answers (not when it was asked for). */
  getBlocks: () => Block[];
}

/** `/whiteboard <name>`: drop an inline whiteboard block, then create the
 *  board behind it. The block exists immediately (so the page never waits on the network);
 *  its `boardSlug` is filled in when the service answers, if the block is still there.
 *  The availability gate is re-checked here, at dispatch, because the menu list is only a view:
 *  a stale menu or a keypress on a row filtered out a moment ago must not create a board. */
export function useSlashWhiteboardSelect({ pageId, slashMenu, setSlashMenu, updateBlock, insertBlock, getBlocks }: UseSlashWhiteboardSelectOptions) {
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
      void startBoardCreation(block.id, title, (boardSlug) => updateBlock(pageId, block.id, { boardSlug }), {
        blockExists: () => findBlockInTree(getBlocks(), block.id) !== null,
      });
    },
    [pageId, slashMenu, setSlashMenu, updateBlock, insertBlock, getBlocks],
  );
}
