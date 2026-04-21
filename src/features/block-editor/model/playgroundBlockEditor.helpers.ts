/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   playgroundBlockEditor.helpers.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/21 10:26:39 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import type { Block } from '@/entities/block';
import { continuesSameType } from '@/entities/block';

export interface SlashMenuState {
  blockId: string;
  position: { x: number; y: number };
  filter: string;
}

export interface PageSelectorMenuState {
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

export function handleArrowUp(
  blockId: string,
  content: Block[],
  focusBlock: (id: string, end?: boolean) => void,
): boolean {
  const sel = globalThis.getSelection();
  if (!sel?.rangeCount) {
    // No selection (divider, non-text blocks) — jump directly
    const prevId = getAdjacentRenderedBlockId(blockId, 'prev');
    if (prevId) { focusBlock(prevId, true); return true; }
    return false;
  }

  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;

  // Check if cursor is at the very start of the editable content.
  const blockEl = document.querySelector(`[data-block-id="${blockId}"] [contenteditable]`);
  if (blockEl) {
    const testRange = document.createRange();
    testRange.setStart(blockEl, 0);
    testRange.setEnd(range.startContainer, range.startOffset);
    if (testRange.toString().length > 0) return false;
  }

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
  blockId: string,
  content: Block[],
  el: HTMLElement,
  focusBlock: (id: string, end?: boolean) => void,
): boolean {
  const sel = globalThis.getSelection();
  const blockEl = document.querySelector(`[data-block-id="${blockId}"] [contenteditable]`);

  if (!sel?.rangeCount) {
    console.log("  → no range, jumping directly");
    const nextId = getAdjacentRenderedBlockId(blockId, 'next');
    if (nextId) { focusBlock(nextId); return true; }
    return false;
  }

  const range = sel.getRangeAt(0);
  if (!range.collapsed) {
    console.log("  → range not collapsed, skipping");
    return false;
  }

  if (blockEl) {
    const testRange = document.createRange();
    testRange.setStart(range.endContainer, range.endOffset);
    testRange.setEnd(blockEl, blockEl.childNodes.length);
    const remainingText = testRange.toString();
    console.log("  → remaining text after cursor:", JSON.stringify(remainingText), "length:", remainingText.length);
    if (remainingText.length > 0) return false;
  } else {
    console.log("  → no contenteditable found, jumping directly");
  }

  const nextRenderedBlockId = getAdjacentRenderedBlockId(blockId, 'next');
  console.log("  → jumping to:", nextRenderedBlockId);
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
  e: React.KeyboardEvent,
  blockId: string,
  blockType: Block['type'],
  slashMenu: SlashMenuState | null,
  pageId: string,
  insertBlock: (pid: string, bid: string, b: Block) => void,
  focusBlock: (id: string, end?: boolean) => void,
): void {
  if (e.defaultPrevented) return;
  e.preventDefault();
  const nextType = continuesSameType(blockType) ? blockType : 'paragraph';
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
