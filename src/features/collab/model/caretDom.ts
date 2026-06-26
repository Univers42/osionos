/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caretDom.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * DOM geometry for rendering a REMOTE caret/selection (AOC §3). Resolves a
 * transport-level `{blockId, offset}` to viewport rects by walking the block's
 * contenteditable text nodes — the inverse of how the local caret is read. This
 * never mutates the editor; it only measures. Blocks tag their node with
 * `data-block-id` (entities/block), so a remote caret on a block not on this
 * page resolves to null and simply isn't drawn (natural cross-page scoping, §8).
 */

import type { CaretState, SelectionRange } from './realtimeTransport.port';

/** Viewport rect of a control a remote member is interacting with (AOC §4), or
 *  null. Controls opt in with `data-collab-control="<id>"`; native `id` is a
 *  fallback. Resolves to null off-page, so the pulse is naturally page-scoped. */
export function controlRectFor(elementId: string): DOMRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLElement>(`[data-collab-control="${CSS.escape(elementId)}"]`)
    ?? document.getElementById(elementId);
  return el ? el.getBoundingClientRect() : null;
}

/** The editable element of a block, or null if the block isn't on this page. */
export function resolveBlockEditable(blockId: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const block = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
  if (!block) return null;
  return block.querySelector<HTMLElement>('[contenteditable]')
    ?? block.querySelector<HTMLElement>('textarea, input')
    ?? block;
}

/** Map a character offset within an editable to a concrete DOM point. */
function pointAtOffset(editable: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const len = node.data.length;
    if (offset <= acc + len) return { node, offset: Math.max(0, offset - acc) };
    acc += len;
    last = node;
  }
  return last ? { node: last, offset: last.data.length } : { node: editable, offset: 0 };
}

/** Collapsed-caret viewport rect for a remote `{blockId, offset}`, or null. */
export function caretRectAt(caret: CaretState): { left: number; top: number; height: number } | null {
  const editable = resolveBlockEditable(caret.blockId);
  if (!editable || typeof document === 'undefined') return null;
  const point = pointAtOffset(editable, caret.offset);
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  if (rect && (rect.height > 0 || rect.width > 0)) return { left: rect.left, top: rect.top, height: rect.height || 18 };
  const fallback = editable.getBoundingClientRect();
  return { left: fallback.left, top: fallback.top, height: 18 };
}

/** Highlight rects (viewport coords) for a remote selection range, or []. */
export function selectionRectsFor(selection: SelectionRange): DOMRect[] {
  const anchorEl = resolveBlockEditable(selection.anchor.blockId);
  const focusEl = resolveBlockEditable(selection.focus.blockId);
  if (!anchorEl || !focusEl || typeof document === 'undefined') return [];
  const a = pointAtOffset(anchorEl, selection.anchor.offset);
  const f = pointAtOffset(focusEl, selection.focus.offset);
  const range = document.createRange();
  try {
    range.setStart(a.node, a.offset);
    range.setEnd(f.node, f.offset);
    if (range.collapsed) { range.setStart(f.node, f.offset); range.setEnd(a.node, a.offset); }
  } catch {
    return [];
  }
  return Array.from(range.getClientRects());
}
