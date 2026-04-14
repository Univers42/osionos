/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSlashSelect.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:14 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:04:15 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback } from "react";

import {
  createMediaBlock,
  type Block,
  type BlockType,
  type MediaBlockType,
} from "@/entities/block";
import type { SlashMenuState } from "@/features/block-editor/model/playgroundBlockEditor.helpers";

interface UseSlashSelectOptions {
  pageId: string;
  slashMenu: SlashMenuState | null;
  setSlashMenu: (menu: SlashMenuState | null) => void;
  updateBlock: (pageId: string, blockId: string, updates: Partial<Block>) => void;
  changeBlockType: (pageId: string, blockId: string, newType: BlockType) => void;
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
  createInlineDatabase: (name?: string) => { databaseId: string; viewId: string } | null;
  focusBlock: (blockId: string, end?: boolean) => void;
}

function findBlockInTree(blocks: Block[], blockId: string): Block | null {
  for (const block of blocks) {
    if (block.id === blockId) {
      return block;
    }

    if (block.children?.length) {
      const nested = findBlockInTree(block.children, blockId);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function stripSlashQuery(content: string): string {
  const slashIdx = content.lastIndexOf("/");
  return slashIdx >= 0 ? content.slice(0, slashIdx) : content;
}

/**
 * Places the cursor at the start of a block's editable content.
 */
export function repositionCursor(blockId: string, _content: string) {
  setTimeout(() => {
    const el = document.querySelector(
      `[data-block-id="${blockId}"] [contenteditable]`,
    ) as HTMLElement;
    if (!el) return;
    el.focus();
    const sel = globalThis.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, 30);
}

export function useSlashSelect({
  pageId,
  slashMenu,
  setSlashMenu,
  updateBlock,
  changeBlockType,
  insertBlock,
  createInlineDatabase,
  focusBlock,
}: UseSlashSelectOptions) {
  const handleSlashBlockSelect = useCallback(
    (selectedType: BlockType, content: Block[], calloutIcon?: string) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;

      setSlashMenu(null);

      const block = findBlockInTree(content, blockId);
      if (block) {
        updateBlock(pageId, blockId, { content: stripSlashQuery(block.content) });
      }

      if (selectedType === "database_inline") {
        const result = createInlineDatabase();
        if (result) {
          const newBlock: Block = {
            id: crypto.randomUUID(),
            type: "database_inline",
            content: "",
            databaseId: result.databaseId,
            viewId: result.viewId,
          };
          insertBlock(pageId, blockId, newBlock);
          focusBlock(newBlock.id);
        }
        return;
      }

      if (selectedType === "table_block") {
        const newBlock: Block = {
          id: crypto.randomUUID(),
          type: "table_block",
          content: "",
          tableData: [
            ["", "", ""],
            ["", "", ""],
            ["", "", ""],
          ],
        };
        insertBlock(pageId, blockId, newBlock);
        return;
      }

      changeBlockType(pageId, blockId, selectedType);

      if (selectedType === "callout") {
        updateBlock(pageId, blockId, { color: calloutIcon || "💡" });
      }

      if (selectedType === "code") {
        updateBlock(pageId, blockId, { language: "typescript" });
      }

      repositionCursor(blockId, "");
    },
    [
      pageId,
      slashMenu,
      setSlashMenu,
      updateBlock,
      changeBlockType,
      insertBlock,
      createInlineDatabase,
      focusBlock,
    ],
  );

  const handleSlashMediaSelect = useCallback(
    (mediaType: MediaBlockType, asset: string, content: Block[]) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;

      setSlashMenu(null);

      const block = findBlockInTree(content, blockId);
      const cleanContent = stripSlashQuery(block?.content ?? "");

      if (block) {
        updateBlock(pageId, blockId, { content: cleanContent });
      }

      if (!block || cleanContent.trim().length > 0) {
        const newBlock = createMediaBlock(mediaType, asset);
        insertBlock(pageId, blockId, newBlock);
        focusBlock(newBlock.id);
        return;
      }

      changeBlockType(pageId, blockId, mediaType);
      updateBlock(pageId, blockId, {
        content: "",
        asset,
      });
      focusBlock(blockId);
    },
    [
      pageId,
      slashMenu,
      setSlashMenu,
      updateBlock,
      changeBlockType,
      insertBlock,
      focusBlock,
    ],
  );

  return {
    handleSlashBlockSelect,
    handleSlashMediaSelect,
  };
}
