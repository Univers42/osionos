/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   playgroundBlockEditor.helpers.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/16 11:26:53 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import type { Block } from '@/entities/block';
import { continuesWithSameTypeOnEnter } from '@/entities/block';

export interface SlashMenuState {
  blockId: string;
  position: { x: number; y: number };
  filter: string;
}

function getRenderedBlocks(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
}

export function getAdjacentRenderedBlockId(
  blockId: string,
  direction: 'prev' | 'next',
): string | null {
  const orderedBlocks = getRenderedBlocks();
  const idx = orderedBlocks.findIndex((el) => el.dataset.blockId === blockId);
  if (idx < 0) return null;

  const offset = direction === 'prev' ? -1 : 1;
  return orderedBlocks[idx + offset]?.dataset.blockId ?? null;
}

export function handleArrowUp(blockId: string, content: Block[], focusBlock: (id: string, end?: boolean) => void): boolean {
  const sel = globalThis.getSelection();
  const range = sel?.getRangeAt(0);
  if (!range?.collapsed || range.startOffset !== 0) return false;

  const prevRenderedBlockId = getAdjacentRenderedBlockId(blockId, 'prev');
  if (prevRenderedBlockId) {
    focusBlock(prevRenderedBlockId, true);
    return true;
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

  const nextRenderedBlockId = getAdjacentRenderedBlockId(blockId, 'next');
  if (nextRenderedBlockId) {
    focusBlock(nextRenderedBlockId);
    return true;
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
  const prevBlockId = getAdjacentRenderedBlockId(blockId, 'prev');
  deleteBlock(pageId, blockId);
  if (prevBlockId) focusBlock(prevBlockId, true);
}
