import type { CSSProperties } from "react";

/** The eight grips of a resizable block. */
export type ResizeEdge =
  | "top" | "right" | "bottom" | "left"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface BoxSize {
  width: number;
  height: number;
}

export interface ResizeLimits {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function horizontalSign(edge: ResizeEdge): number {
  if (edge.endsWith("right")) return 1;
  return edge.endsWith("left") ? -1 : 0;
}

function verticalSign(edge: ResizeEdge): number {
  if (edge.startsWith("bottom")) return 1;
  return edge.startsWith("top") ? -1 : 0;
}

/** The size after dragging `edge` by `delta` px. The block is centred in its column, so a
 *  side edge moves both sides at once: the width changes by twice the drag. The top edge
 *  grows the block when dragged up, the bottom edge when dragged down. Whole px, clamped. */
export function resizedBox(start: BoxSize, edge: ResizeEdge, delta: { x: number; y: number }, limits: ResizeLimits): BoxSize {
  const x = horizontalSign(edge);
  const y = verticalSign(edge);
  return {
    width: x === 0 ? start.width : clamp(Math.round(start.width + 2 * x * delta.x), limits.minWidth, limits.maxWidth),
    height: y === 0 ? start.height : clamp(Math.round(start.height + y * delta.y), limits.minHeight, limits.maxHeight),
  };
}

/** Room the pane keeps on each side of a block that breaks out of its column: the block's
 *  drag handle (28 px left of it) and the 8 px grips stay inside the pane. */
export const BREAKOUT_GUTTER = 32;

/** The widest a block may grow in a pane `paneWidth` px wide. */
export function availableWidth(paneWidth: number): number {
  return Math.max(0, paneWidth - 2 * BREAKOUT_GUTTER);
}

/** The padding of the band that scrolls a block wider than the pane: room for its 8 px grips. */
export const BREAKOUT_BAND_PADDING = 12;

/** The drag limits for a block in a column `column` px wide inside a pane offering
 *  `available` px: it may grow past the column up to the pane, and its minimum gives way to a
 *  narrow window so the block still fits. */
export function resizeLimits(input: {
  column: number; available: number; current?: number; minWidth: number; minHeight: number; maxHeight?: number;
}): ResizeLimits {
  // A stored width the pane cannot hold (set in a wider window) is never snapped smaller.
  const maxWidth = Math.max(input.column, input.available, input.current ?? 0);
  return {
    minWidth: Math.min(input.minWidth, input.column, maxWidth),
    maxWidth,
    minHeight: input.minHeight,
    maxHeight: input.maxHeight ?? Infinity,
  };
}

/** A width in px as the share of its column that `mediaWidth` stores: one decimal, above 100
 *  for a block wider than its column.
 *  Caveat: the decimal drops up to 0.05 % of the column (0.45 px at 900 px), so a reload can
 *  land a fraction of a pixel off the released width. */
export function widthPercentOf(widthPx: number, columnPx: number): number {
  if (columnPx <= 0) return 100;
  return Math.max(0.1, Math.round((widthPx / columnPx) * 1000) / 10);
}

/** Where a block wider than its column sits, in px: `offset` is the left margin that centres
 *  it on the column (negative: it grows into both margins). One the pane cannot hold keeps its
 *  width and `scrolls` in a pane-wide band instead of being clipped. Null for a share of 100 %
 *  or less, which `blockWidthStyle` lays out in CSS alone. */
export function breakoutBox(input: { percent: number | undefined; column: number; available: number; minWidth: number }): { width: number; offset: number; scrolls: boolean } | null {
  const { percent, column, available, minWidth } = input;
  if (percent === undefined || !Number.isFinite(percent) || percent <= 100 || column <= 0) return null;
  const width = Math.round(Math.max(minWidth, (percent / 100) * column));
  if (width > available) return { width, offset: 0, scrolls: true };
  return { width, offset: Math.round((column - width) / 2), scrolls: false };
}

/** The centred width of a block that stores `percent` of its column; `minWidth` px is the
 *  floor and the column the ceiling. A full or unset width styles nothing: the block keeps
 *  its own default layout. */
export function blockWidthStyle(percent: number | undefined, minWidth: number): CSSProperties {
  if (percent === undefined || !Number.isFinite(percent) || percent >= 100) return {};
  return { width: `max(${minWidth}px, ${percent}%)`, maxWidth: "100%", marginInline: "auto" };
}

/** The inline styles of a resizable block: the frame (the block's own box) and, for a block
 *  wider than the pane, the band around it that scrolls. Up to 100 % (or before the column is
 *  measured) the frame is today's pure-CSS width and there is no band. */
export function breakoutStyles(input: { percent: number | undefined; minWidth: number; column: number; available: number }): {
  frame: CSSProperties; band: CSSProperties | undefined;
} {
  const box = breakoutBox(input);
  if (box === null) return { frame: blockWidthStyle(input.percent, input.minWidth), band: undefined };
  const margin = `${box.offset}px`;
  const frame: CSSProperties = { width: `${box.width}px`, maxWidth: "none", marginLeft: margin, marginRight: margin };
  if (!box.scrolls) return { frame, band: undefined };
  const spare = input.column - input.available;
  const left = Math.floor(spare / 2);
  return {
    frame,
    band: {
      width: `${input.available}px`, marginLeft: `${left}px`, marginRight: `${spare - left}px`, overflowX: "auto",
      padding: `${BREAKOUT_BAND_PADDING}px`, boxSizing: "border-box",
    },
  };
}
