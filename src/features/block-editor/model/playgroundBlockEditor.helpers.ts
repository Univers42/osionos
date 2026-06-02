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

function caretRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0];
  const rect = range.getBoundingClientRect();
  return rect.width || rect.height || rect.top ? rect : null;
}

function edgeRect(blockEl: Element, atStart: boolean): DOMRect | null {
  const probe = document.createRange();
  if (atStart) {
    probe.setStart(blockEl, 0);
    probe.collapse(true);
  } else {
    probe.selectNodeContents(blockEl);
    probe.collapse(false);
  }
  const rect = probe.getBoundingClientRect();
  return rect.width || rect.height || rect.top ? rect : null;
}

// Whether the collapsed caret sits on the first / last *visual* line of the
// block (so single-line blocks always qualify and Arrow moves to the adjacent
// block in one press instead of stepping start<->end first).
function caretOnEdgeLine(blockEl: Element, range: Range, edge: "first" | "last"): boolean {
  const caret = caretRect(range);
  const reference = edgeRect(blockEl, edge === "first");
  if (!caret || !reference) return true;
  const lineHeight = caret.height || Number.parseFloat(getComputedStyle(blockEl).lineHeight) || 20;
  return edge === "first"
    ? caret.top <= reference.top + lineHeight * 0.5
    : caret.bottom >= reference.bottom - lineHeight * 0.5;
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

  // Leave the block when the caret is on its first visual line (single-line
  // blocks always qualify, so navigation is one press per block).
  const blockEl = document.querySelector(`[data-block-id="${blockId}"] [contenteditable]`);
  if (blockEl && !caretOnEdgeLine(blockEl, range, "first")) return false;

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
    const nextId = getAdjacentRenderedBlockId(blockId, 'next');
    if (nextId) { focusBlock(nextId); return true; }
    return false;
  }

  const range = sel.getRangeAt(0);
  if (!range.collapsed) {
    return false;
  }

  if (blockEl && !caretOnEdgeLine(blockEl, range, "last")) return false;

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
