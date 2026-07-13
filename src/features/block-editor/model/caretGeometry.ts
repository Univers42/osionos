/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caretGeometry.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure DOM caret/line geometry shared by vertical-arrow navigation
 * (`playgroundBlockEditor.helpers.ts`) and caret placement (`blockDomFocus.ts`).
 * No selection mutation, no app imports — just measurement of the live DOM.
 */

/** Which visual line a caret at a soft-wrap boundary is attributed to. */
export type CaretAffinity = "first" | "last";

/**
 * The caret's client rect for the given wrap affinity. A collapsed range at a
 * soft-wrap boundary has TWO client rects (end of line N, start of line N+1):
 * ArrowUp asks for the FIRST (upper) rect, ArrowDown the LAST (lower) rect, so
 * the caret is attributed to the visual line it is really on. Falls back to the
 * bounding rect on a truly empty line (where `getClientRects()` is empty).
 */
export function caretRect(range: Range, affinity: CaretAffinity = "first"): DOMRect | null {
  const rects = range.getClientRects();
  if (rects.length > 0) {
    return affinity === "last" ? rects[rects.length - 1] : rects[0];
  }
  const rect = range.getBoundingClientRect();
  if (rect.width || rect.height || rect.top) return rect;
  // Element-boundary caret (an empty block, or offset 0 before the first text
  // node): the collapsed range has no client rects AND a degenerate bounding
  // rect. Common on a VIRTUALIZED page, where the range — but not its element —
  // loses its box. Fall back to the caret container's own rect so edge detection
  // still fires. Without this, caretOnEdgeLine fails closed → the caret is
  // stranded (native arrow movement can't cross the virtualizer's absolutely
  // positioned rows), which is the "stuck in its own block" bug on long pages.
  const node = range.startContainer;
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const elRect = el?.getBoundingClientRect();
  return elRect && (elRect.width || elRect.height || elRect.top) ? elRect : null;
}

/**
 * The block's visual lines as merged vertical bands, in viewport coords — one
 * band per wrapped line. A Range over the block's contents yields one client
 * rect per inline fragment; fragments that overlap vertically (>1px, so
 * tightly stacked lines never fuse) belong to the same line. Tall inline
 * atoms (page chips, emoji images) overlap their line's text rects and merge
 * into its band, so edge detection is immune to their extra height. `null` =
 * not laid out; `[]` = a block with no content rects (empty single-line
 * block), for which any caret is on both the first and last line.
 */
export function visualLineBands(
  blockEl: Element,
): { top: number; bottom: number }[] | null {
  const probe = document.createRange();
  probe.selectNodeContents(blockEl);
  const rects = Array.from(probe.getClientRects())
    .filter((rect) => rect.height > 0 || rect.width > 0)
    .sort((a, b) => a.top - b.top);
  if (rects.length === 0) {
    return blockEl.getClientRects().length === 0 ? null : [];
  }
  const bands: { top: number; bottom: number }[] = [];
  for (const rect of rects) {
    const last = bands[bands.length - 1];
    if (last && rect.top < last.bottom - 1) {
      if (rect.bottom > last.bottom) last.bottom = rect.bottom;
    } else {
      bands.push({ top: rect.top, bottom: rect.bottom });
    }
  }
  return bands;
}

/**
 * Whether the collapsed caret sits on the block's first ("first") or last
 * ("last") *visual* line — the gate for leaving the block in one arrow press (a
 * single-line block always qualifies). The caret belongs to the edge line when
 * its center falls inside that line's band. Conservative on failure: an
 * unmeasurable caret or a not-laid-out block returns `false` (do the native
 * in-block move), so navigation NEVER spuriously jumps mid-block.
 */
export function caretOnEdgeLine(blockEl: Element, range: Range, edge: CaretAffinity): boolean {
  const caret = caretRect(range, edge);
  const bands = visualLineBands(blockEl);
  if (!caret || bands === null) return false;
  if (bands.length === 0) return true;
  const band = edge === "first" ? bands[0] : bands[bands.length - 1];
  const centerY = (caret.top + caret.bottom) / 2;
  return centerY >= band.top - 2 && centerY <= band.bottom + 2;
}

/**
 * Whether the collapsed caret sits at the very start / end of `editable`'s text
 * — the gate for crossing into the previous / next block horizontally (ArrowLeft
 * at the start, ArrowRight at the end). Measures the text before/after the caret
 * (empty ⇒ at that edge), so an empty block reads as BOTH edges. Conservative on
 * a foreign range (caret not inside `editable`): neither edge, so the caret does
 * the native in-block move instead of spuriously jumping.
 */
export function caretAtBlockEdge(
  editable: Element,
  range: Range,
): { atStart: boolean; atEnd: boolean } {
  if (!editable.contains(range.startContainer)) return { atStart: false, atEnd: false };
  const before = document.createRange();
  before.selectNodeContents(editable);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(editable);
  after.setStart(range.endContainer, range.endOffset);
  return {
    atStart: before.toString().length === 0,
    atEnd: after.toString().length === 0,
  };
}

/** Cross-browser caret hit-test at a viewport point (Blink/WebKit vs Firefox). */
export function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === "function") return doc.caretRangeFromPoint(x, y);
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  return range;
}

/**
 * A caret Range at goal column `x` on the target's first/last visual line. The
 * goal column is tried first at three vertical samples across the line; only if
 * all miss does it nudge `x` to the line edges, so a near-miss (empty span,
 * sub-pixel gap) still lands inside `target` instead of dropping the column.
 * Returns null when every sample lands outside the target.
 */
export function hitTestCaretRange(
  target: HTMLElement,
  edge: CaretAffinity,
  x: number,
): Range | null {
  const rect = target.getBoundingClientRect();
  if (!rect.height) return null;
  const style = getComputedStyle(target);
  const line = Math.min(Number.parseFloat(style.lineHeight) || rect.height, rect.height);
  const lineTop =
    edge === "first"
      ? rect.top + (Number.parseFloat(style.paddingTop) || 0)
      : rect.bottom - (Number.parseFloat(style.paddingBottom) || 0) - line;
  const ys = [lineTop + line / 2, lineTop + 2, lineTop + line - 2];
  const goalX = Math.min(Math.max(x, rect.left + 1), rect.right - 1);
  for (const px of [goalX, rect.left + 1, rect.right - 1]) {
    for (const y of ys) {
      const range = caretRangeFromPoint(px, y);
      if (range && target.contains(range.startContainer)) return range;
    }
  }
  return null;
}
