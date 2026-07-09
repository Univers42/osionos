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
 * Top of the block's first visual line and bottom of its last, in viewport
 * coords. A Range over the block's contents yields one client rect per wrapped
 * line — content boxes that exclude padding, so they align with the caret rect.
 * `empty` flags a block with no content rects (an empty single-line block), for
 * which any caret is on both the first and last line. `null` = not laid out.
 */
export function visualLineBounds(
  blockEl: Element,
): { top: number; bottom: number; empty: boolean } | null {
  const probe = document.createRange();
  probe.selectNodeContents(blockEl);
  const rects = probe.getClientRects();
  if (rects.length === 0) {
    const box = blockEl.getClientRects();
    if (box.length === 0) return null;
    return { top: box[0].top, bottom: box[box.length - 1].bottom, empty: true };
  }
  let top = rects[0].top;
  let bottom = rects[0].bottom;
  for (let i = 1; i < rects.length; i += 1) {
    if (rects[i].top < top) top = rects[i].top;
    if (rects[i].bottom > bottom) bottom = rects[i].bottom;
  }
  return { top, bottom, empty: false };
}

/**
 * Whether the collapsed caret sits on the block's first ("first") or last
 * ("last") *visual* line — the gate for leaving the block in one arrow press (a
 * single-line block always qualifies). Conservative on failure: an unmeasurable
 * caret or a not-laid-out block returns `false` (do the native in-block move),
 * so navigation NEVER spuriously jumps mid-block.
 */
export function caretOnEdgeLine(blockEl: Element, range: Range, edge: CaretAffinity): boolean {
  const caret = caretRect(range, edge);
  const bounds = visualLineBounds(blockEl);
  if (!caret || !bounds) return false;
  if (bounds.empty) return true;
  const lineHeight =
    caret.height || Number.parseFloat(getComputedStyle(blockEl).lineHeight) || 20;
  const epsilon = Math.max(lineHeight * 0.5, 2);
  return edge === "first"
    ? caret.top <= bounds.top + epsilon
    : caret.bottom >= bounds.bottom - epsilon;
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
