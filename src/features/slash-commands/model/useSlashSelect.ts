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

/**
 * useSlashSelect — handles slash command selection logic.
 * Standalone replacement for @src/hooks/useSlashSelect.
 */
import { useCallback } from 'react';
import type { Block, BlockType } from '@/entities/block';
import type { SlashMenuState } from '@/features/block-editor/model/playgroundBlockEditor.helpers';

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

/**
 * Places the cursor at the start of a block's editable content.
 */
export function repositionCursor(blockId: string, _content: string) {
  setTimeout(() => {
    const el = document.querySelector(`[data-block-id="${blockId}"] [contenteditable]`) as HTMLElement;
    if (!el) return;
    el.focus();
    const sel = globalThis.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(true); // collapse to start
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, 30);
}

/**
 * Returns a callback that handles slash-menu item selection.
 */
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
  return useCallback(
    (selectedType: BlockType, content: Block[], calloutIcon?: string) => {
      if (!slashMenu) return;
      const { blockId } = slashMenu;

      // Close slash menu
      setSlashMenu(null);

      // Remove the slash prefix from the block content
      const block = content.find((b) => b.id === blockId);
      if (block) {
        const slashIdx = block.content.lastIndexOf('/');
        const cleanContent = slashIdx >= 0 ? block.content.slice(0, slashIdx) : block.content;
        updateBlock(pageId, blockId, { content: cleanContent });
      }

      if (selectedType === 'database_inline') {
        // Create a new database block
        const result = createInlineDatabase();
        if (result) {
          const newBlock: Block = {
            id: crypto.randomUUID(),
            type: 'database_inline',
            content: '',
            databaseId: result.databaseId,
            viewId: result.viewId,
          };
          insertBlock(pageId, blockId, newBlock);
          focusBlock(newBlock.id);
        }
        return;
      }

      if (selectedType === 'table_block') {
        const newBlock: Block = {
          id: crypto.randomUUID(),
          type: 'table_block',
          content: '',
          tableData: [
            ['', '', ''],
            ['', '', ''],
            ['', '', ''],
          ],
        };
        insertBlock(pageId, blockId, newBlock);
        return;
      }

      // For most types, convert the current block
      changeBlockType(pageId, blockId, selectedType);

      if (selectedType === 'callout') {
        updateBlock(pageId, blockId, { color: calloutIcon || '💡' });
      }
      if (selectedType === 'code') {
        updateBlock(pageId, blockId, { language: 'typescript' });
      }

      repositionCursor(blockId, '');
    },
    [pageId, slashMenu, setSlashMenu, updateBlock, changeBlockType, insertBlock, createInlineDatabase, focusBlock],
  );
}
