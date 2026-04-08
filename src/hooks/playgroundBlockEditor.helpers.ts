/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   playgroundBlockEditor.helpers.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import type { Block } from '@src/types/database';
import { continuesWithSameTypeOnEnter } from '@src/hooks/blockTypeGuards';

export interface SlashMenuState {
  blockId: string;
  position: { x: number; y: number };
  filter: string;
}

export function handleArrowUp(blockId: string, content: Block[], focusBlock: (id: string, end?: boolean) => void): boolean {
  const sel = globalThis.getSelection();
  const range = sel?.getRangeAt(0);
  if (!range?.collapsed || range.startOffset !== 0) return false;

  const orderedBlocks = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
  const idx = orderedBlocks.findIndex((el) => el.dataset.blockId === blockId);
  if (idx > 0) {
    const prevId = orderedBlocks[idx - 1].dataset.blockId;
    if (prevId) {
      focusBlock(prevId, true);
      return true;
    }
  }

  const fallbackIdx = content.findIndex(b => b.id === blockId);
  if (fallbackIdx > 0) {
    focusBlock(content[fallbackIdx - 1].id, true);
    return true;
  }

  return false;
}

export function handleArrowDown(
  blockId: string, content: Block[], el: HTMLElement, focusBlock: (id: string, end?: boolean) => void,
): boolean {
  const sel = globalThis.getSelection();
  const range = sel?.getRangeAt(0);
  if (!range?.collapsed || range.endOffset !== (el.textContent?.length ?? 0)) return false;

  const orderedBlocks = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
  const idx = orderedBlocks.findIndex((node) => node.dataset.blockId === blockId);
  if (idx >= 0 && idx < orderedBlocks.length - 1) {
    const nextId = orderedBlocks[idx + 1].dataset.blockId;
    if (nextId) {
      focusBlock(nextId);
      return true;
    }
  }

  const fallbackIdx = content.findIndex(b => b.id === blockId);
  if (fallbackIdx >= 0 && fallbackIdx < content.length - 1) {
    focusBlock(content[fallbackIdx + 1].id);
    return true;
  }

  return false;
}

export function handleEnterKey(
  e: React.KeyboardEvent, blockId: string, blockType: Block['type'], slashMenu: SlashMenuState | null,
  pageId: string, insertBlock: (pid: string, bid: string, b: Block) => void,
  focusBlock: (id: string, end?: boolean) => void,
): void {
  if (slashMenu) return;
  e.preventDefault();
  const nextType = continuesWithSameTypeOnEnter(blockType) ? blockType : 'paragraph';
  const newBlock: Block = { id: crypto.randomUUID(), type: nextType, content: '' };
  insertBlock(pageId, blockId, newBlock);
  focusBlock(newBlock.id);
}

export function handleBackspaceKey(
  e: React.KeyboardEvent, blockId: string, content: Block[],
  pageId: string, deleteBlock: (pid: string, bid: string) => void,
  focusBlock: (id: string, end?: boolean) => void,
): void {
  e.preventDefault();
  const idx = content.findIndex(b => b.id === blockId);
  const prevBlockId = idx > 0 ? content[idx - 1].id : null;
  deleteBlock(pageId, blockId);
  if (prevBlockId) focusBlock(prevBlockId, true);
}
