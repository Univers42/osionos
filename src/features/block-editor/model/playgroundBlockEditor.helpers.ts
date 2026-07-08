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
import type { CaretPlacement } from './blockDomFocus';
import { paneRootOf } from './blockDomFocus';
import { caretRect, caretOnEdgeLine } from './caretGeometry';

// Re-exported so consumers keep importing caret geometry from this module.
export { caretRect };

/** `true` = caret at end, `false`/omitted = start, or an explicit edge/goal-X placement. */
export type FocusBlockFn = (id: string, placement?: boolean | CaretPlacement) => void;

// Goal column (viewport X) carried across consecutive vertical arrow presses so
// line-to-line navigation keeps the caret in the same column across block
// boundaries. Reset by any non-vertical key (handleArrowNavigation) and by a
// pointer press — after either, the next vertical move recaptures the column.
let goalCaretX: number | null = null;

export function clearVerticalGoalX(): void {
  goalCaretX = null;
}

// ponytail: one editor-global pointer listener resets the goal column on click;
// simpler than threading a reset through every mouse handler. No-op under SSR/tests.
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', clearVerticalGoalX, { capture: true, passive: true });
}

// The column to aim for when crossing into an adjacent block: the sticky goal if
// one is set, else the live caret column (captured now and remembered).
function resolveGoalX(range: Range): number | null {
  if (goalCaretX != null) return goalCaretX;
  const rect = caretRect(range);
  if (!rect) return null;
  goalCaretX = rect.left;
  return goalCaretX;
}

/**
 * Caret anchor for popovers, in VIEWPORT coordinates (the popovers portal to
 * <body>, so they position against the viewport): `x` = caret/line-start left,
 * `y` = caret bottom (below-anchor), `top` = caret top (above-anchor for the flip).
 */
export interface SlashMenuState {
  blockId: string;
  position: { x: number; y: number; top: number };
  filter: string;
}

export interface PageSelectorMenuState {
  blockId: string;
  position: { x: number; y: number; top: number };
  filter: string;
}

export interface EmojiMenuState {
  blockId: string;
  position: { x: number; y: number; top: number };
  filter: string;
}

export interface ColorMenuState {
  blockId: string;
  position: { x: number; y: number; top: number };
}

/**
 * A `:` shortcut opens the emoji picker only once at least one name char follows
 * the colon (a bare `:` does nothing). The colon must start the line or sit after
 * whitespace / `(` so URLs (`http://`) and times (`10:30`) never trigger it. The
 * captured group is the search filter.
 */
export const EMOJI_TRIGGER_RE = /(?:^|[\s(]):([a-z0-9_+-]+)$/i;

function getRenderedBlocks(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'));
}

// `root` scopes the block list to the caret's own pane so a duplicate block id in
// another mounted pane (split view / background tab) is never picked as adjacent.
export function getAdjacentRenderedBlockId(
  blockId: string,
  direction: 'prev' | 'next',
  root: ParentNode = document,
): string | null {
  const orderedBlocks = getRenderedBlocks(root);
  const idx = orderedBlocks.findIndex((el) => el.dataset.blockId === blockId);
  if (idx < 0) return null;

  const offset = direction === 'prev' ? -1 : 1;
  return orderedBlocks[idx + offset]?.dataset.blockId ?? null;
}

// Best-effort editable element under the live caret. Only a FALLBACK for popover
// anchoring when the caller has no blockId — anchoring popovers to a known
// [data-block-id] is preferred (a stale/foreign selection drifts the anchor).
export function resolveEditableFromSelection(): HTMLElement | null {
  const sel = globalThis.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.getRangeAt(0).startContainer;
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return (
    el?.closest<HTMLElement>('[contenteditable="true"]') ??
    el?.closest<HTMLElement>("[data-block-id]") ??
    null
  );
}

export function handleArrowUp(
  blockId: string,
  content: Block[],
  focusBlock: FocusBlockFn,
): boolean {
  const sel = globalThis.getSelection();
  if (!sel?.rangeCount) {
    // No selection (divider, non-text blocks) — jump directly
    const prevId = getAdjacentRenderedBlockId(blockId, 'prev', paneRootOf(document.activeElement));
    if (prevId) { focusBlock(prevId, true); return true; }
    return false;
  }

  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;

  // Scope every block lookup to the pane that owns the caret so a duplicate block
  // id in another mounted pane (split view / background tab) can't capture it.
  const root = paneRootOf(range.startContainer);

  // Capture the goal column NOW (before native may re-clamp it on a short last
  // line), so the column is preserved even across a multi-line in-block move.
  const goalX = resolveGoalX(range);

  // Leave the block when the caret is on its first visual line (single-line
  // blocks always qualify, so navigation is one press per block).
  const blockEl = root.querySelector(`[data-block-id="${blockId}"] [contenteditable]`);
  if (blockEl && !caretOnEdgeLine(blockEl, range, "first")) return false;

  // Enter the previous block on its LAST line at the carried goal column.
  const placement: CaretPlacement = goalX != null ? { edge: "last", x: goalX } : "end";

  const prevRenderedBlockId = getAdjacentRenderedBlockId(blockId, 'prev', root);
  if (prevRenderedBlockId) {
    focusBlock(prevRenderedBlockId, placement);
    return true;
  }

  const fallbackIdx = content.findIndex(b => b.id === blockId);
  if (fallbackIdx > 0) {
    focusBlock(content[fallbackIdx - 1].id, placement);
    return true;
  }

  return false;
}

export function handleArrowDown(
  blockId: string,
  content: Block[],
  el: HTMLElement,
  focusBlock: FocusBlockFn,
): boolean {
  const sel = globalThis.getSelection();

  if (!sel?.rangeCount) {
    const nextId = getAdjacentRenderedBlockId(blockId, 'next', paneRootOf(document.activeElement));
    if (nextId) { focusBlock(nextId); return true; }
    return false;
  }

  const range = sel.getRangeAt(0);
  if (!range.collapsed) {
    return false;
  }

  // Scope every block lookup to the pane that owns the caret so a duplicate block
  // id in another mounted pane (split view / background tab) can't capture it.
  const root = paneRootOf(range.startContainer);
  const blockEl = root.querySelector(`[data-block-id="${blockId}"] [contenteditable]`);

  // Capture the goal column NOW (before native may re-clamp it on a short last
  // line), so the column is preserved even across a multi-line in-block move.
  const goalX = resolveGoalX(range);

  if (blockEl && !caretOnEdgeLine(blockEl, range, "last")) return false;

  // Enter the next block on its FIRST line at the carried goal column.
  const placement: CaretPlacement = goalX != null ? { edge: "first", x: goalX } : "start";

  const nextRenderedBlockId = getAdjacentRenderedBlockId(blockId, 'next', root);
  if (nextRenderedBlockId) {
    focusBlock(nextRenderedBlockId, placement);
    return true;
  }

  const fallbackIdx = content.findIndex(b => b.id === blockId);
  if (fallbackIdx >= 0 && fallbackIdx < content.length - 1) {
    focusBlock(content[fallbackIdx + 1].id, placement);
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
