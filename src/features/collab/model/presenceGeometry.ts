/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   presenceGeometry.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure rules for the collaborator-presence overlay: where a remote caret sits
 * relative to the visible editor, when its name flag collapses, which blocks get
 * a gutter bar, and when follow mode must scroll. No DOM and no React, so every
 * per-frame decision runs under node:test; the DOM half (presenceDom.ts) only
 * measures and hands plain numbers in.
 *
 * Caveat: block order is the depth-first order of the page tree, which is the
 * reading order for lists and toggles but not for column layouts (a column
 * list's children are visited column by column, so a block in the second column
 * can rank before one below it in the first). Only a caret whose block is NOT
 * rendered is placed by this order; a rendered block is placed by its rect.
 */

import type { Block } from '@/entities/block/model/types';
import type { RemoteCursor } from './remoteCursors';

/** A vertical extent in viewport pixels (a DOMRect satisfies it). */
export interface Span { top: number; bottom: number }

export type Band = 'above' | 'visible' | 'below';

/** How long a caret keeps its name flag after the last move. */
export const CARET_IDLE_MS = 2500;
/** Height of the name flag (text-3xs, leading-4) and its gap to the caret. */
export const FLAG_HEIGHT = 16;
export const FLAG_GAP = 2;
/** Share of the viewport, top and bottom, a followed caret may rest in. */
export const FOLLOW_BAND = 0.2;

/** Where `rect` sits against the visible `viewport`. Touching the edge counts
 *  as outside, so a caret hidden by the edge never reads as visible. */
export function classifyRect(rect: Span, viewport: Span): Band {
  if (rect.bottom <= viewport.top) return 'above';
  if (rect.top >= viewport.bottom) return 'below';
  return 'visible';
}

/** The boxes that overlap the visible `viewport`: a selection can span far more
 *  lines than fit on screen, and only those lines are worth a DOM node. */
export function visibleBoxes<T extends { top: number; height: number }>(boxes: readonly T[], viewport: Span): T[] {
  return boxes.filter((box) => classifyRect({ top: box.top, bottom: box.top + box.height }, viewport) === 'visible');
}

/** The name flag sits above the caret; it flips below when it would be clipped
 *  by the top of the viewport. */
export function flagPlacement(
  caretRect: { top: number },
  viewportTop: number,
  flagHeight = FLAG_HEIGHT,
): 'above' | 'below' {
  return caretRect.top - flagHeight - FLAG_GAP >= viewportTop ? 'above' : 'below';
}

/** True once a caret has rested for `idleMs`; the flag then shrinks to a dot. */
export function isCaretIdle(lastMoveAt: number, now: number, idleMs = CARET_IDLE_MS): boolean {
  return now - lastMoveAt >= idleMs;
}

/** Ms until the first still-expanded caret goes idle, or null when none will. */
export function nextIdleDelay(movedAts: Iterable<number>, now: number, idleMs = CARET_IDLE_MS): number | null {
  let soonest: number | null = null;
  for (const movedAt of movedAts) {
    const left = movedAt + idleMs - now;
    if (left > 0 && (soonest === null || left < soonest)) soonest = left;
  }
  return soonest;
}

/** Signed distance from the viewport centre to the rect centre; positive means
 *  the rect lies below it, so the scroller must move down by that much. */
export function centerDelta(rect: Span, viewport: Span): number {
  return (rect.top + rect.bottom) / 2 - (viewport.top + viewport.bottom) / 2;
}

/**
 * Pixels the scroller must move so a followed caret is back in view, or null
 * while it rests inside the inner band (the middle 1 - 2*band of the viewport).
 * Outside the band the answer is the distance to the viewport centre, so the
 * caller can ease toward it; a caret that is too tall for the band simply
 * settles at the centre (delta under 1px is null).
 */
export function followScrollDelta(rect: Span, viewport: Span, band = FOLLOW_BAND): number | null {
  const height = viewport.bottom - viewport.top;
  const margin = Math.min(Math.max(band, 0), 0.49) * height;
  if (rect.top >= viewport.top + margin && rect.bottom <= viewport.bottom - margin) return null;
  const delta = centerDelta(rect, viewport);
  return Math.abs(delta) < 1 ? null : delta;
}

/** The page's block ids in depth-first order, with an id -> position index. */
export interface BlockOrder {
  ids: readonly string[];
  index: ReadonlyMap<string, number>;
}

export function blockOrderOf(blocks: readonly Block[] | undefined): BlockOrder {
  const ids: string[] = [];
  const walk = (list: readonly Block[]): void => {
    for (const block of list) {
      ids.push(block.id);
      if (block.children?.length) walk(block.children);
    }
  };
  if (blocks) walk(blocks);
  return { ids, index: new Map(ids.map((id, at) => [id, at])) };
}

type Located = Pick<RemoteCursor, 'actor' | 'caret' | 'selection'>;

/** Every block a cursor touches: its caret block, or the whole range of a
 *  selection when the page order says what lies between anchor and focus. */
function blocksTouched(cursor: Located, order?: BlockOrder): string[] {
  const { selection, caret } = cursor;
  if (!selection) return caret ? [caret.blockId] : [];
  const a = selection.anchor.blockId;
  const f = selection.focus.blockId;
  const from = order?.index.get(a);
  const to = order?.index.get(f);
  if (order && from !== undefined && to !== undefined) {
    return order.ids.slice(Math.min(from, to), Math.max(from, to) + 1);
  }
  return a === f ? [a] : [a, f];
}

/** blockId -> the actors with a caret or selection in it, sorted by actor so
 *  the chips do not reshuffle as carets move. */
export function groupByBlock(cursors: Iterable<Located>, order?: BlockOrder): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const cursor of cursors) {
    for (const blockId of blocksTouched(cursor, order)) {
      const actors = out.get(blockId);
      if (!actors) out.set(blockId, [cursor.actor]);
      else if (!actors.includes(cursor.actor)) actors.push(cursor.actor);
    }
  }
  for (const actors of out.values()) actors.sort();
  return out;
}

/** Which side of the rendered blocks `blockId` falls on, for a block that is not
 *  in the DOM (virtualized away). Null when the page does not know the block,
 *  nothing is rendered, or it lies inside the rendered window (collapsed). */
export function bandByOrder(
  blockId: string,
  order: BlockOrder,
  renderedIds: Iterable<string>,
): 'above' | 'below' | null {
  const at = order.index.get(blockId);
  if (at === undefined) return null;
  let first = Infinity;
  let last = -Infinity;
  for (const id of renderedIds) {
    const position = order.index.get(id);
    if (position === undefined) continue;
    if (position < first) first = position;
    if (position > last) last = position;
  }
  if (first === Infinity) return null;
  if (at < first) return 'above';
  if (at > last) return 'below';
  return null;
}

/** The first `max` items and how many were left out (chips and edge pills). */
export function limitWithOverflow<T>(items: readonly T[], max = 3): { shown: T[]; overflow: number } {
  return { shown: items.slice(0, max), overflow: Math.max(0, items.length - max) };
}
