/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSlashSelect.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:14 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/22 11:30:02 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback } from "react";

import {
  createMediaBlock,
  type Block,
  type BlockType,
  type MediaBlockType,
  findBlockInTree,
} from "@/entities/block";
import type { SlashMenuState } from "@/features/block-editor/model/playgroundBlockEditor.helpers";
import { focusEditableBlock } from "@/features/block-editor/model/blockDomFocus";

interface UseSlashSelectOptions {
  pageId: string;
  slashMenu: SlashMenuState | null;
  setSlashMenu: (menu: SlashMenuState | null) => void;
  updateBlock: (
    pageId: string,
    blockId: string,
    updates: Partial<Block>,
  ) => void;
  changeBlockType: (
    pageId: string,
    blockId: string,
    newType: BlockType,
  ) => void;
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
  createInlineDatabase: (
    name?: string,
  ) => { databaseId: string; viewId: string } | null;
  createPageInPrivateWorkspace: () => Promise<{ id: string } | null>;
  focusBlock: (blockId: string, end?: boolean) => void;
}

function stripSlashQuery(content: string): string {
  const slashIdx = content.lastIndexOf("/");
  return slashIdx >= 0 ? content.slice(0, slashIdx) : content;
}

function appendInternalPageLink(content: string, pageId: string): string {
  const trimmed = content.replace(/\s+$/, "");
  const separator = trimmed.length > 0 ? " " : "";
  return `${trimmed}${separator}[[page:${pageId}]] `;
}

/**
 * Places the cursor at the start or end of a block's editable content.
 */
export function repositionCursor(blockId: string, _content: string) {
  focusEditableBlock(blockId, "start");
}

export function useSlashSelect({
  pageId,
  slashMenu,
  setSlashMenu,
  updateBlock,
  changeBlockType,
  insertBlock,
  createInlineDatabase,
  createPageInPrivateWorkspace,
  focusBlock,
}: UseSlashSelectOptions) {
  const applyBlockSelection = useCallback(
    (
      selectedType: BlockType,
      content: Block[],
      options?: {
        calloutIcon?: string;
        placeholderText?: string;
      },
    ) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;

      setSlashMenu(null);

      const block = findBlockInTree(content, blockId);
      const cleanContent = stripSlashQuery(block?.content ?? "");
      if (block) {
        updateBlock(pageId, blockId, {
          content: cleanContent,
          placeholderText: options?.placeholderText,
        });
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
        updateBlock(pageId, blockId, { color: options?.calloutIcon || "💡" });
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

  const handleSlashBlockSelect = useCallback(
    (selectedType: BlockType, content: Block[], calloutIcon?: string) => {
      applyBlockSelection(selectedType, content, { calloutIcon });
    },
    [applyBlockSelection],
  );

  const handleSlashTurnIntoSelect = useCallback(
    (
      selectedType: BlockType,
      content: Block[],
      options?: {
        calloutIcon?: string;
        placeholderText?: string;
      },
    ) => {
      applyBlockSelection(selectedType, content, options);
    },
    [applyBlockSelection],
  );

  const handleSlashMediaSelect = useCallback(
    (mediaType: MediaBlockType, asset: string, content: Block[]) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;

      setSlashMenu(null);

      const block = findBlockInTree(content, blockId);
      const cleanContent = stripSlashQuery(block?.content ?? "");

      if (block) {
        updateBlock(pageId, blockId, {
          content: cleanContent,
          placeholderText: undefined,
        });
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
        placeholderText: undefined,
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

  const handleSlashCreatePageSelect = useCallback(
    async (content: Block[]) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;

      setSlashMenu(null);

      const block = findBlockInTree(content, blockId);
      if (!block) return;

      const cleanContent = stripSlashQuery(block.content ?? "");
      const createdPage = await createPageInPrivateWorkspace();
      const nextContent = createdPage
        ? appendInternalPageLink(cleanContent, createdPage.id)
        : cleanContent;

      updateBlock(pageId, blockId, {
        content: nextContent,
        placeholderText: undefined,
      });
      repositionCursor(blockId, nextContent);
    },
    [
      slashMenu,
      setSlashMenu,
      createPageInPrivateWorkspace,
      updateBlock,
      pageId,
    ],
  );

  return {
    handleSlashBlockSelect,
    handleSlashTurnIntoSelect,
    handleSlashMediaSelect,
    handleSlashCreatePageSelect,
  };
}
