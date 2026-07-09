/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   coverPositionMath.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure math for the page-cover vertical reposition tool. A cover image is drawn
// with `object-fit: cover`, so when it is taller than its frame only a vertical
// slice shows; this value is the CSS `object-position: center <n>%` focal point.
// No React, no DOM — unit-tested in tests/canvas/cover-position.test.ts.

/** Centered focal point — the default when a page has never been repositioned. */
export const DEFAULT_COVER_POSITION = 50;

/** Clamp any number to a valid 0–100 focal percentage (non-finite → default). */
export function clampCoverPosition(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COVER_POSITION;
  return Math.max(0, Math.min(100, value));
}

/** New focal % after dragging the cover by `deltaY` px (DOM down-positive) inside
 *  a frame `height` px tall. Dragging DOWN reveals the top of the image (→ 0),
 *  dragging UP reveals the bottom (→ 100); a full-height drag sweeps the whole
 *  range. A zero/negative height leaves the position unchanged. */
export function nextCoverPosition(startPosition: number, deltaY: number, height: number): number {
  if (height <= 0) return clampCoverPosition(startPosition);
  return clampCoverPosition(startPosition - (deltaY / height) * 100);
}
