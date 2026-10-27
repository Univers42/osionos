/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   presenceDom.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The DOM half of collaborator presence: finds the editor scroll area, measures
 * blocks, and decides where a remote caret is (on screen, above, below, or in a
 * block the virtualizer has not mounted). Every function only reads layout, and
 * the scrolling helper is the only one that writes (scroll position, never focus,
 * so a jump cannot pull the editor's caret away from the person typing).
 *
 * Caveat: the scroll area is the FIRST `.osionos-page` and a block is the FIRST
 * `[data-block-id]` with that id, so a split view showing two pages, or the same
 * page twice, measures only the first one.
 */

import { prefersReducedMotion } from '@/entities/page/ui/coverMedia';
import { usePageStore } from '@/store/usePageStore';
import { caretRectAt } from './caretDom';
import type { CaretState } from './realtimeTransport.port';
import type { RemoteCursor } from './remoteCursors';
import {
  bandByOrder, blockOrderOf, centerDelta, classifyRect,
  type Band, type BlockOrder, type Span,
} from './presenceGeometry';

export interface Box { left: number; top: number; width: number; height: number }
export type Viewport = Box & Span & { right: number };

const SCROLLER = '.osionos-page';
/** Blocks scrolled past per seek frame, halved whenever the seek overshoots. */
const SEEK_STRIDE = 2;
const MAX_SEEK_FRAMES = 12;

export function boxOf(rect: Box): Box {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function scrollerEl(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.querySelector<HTMLElement>(SCROLLER);
}

/** `clip-path` that confines an overlay to the editor, so a mark scrolled under the
 *  top bar is cut off at the bar's edge instead of painting over it. */
export function clipInset(viewport: Viewport): string {
  return `inset(${viewport.top}px ${window.innerWidth - viewport.right}px ${window.innerHeight - viewport.bottom}px ${viewport.left}px)`;
}

/** The visible editor area in viewport px, or the window while no page is mounted. */
export function viewportOf(scroller: HTMLElement | null): Viewport {
  if (scroller) return scroller.getBoundingClientRect();
  const width = window.innerWidth;
  const height = window.innerHeight;
  return { left: 0, top: 0, right: width, bottom: height, width, height };
}

/** Rect of a block, or null when it is not mounted or is laid out as nothing
 *  (a collapsed toggle's child), which would otherwise measure as (0, 0). */
export function blockRectOf(blockId: string): DOMRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
  return el && el.getClientRects().length > 0 ? el.getBoundingClientRect() : null;
}

export function renderedBlockIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'), (el) => el.dataset.blockId ?? '');
}

// Keyed on the page's content array: the store replaces it on every edit, so a
// stale order is never served, and a quiet page is walked once, not per frame.
let orderCache: { content: unknown; order: BlockOrder } | null = null;

export function activeBlockOrder(): BlockOrder {
  const state = usePageStore.getState();
  const id = state.activePage?.id;
  const content = id ? state.pageById(id)?.content : undefined;
  if (!orderCache || orderCache.content !== content) orderCache = { content, order: blockOrderOf(content) };
  return orderCache.order;
}

export type CaretPlace =
  | { rect: { left: number; top: number; height: number }; band: Band }
  | { rect: null; band: 'above' | 'below' };

/** Where a remote caret is. A mounted block is placed by its real rect; a block
 *  the virtualizer dropped is placed by page order. Null when the block is not
 *  on this page at all (natural page scoping), so nothing is drawn for it. */
export function placeCaret(
  caret: CaretState,
  viewport: Span,
  order: () => BlockOrder = activeBlockOrder,
  rendered: () => readonly string[] = renderedBlockIds,
): CaretPlace | null {
  if (blockRectOf(caret.blockId)) {
    const rect = caretRectAt(caret);
    return rect ? { rect, band: classifyRect({ top: rect.top, bottom: rect.top + rect.height }, viewport) } : null;
  }
  const band = bandByOrder(caret.blockId, order(), rendered());
  return band ? { rect: null, band } : null;
}

/**
 * Scroll the editor so the caret returned by `getCursor` sits at the centre.
 * A caret in an unmounted block is chased: each frame scrolls toward the side
 * page order puts it on until the virtualizer mounts the block and its rect can
 * centre it. Smooth unless the person asked for reduced motion.
 *
 * Caveat: bounded at 12 frames, so a page of very uneven block heights may stop
 * short and need a second activation; the caret is re-read each frame, so a
 * member who moves mid-seek is followed rather than missed.
 */
export function seekCaret(getCursor: () => RemoteCursor | undefined): void {
  const scroller = scrollerEl();
  if (!scroller) return;
  const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
  let frames = 0;
  let stride = SEEK_STRIDE;
  let lastBand: Band | null = null;

  const step = (): void => {
    const caret = getCursor()?.caret;
    if (!caret) return;
    const viewport = viewportOf(scroller);
    const place = placeCaret(caret, viewport);
    if (!place) return;
    if (place.rect) {
      const span = { top: place.rect.top, bottom: place.rect.top + place.rect.height };
      scroller.scrollBy({ top: centerDelta(span, viewport), behavior });
      return;
    }
    if (frames++ >= MAX_SEEK_FRAMES) return;
    if (lastBand && lastBand !== place.band) stride /= 2;
    lastBand = place.band;
    scroller.scrollBy({ top: (place.band === 'above' ? -stride : stride) * viewport.height, behavior: 'auto' });
    requestAnimationFrame(step);
  };
  step();
}
