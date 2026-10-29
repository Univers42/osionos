/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSlashAiImageSelect.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * `/imagine <prompt>`: drop an image block, and let the engine fill it.
 *
 * The block exists immediately (the page never waits on the network); its
 * asset and its provenance are written when the service answers, if the block
 * is still there. The prompt lives in the store's memory for the retry
 * button — it is never written into the block (devil C77).
 */

import { useCallback } from "react";

import { API_BASE } from "@/shared/api/client";
import { createMediaBlock, findBlockInTree, type Block } from "@/entities/block";
import type { SlashMenuState } from "@/features/block-editor/model/playgroundBlockEditor.helpers";
import { useAiImageStore } from "@/features/ai/model/aiImageStore";
import { aiImageBlockFields } from "@/features/ai/model/imageRun";

import { stripSlashQuery } from "./useSlashSelect";

interface UseSlashAiImageSelectOptions {
  pageId: string;
  slashMenu: SlashMenuState | null;
  setSlashMenu: (menu: SlashMenuState | null) => void;
  updateBlock: (pageId: string, blockId: string, updates: Partial<Block>) => void;
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
  /** The page's CURRENT blocks, read when the image answers (not when it was asked for). */
  getBlocks: () => Block[];
}

/** `/imagine <prompt>`: an image block, then the engine's answer. */
export function useSlashAiImageSelect({
  pageId,
  slashMenu,
  setSlashMenu,
  updateBlock,
  insertBlock,
  getBlocks,
}: UseSlashAiImageSelectOptions) {
  return useCallback(
    (argument: string, content: Block[]) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;
      setSlashMenu(null);

      const source = findBlockInTree(content, blockId);
      if (source) {
        updateBlock(pageId, blockId, {
          content: stripSlashQuery(source.content ?? "", slashMenu.anchor),
          placeholderText: undefined,
        });
      }

      const block = createMediaBlock("image", "");
      insertBlock(pageId, blockId, block);

      void useAiImageStore.getState().generate(block.id, argument, (image) => {
        // The block may be gone (the user deleted it while the engine worked).
        if (!findBlockInTree(getBlocks(), block.id)) return;
        updateBlock(pageId, block.id, aiImageBlockFields(image, API_BASE ?? ""));
      });
    },
    [pageId, slashMenu, setSlashMenu, updateBlock, insertBlock, getBlocks],
  );
}
