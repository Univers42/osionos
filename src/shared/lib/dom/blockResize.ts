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

/** The drag limits inside a column `column` px wide: never wider than it, and a minimum
 *  that gives way to it, so a narrow window still fits the block. */
export function resizeLimits(input: { column: number; minWidth: number; minHeight: number; maxHeight?: number }): ResizeLimits {
  return {
    minWidth: Math.min(input.minWidth, input.column),
    maxWidth: input.column,
    minHeight: input.minHeight,
    maxHeight: input.maxHeight ?? Infinity,
  };
}

/** A width in px as the share of its column that `mediaWidth` stores: one decimal, in (0, 100].
 *  Caveat: the decimal drops up to 0.05 % of the column (0.45 px at 900 px), so a reload can
 *  land a fraction of a pixel off the released width. */
export function widthPercentOf(widthPx: number, columnPx: number): number {
  if (columnPx <= 0) return 100;
  return clamp(Math.round((widthPx / columnPx) * 1000) / 10, 0.1, 100);
}

/** The centred width of a block that stores `percent` of its column; `minWidth` px is the
 *  floor and the column the ceiling. A full or unset width styles nothing: the block keeps
 *  its own default layout. */
export function blockWidthStyle(percent: number | undefined, minWidth: number): CSSProperties {
  if (percent === undefined || !Number.isFinite(percent) || percent >= 100) return {};
  return { width: `max(${minWidth}px, ${percent}%)`, maxWidth: "100%", marginInline: "auto" };
}
