/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   resolveLayout.ts                                    :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { CanvasFrame, CanvasGridConfig } from "./types";

// Frames are authored in a fixed canvas coordinate space whose width is the
// grid's natural width (columns * columnWidth + gaps). The stage renders them
// through a single horizontal scale factor so the layout stays as fluid as
// the legacy CSS grid; vertical distances are 1:1 (rows are fixed-height px
// in both implementations).

export function canvasContentWidth(config: CanvasGridConfig): number {
  return config.columns * config.columnWidth + Math.max(0, config.columns - 1) * config.columnGap;
}

export function computeScaleX(containerWidth: number, config: CanvasGridConfig): number {
  return Math.max(0.05, containerWidth / Math.max(1, canvasContentWidth(config)));
}

/** Convert a pointer delta in screen px to canvas frame space. */
export function screenDeltaToFrame(delta: { x: number; y: number }, scaleX: number): { x: number; y: number } {
  return { x: delta.x / Math.max(scaleX, 0.01), y: delta.y };
}

export function gridStep(config: CanvasGridConfig): { x: number; y: number } {
  return { x: config.columnWidth + config.columnGap, y: config.rowHeight + config.rowGap };
}

/** Snap position to grid lines and size to whole column/row spans (clamped inside the columns). */
export function snapFrameToGrid(frame: CanvasFrame, config: CanvasGridConfig): CanvasFrame {
  const step = gridStep(config);
  const colSpan = Math.max(1, Math.min(config.columns, Math.round((frame.width + config.columnGap) / step.x)));
  const rowSpan = Math.max(1, Math.round((frame.height + config.rowGap) / step.y));
  const maxX = Math.max(0, (config.columns - colSpan) * step.x);
  return {
    x: Math.min(maxX, Math.max(0, Math.round(frame.x / step.x) * step.x)),
    y: Math.max(0, Math.round(frame.y / step.y) * step.y),
    width: colSpan * config.columnWidth + Math.max(0, colSpan - 1) * config.columnGap,
    height: rowSpan * config.rowHeight + Math.max(0, rowSpan - 1) * config.rowGap,
  };
}
