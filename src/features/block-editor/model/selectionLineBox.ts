/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   selectionLineBox.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// Geometry of the tints a cross-block text drag paints. A Range reports the glyph
// box of a text fragment (20 px at the 26 px line height) while the native
// highlight of the anchor block fills the whole line box, so a tint taken from the
// rect as-is sat shorter than the highlight beside it. Here each rect is grown
// symmetrically to the line box, which keeps it centred on the text.
// Caveat: the line box is read from the computed `line-height`; with `normal` or a
// unitless value that does not resolve to px the rect is left as measured.

import { toOnScreenPx } from "@/shared/lib/dom/cssZoom";

export interface TintRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A client rect grown to the leaf's line box, centred on the rect. */
export function lineBoxRect(rect: DOMRect, leaf: HTMLElement): TintRect {
  const lineHeight = toOnScreenPx(Number.parseFloat(getComputedStyle(leaf).lineHeight), leaf);
  const grow = Number.isFinite(lineHeight) ? Math.max(0, lineHeight - rect.height) : 0;
  return { left: rect.left, top: rect.top - grow / 2, width: rect.width, height: rect.height + grow };
}

/** The line-box rects of a range inside a leaf, in viewport px. */
export function lineBoxRects(range: Range, leaf: HTMLElement): TintRect[] {
  return Array.from(range.getClientRects(), (rect) => lineBoxRect(rect, leaf));
}

/** An empty block has no text to select; the drag still covers its line. */
export function isBlankLeaf(leaf: HTMLElement): boolean {
  return (leaf.textContent ?? "") === "";
}
